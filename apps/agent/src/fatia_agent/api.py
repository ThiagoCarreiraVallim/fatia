"""Superfície HTTP do agente.

Duas rotas de diagnóstico (`/health`, `/capabilities`) e duas de inferência:
`/recognize-meal` (#139) e `/chat` (#248). O que a superfície estabelece é o
**contrato de erro**: todo `AIProviderError`, todo `McpError` e todo corpo
inválido viram um envelope `{"error": {"code", "message"}}` com um `code`
estável, que é o que o NestJS traduz para o cliente cair no caminho manual.

No `/chat` isso vale para **toda** recusa anterior ao primeiro byte, sem
exceção — foi a promessa que a #248 escreveu e não cumpriu em dois caminhos (a
credencial do agente e a validação do corpo, que saíam como `{"detail": ...}`).
As recusas de formato de imagem do `/recognize-meal` continuam como
`HTTPException`: são o contrato da #139, e o NestJS as traduz por status.

As duas rotas de inferência são autenticadas por segredo compartilhado com o
`apps/api` — ver `settings.agent_auth_unavailable_reason`. É a fronteira de
custo: rota que dispara inferência paga não pode ser anônima (ADR 018).

**A identidade do usuário é exigência de uma rota e ausência deliberada na
outra**, e a diferença é o que cada uma precisa alcançar:

- `/recognize-meal` **não** recebe identidade. Ela olha uma foto e devolve
  candidatos; não fala com o banco nem com o `/mcp`. Um Bearer de usuário ali só
  aumentaria o estrago de um comprometimento, sem comprar nada.
- `/chat` **exige** o Bearer do usuário, e o encaminha ao `/mcp`. É a inversão
  registrada na ADR 021, e ela não é conveniência: é a única forma de o agente
  alcançar dado sem ganhar credencial de banco — o que criaria um **segundo**
  ponto de isolamento por `userId`, num serviço em outra linguagem e sem os
  testes que protegem o primeiro (ADR 010 e ADR 015).

Até a #248, este docstring afirmava que o agente não recebia identidade de
usuário, ponto. A frase valia para a única rota que existia; virou meia verdade
no dia em que o chat entrou, e doc que contradiz o código é defeito.
"""

import base64
import binascii
import secrets
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import __version__
from .allowed_models import unreviewed_host_reason, unreviewed_models, usable_models
from .chat import build_mcp_client, somente_leitura, stream_chat_events
from .chat.errors import (
    McpError,
    McpNotConfigured,
    McpRefused,
    McpTimeout,
    McpUnauthenticated,
    McpUnauthorized,
    McpUnreachable,
)
from .chat.graph import MAX_CARACTERES_POR_MENSAGEM
from .providers import build_provider
from .providers.errors import (
    AgentKeyRejected,
    AIEndpointNotAllowed,
    AIModelNotAllowed,
    AIProviderError,
    AIProviderNotConfigured,
    AIProviderRefused,
    AIProviderTimeout,
)
from .recognition import MEDIA_TYPES_ACEITOS, recognize_meal
from .schemas.recognized_meal import RecognizedMeal
from .settings import (
    AgentSettings,
    agent_auth_unavailable_reason,
    ai_unavailable_reason,
    endpoint_host,
)

# Teto do lado do agente. O `apps/api` já corta antes (é ele quem fala com o
# aparelho), mas quem gasta a inferência é este serviço, e um teto que só existe
# no chamador não é teto.
MAX_IMAGEM_BYTES = 4 * 1024 * 1024


class RecognizeMealRequest(BaseModel):
    """Foto em base64. **Nenhum campo de identidade** — ver o docstring do módulo."""

    model_config = {"extra": "forbid"}

    image_base64: str = Field(min_length=1)
    media_type: str = "image/jpeg"


class ChatMessage(BaseModel):
    """Uma mensagem já trocada. Quem persiste é o NestJS (sub-issue 2/3 da #247).

    **Sem teto de tamanho aqui**, ao contrário de `message`: o histórico carrega
    a resposta do modelo, e o tamanho dela não é de ninguém. Quem limita é o
    grafo, cortando na montagem do prompt — ver `MAX_CARACTERES_POR_MENSAGEM`.
    """

    model_config = {"extra": "forbid"}

    role: Annotated[str, Field(pattern="^(user|assistant)$")]
    content: Annotated[str, Field(min_length=1)]


class ChatRequest(BaseModel):
    """A mensagem de agora e o histórico. **Nenhum campo de identidade.**

    O Bearer vem no header `Authorization`, e não no corpo: `extra: "forbid"`
    recusa qualquer campo inventado, e um token no corpo acabaria em log de
    requisição, em relatório de validação e no histórico que o NestJS persiste —
    exatamente os três lugares onde ele não pode estar (ADR 021).

    Só `message` tem teto duro, e ele é 422: a pessoa acabou de escrever, está
    olhando para o campo, e o cliente sabe contar caracteres antes de enviar. O
    histórico é cortado em silêncio pelo grafo, porque recusá-lo mataria a
    conversa por algo que quem está conversando não pode consertar.
    """

    model_config = {"extra": "forbid"}

    message: Annotated[str, Field(min_length=1, max_length=MAX_CARACTERES_POR_MENSAGEM)]
    history: Annotated[list[ChatMessage], Field(default_factory=list)]


# 503: falta configuração nossa. 504: o provedor demorou. 502: o provedor
# respondeu, mas mal. Todos são "tente de novo ou registre manualmente".
_STATUS_BY_ERROR: dict[type[AIProviderError], int] = {
    AIProviderNotConfigured: 503,
    # 401, e não 503: quem chamou **tem** como consertar — mandando a chave
    # combinada. É o `apps/api` provando que é ele (ADR 018).
    AgentKeyRejected: 401,
    # Também 503, e também "configuração nossa": o modelo apontado, ou o host
    # para onde os bytes iriam, não passou por revisão de privacidade. O `code`
    # é que separa os três para quem opera — são três correções diferentes.
    AIModelNotAllowed: 503,
    AIEndpointNotAllowed: 503,
    AIProviderTimeout: 504,
    AIProviderRefused: 502,
}

# Mesmo envelope, outra dependência. 401 quando o problema é o token de quem
# chamou (dele, e resolvível por login); 503 quando é configuração nossa; 504 no
# tempo; 502 quando o nosso próprio `/mcp` respondeu mal.
_STATUS_BY_MCP_ERROR: dict[type[McpError], int] = {
    McpUnauthenticated: 401,
    McpUnauthorized: 401,
    McpNotConfigured: 503,
    McpTimeout: 504,
    McpUnreachable: 502,
    McpRefused: 502,
}


def create_app(settings: AgentSettings | None = None) -> FastAPI:
    resolved = settings if settings is not None else AgentSettings()
    app = FastAPI(title="Fatia Agent", version=__version__)

    @app.exception_handler(AIProviderError)
    async def _ai_error_handler(_request: Request, exc: AIProviderError) -> JSONResponse:
        status = next(
            (code for kind, code in _STATUS_BY_ERROR.items() if isinstance(exc, kind)), 502
        )
        return JSONResponse(
            status_code=status,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(McpError)
    async def _mcp_error_handler(_request: Request, exc: McpError) -> JSONResponse:
        """Handler próprio, e não um `except` compartilhado com o do provedor.

        As duas famílias não herdam uma da outra de propósito (ver
        `chat/errors.py`): tratar um 401 do nosso `/mcp` como "o provedor de IA
        está fora do ar" mandaria quem opera olhar o gateway quando o problema é
        o token de quem está conversando.
        """
        status = next(
            (code for kind, code in _STATUS_BY_MCP_ERROR.items() if isinstance(exc, kind)), 502
        )
        return JSONResponse(
            status_code=status,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(RequestValidationError)
    async def _validacao_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        """Corpo inválido no mesmo envelope — e **sem o corpo recusado dentro**.

        O default do FastAPI devolve `{"detail": [...]}`, e cada item traz um
        campo `input` com o valor que ele recusou. Num chat, esse valor é a
        conversa: o corpo do 422 devolvia o histórico inteiro, verbatim, para o
        NestJS ler e provavelmente logar. Isso é dado de saúde
        (`docs/DATA_RETENTION.md`) num lugar que nenhum documento descreve — a
        #214 de novo, por outra porta.

        Sai `loc` (qual campo) e `msg` (qual regra), que é o que quem chamou
        precisa para corrigir. Nada de `input` e nada de `ctx`.
        """
        problemas = [
            f"{'.'.join(str(parte) for parte in erro.get('loc', ()))}: {erro.get('msg', '')}"
            for erro in exc.errors()
        ]
        # Um corpo com 40 mensagens erradas geraria 40 linhas; quem conserta lê
        # as primeiras e o resto é a mesma coisa.
        resumo = "; ".join(problemas[:3])
        if len(problemas) > 3:
            resumo += f" (e mais {len(problemas) - 3})"
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "INVALID_REQUEST",
                    "message": f"O corpo da requisição não é válido — {resumo}.",
                }
            },
        )

    @app.get("/health")
    async def health() -> dict[str, object]:
        """Sempre 200 — inclusive sem provedor configurado.

        O agente sem IA é um serviço saudável que não faz inferência, não um
        serviço quebrado: o produto inteiro continua funcionando pelo caminho
        manual. Um /health vermelho aqui faria o orquestrador reiniciar em loop
        um container que está exatamente como deveria.
        """
        reason = ai_unavailable_reason(resolved)
        return {
            "status": "ok",
            "version": __version__,
            "ai": {
                "configured": reason is None,
                "reason": reason,
                # Por que o destino recusa, quando recusa. Separado de
                # `unreviewed_models` porque é um fato só, não um por
                # capacidade: se o host não passou pela revisão, nenhuma
                # capacidade envia nada, por melhor que seja o nome do modelo.
                "unreviewed_host": unreviewed_host_reason(resolved.ai_base_url),
                # Capacidade → por que o modelo dela recusa. Aparece aqui para o
                # operador ver a recusa antes do primeiro 503 de um usuário: a
                # troca de `AI_MODEL_*` no painel é silenciosa por natureza.
                "unreviewed_models": unreviewed_models(resolved),
            },
        }

    @app.get("/capabilities")
    async def capabilities() -> dict[str, object]:
        """Quais capacidades estão atendidas e por qual modelo.

        Levanta `AIProviderNotConfigured` quando o provedor não pode ser montado
        — é a degradação explícita da ADR 015, com código e mensagem acionável.
        """
        build_provider(resolved)
        return {
            # Só o host: a rota é anônima e o path de um gateway carrega id de
            # conta e nome do gateway. Ver `settings.endpoint_host`.
            "provider_host": endpoint_host(resolved.ai_base_url),
            # Modelo não revisado sai como ausente, não como configurado: a rota
            # anuncia o que a próxima chamada vai aceitar. Anunciar um modelo que
            # `_require_model` recusaria faria o erro aparecer longe da causa.
            # Transcrição chega com #141; ver providers/base.py.
            "capabilities": usable_models(resolved),
        }

    @app.post("/recognize-meal")
    async def recognize_meal_route(
        payload: RecognizeMealRequest,
        x_fatia_agent_key: Annotated[str | None, Header()] = None,
    ) -> RecognizedMeal:
        """Foto de refeição → alimentos candidatos (#139).

        **Não grava nada e não devolve refeição.** O que sai daqui é sugestão: a
        gravação continua sendo o caminho manual do `apps/api`, que é o que faz da
        tela de confirmação a única forma de registrar, e não uma disciplina.

        A imagem vive em memória e morre com a requisição — ADR 004.
        """
        _exigir_credencial(resolved, x_fatia_agent_key)

        if payload.media_type not in MEDIA_TYPES_ACEITOS:
            raise HTTPException(
                status_code=415,
                detail=(
                    f"media_type '{payload.media_type}' não é aceito. "
                    f"Use um de: {', '.join(sorted(MEDIA_TYPES_ACEITOS))}."
                ),
            )

        try:
            # `validate=True`: sem isso o base64 do Python **ignora** caractere
            # inválido em silêncio, e uma foto corrompida no caminho viraria bytes
            # truncados que o provedor recusa com um 400 sem explicação.
            imagem = base64.b64decode(payload.image_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"image_base64 inválido: {exc}") from exc

        if not imagem:
            raise HTTPException(status_code=400, detail="image_base64 decodificou para zero bytes.")
        if len(imagem) > MAX_IMAGEM_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"A imagem tem {len(imagem)} bytes e o limite é {MAX_IMAGEM_BYTES}. "
                    "Reduza a resolução no aparelho."
                ),
            )

        provider = build_provider(resolved)
        try:
            return await recognize_meal(provider, imagem, media_type=payload.media_type)
        finally:
            await provider.aclose()

    @app.post("/chat")
    async def chat_route(
        payload: ChatRequest,
        x_fatia_agent_key: Annotated[str | None, Header()] = None,
        authorization: Annotated[str | None, Header()] = None,
    ) -> StreamingResponse:
        """Conversa com as ferramentas de leitura do `/mcp`, em SSE (#248).

        **Duas credenciais, dois papéis.** `X-Fatia-Agent-Key` responde "esta
        chamada pode gastar inferência paga?" (ADR 018) — é o `apps/api` provando
        que é ele. `Authorization: Bearer` responde "em nome de quem?" e é
        repassado inteiro ao `/mcp`, que é quem filtra por `userId`. Nenhuma das
        duas substitui a outra: sem a primeira, a rota é proxy aberto para o
        gateway; sem a segunda, não há dado a alcançar.

        **O que falha antes do primeiro byte falha com status.** Provedor não
        configurado, Bearer ausente, `/mcp` recusando o token no `tools/list` —
        tudo isso acontece aqui, antes do `StreamingResponse`, e sai como
        envelope JSON com o status certo. Depois que o stream abre, o 200 já foi
        enviado e o erro só cabe como evento `error` — ver `chat/events.py`.
        """
        _exigir_credencial(resolved, x_fatia_agent_key)
        bearer = _exigir_bearer(authorization)

        provider = build_provider(resolved)
        client = build_mcp_client(resolved, bearer=bearer)

        try:
            # O catálogo é buscado **antes** de abrir o stream de propósito: é a
            # primeira chamada que exercita o Bearer, e é a única chance de um
            # token inválido virar 401 de verdade em vez de um 200 com um evento
            # de erro dentro — que é o que o PWA teria de aprender a distinguir.
            permitidas = somente_leitura(await client.list_tools())
        except BaseException:
            await client.aclose()
            await provider.aclose()
            raise

        async def fluxo() -> AsyncIterator[str]:
            try:
                async for evento in stream_chat_events(
                    provider,
                    client,
                    permitidas,
                    mensagem=payload.message,
                    historico=[mensagem.model_dump() for mensagem in payload.history],
                ):
                    yield evento.frame()
            finally:
                # `finally`, e não depois do laço: quando o cliente desconecta no
                # meio, o gerador é fechado com `GeneratorExit` e o laço nunca
                # termina — sem isto, cada aba fechada deixaria dois clientes
                # httpx e as conexões deles pendurados.
                await client.aclose()
                await provider.aclose()

        return StreamingResponse(
            fluxo(),
            media_type="text/event-stream",
            headers={
                # Sem isto, um proxy que bufferize entrega a conversa inteira de
                # uma vez e o trabalho das outras duas camadas da #247 se perde:
                # o chat parece travado até a última palavra chegar.
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    return app


def _exigir_credencial(settings: AgentSettings, oferecida: str | None) -> None:
    """401 quando a rota de inferência exige segredo e ele não veio (ou veio errado)."""
    motivo = agent_auth_unavailable_reason(settings)
    if motivo is not None:
        # 503 e não 401: quem chamou não tem como consertar mandando outra coisa.
        # É configuração nossa faltando, que é o que `AIProviderNotConfigured`
        # significa em todo o resto do serviço.
        raise AIProviderNotConfigured(motivo)

    esperada = settings.agent_api_key.strip()
    if not esperada:
        # Endpoint local: inferência de graça, sem segredo a exigir.
        return

    if not oferecida or not secrets.compare_digest(oferecida.strip(), esperada):
        # Erro nomeado, e não `HTTPException`: o `{"detail": "..."}` que ela
        # produz é um segundo formato de erro, e quem lê o outro lado teria de
        # conhecer os dois. Ver `AgentKeyRejected`.
        raise AgentKeyRejected(
            "A chamada não trouxe o 'X-Fatia-Agent-Key' combinado com o apps/api. "
            "Rota de inferência sem essa prova é um proxy aberto para o gateway pago "
            "(ADR 018)."
        )


def _exigir_bearer(authorization: str | None) -> str:
    """Extrai o token do header, ou recusa com erro nomeado.

    Erro nomeado e não `HTTPException` crua: o NestJS trata o `/chat` pelo mesmo
    envelope `{"error": {"code", "message"}}` que trata todo o resto, e um
    `{"detail": "..."}` no meio obrigaria o outro lado a conhecer dois formatos.

    **A mensagem não cita o valor recebido.** Header malformado costuma ser um
    token quase certo — e ecoá-lo o gravaria no log de quem chamou, que é a
    forma mais boba de reintroduzir a #214.
    """
    if authorization is None:
        raise McpUnauthenticated(
            "A rota de chat exige 'Authorization: Bearer <token do usuário>'. O agente age em "
            "nome de alguém e alcança dado só pelo /mcp, com o token de quem está conversando "
            "(ADR 021) — sem ele não há conversa a ter."
        )

    esquema, _, token = authorization.partition(" ")
    if esquema.lower() != "bearer" or not token.strip():
        raise McpUnauthenticated("O header 'Authorization' não está no formato 'Bearer <token>'.")
    return token.strip()


# `uvicorn fatia_agent.api:app`
app = create_app()

__all__: list[str] = ["app", "create_app"]
