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
import json
import secrets
import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import UUID4, BaseModel, Field, model_validator

from . import __version__
from .allowed_models import unreviewed_host_reason, unreviewed_models, usable_models
from .chat import (
    Checkpointer,
    ContextoDoTurno,
    GrafoDaConversa,
    McpClient,
    build_mcp_client,
    interrupcao_pendente,
    montar_grafo,
    stream_chat_events,
    thread_da_conversa,
    todas_permitidas,
)
from .chat.errors import (
    McpError,
    McpNotConfigured,
    McpRefused,
    McpResponseUnparseable,
    McpTimeout,
    McpUnauthenticated,
    McpUnauthorized,
    McpUnreachable,
)
from .chat.graph import MAX_CARACTERES_POR_MENSAGEM
from .chat.state import FotoDoTurno
from .chat.titulo import gerar_titulo
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


class TitleRequest(BaseModel):
    """A primeira mensagem de uma conversa. Sem identidade: é só texto a nomear."""

    model_config = {"extra": "forbid"}

    text: Annotated[str, Field(min_length=1, max_length=MAX_CARACTERES_POR_MENSAGEM)]


class ChatMessage(BaseModel):
    """Uma fala já gravada pelo `apps/api`, para semear uma thread fria.

    **Sem teto de tamanho aqui**, ao contrário de `message`: o histórico carrega
    a resposta do modelo, e o tamanho dela não é de ninguém. Quem limita é o
    grafo, cortando na montagem do prompt — ver `MAX_CARACTERES_POR_MENSAGEM`.
    """

    model_config = {"extra": "forbid"}

    role: Annotated[str, Field(pattern="^(user|assistant)$")]
    content: Annotated[str, Field(min_length=1)]


class ChatMemory(BaseModel):
    """Uma anotação que a pessoa pediu para o assistente lembrar (`UserMemory`)."""

    model_config = {"extra": "forbid"}

    id: Annotated[str, Field(min_length=1, max_length=64)]
    content: Annotated[str, Field(min_length=1, max_length=500)]


MAX_FOTOS_POR_MENSAGEM = 3

# O ditado é curto por natureza: dois minutos de opus mal passam de 1 MB. O teto
# é de bytes porque a duração só se sabe depois de pagar a transcrição.
MAX_AUDIO_BYTES = 4 * 1024 * 1024
AUDIO_ACEITO = frozenset(
    {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a"}
)


class ChatPhoto(BaseModel):
    """Uma foto do turno, em base64, **já sem EXIF** — removido no aparelho (ADR 020)."""

    model_config = {"extra": "forbid", "populate_by_name": True}

    media_type: Annotated[str, Field(alias="mediaType")]
    data: Annotated[str, Field(min_length=1)]


class ChatResume(BaseModel):
    """A resposta a uma pausa: qual pausa (`interruptId`) e o que a pessoa disse.

    O id não é enfeite. Sem ele, uma resposta dada a uma pergunta barata poderia
    ser reenviada contra uma confirmação de escrita — o grafo retomaria a pausa
    que estivesse pendente, fosse qual fosse. Ver `chat_route`.
    """

    model_config = {"extra": "forbid", "populate_by_name": True}

    interrupt_id: Annotated[str, Field(alias="interruptId", min_length=1, max_length=200)]
    value: Any = None


class ChatRequest(BaseModel):
    """Um turno novo (`message`) **ou** a retomada de uma pausa (`resume`).

    **Nenhum campo de identidade.** O Bearer vem no header, e o dono da conversa
    sai dele (`get_me`), não do corpo: `extra: "forbid"` recusa qualquer campo
    inventado, e um token ou um `userId` no corpo acabariam em log de requisição
    e em relatório de validação (ADR 021 e 023).

    `conversationId` é gerado pelo PWA na primeira mensagem, e é ele que torna
    a conversa retomável: uma thread com id inventado aqui não teria como
    receber a resposta a uma pergunta.

    `history` é o que o `apps/api` tem gravado. Só é lido quando a thread está
    fria — ver `hidratar` em `chat/graph.py`.
    """

    model_config = {"extra": "forbid", "populate_by_name": True}

    conversation_id: Annotated[UUID4, Field(alias="conversationId")]
    message: Annotated[str | None, Field(min_length=1, max_length=MAX_CARACTERES_POR_MENSAGEM)] = (
        None
    )
    resume: ChatResume | None = None
    history: Annotated[list[ChatMessage], Field(default_factory=list)]
    # O teto é o mesmo do `apps/api`: acima disso a memória deixa de ser
    # "o que importa lembrar" e vira um segundo histórico no prompt.
    memories: Annotated[list[ChatMemory], Field(default_factory=list, max_length=50)]
    # O fuso do perfil, que o `apps/api` já conhece — vira a data de hoje no
    # prompt. Não é identidade: o nome de um fuso é grosso demais para apontar
    # para alguém.
    timezone: str | None = None
    # Vivem só neste turno: o checkpoint recebe uma marca no lugar (ver
    # `FotoDoTurno` em `chat/state.py`).
    photos: Annotated[
        list[ChatPhoto], Field(default_factory=list, max_length=MAX_FOTOS_POR_MENSAGEM)
    ]

    @model_validator(mode="after")
    def _um_dos_dois(self) -> "ChatRequest":
        if (self.message is None) == (self.resume is None):
            raise ValueError("envie 'message' (turno novo) ou 'resume' (resposta a uma pausa)")
        if self.photos and self.message is None:
            raise ValueError("foto só acompanha uma mensagem nova, não a resposta a uma pausa")
        return self


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
    checkpointer = Checkpointer(resolved.agent_checkpoint_database_url)
    grafos: list[GrafoDaConversa] = []

    async def grafo() -> GrafoDaConversa:
        """O grafo do processo, compilado com o checkpointer na primeira conversa."""
        if not grafos:
            grafos.append(montar_grafo(await checkpointer.obter()))
        return grafos[0]

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
        yield
        await checkpointer.fechar()

    app = FastAPI(title="Fatia Agent", version=__version__, lifespan=lifespan)

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
            # Em memória, uma pausa do chat não sobrevive a um restart (ADR 023).
            "checkpointer": {"persistent": checkpointer.persistente},
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

        imagem = _decodificar_imagem(payload.image_base64, payload.media_type, "image_base64")

        provider = build_provider(resolved)
        try:
            return await recognize_meal(provider, imagem, media_type=payload.media_type)
        finally:
            await provider.aclose()

    @app.post("/title")
    async def title_route(
        payload: TitleRequest,
        x_fatia_agent_key: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        """O nome da conversa. Nunca falha por causa do modelo — ver `chat/titulo.py`.

        Sem Bearer, como o `/recognize-meal`: nomear um texto não alcança dado
        nenhum, e um token de usuário aqui só aumentaria o estrago de um
        comprometimento. A chave do agente continua exigida — é inferência paga.
        """
        _exigir_credencial(resolved, x_fatia_agent_key)
        provider = build_provider(resolved)
        try:
            gerado = await gerar_titulo(provider, payload.text)
        finally:
            await provider.aclose()
        usage = gerado.usage
        return {
            "title": gerado.titulo,
            "usage": None
            if usage is None
            else {
                "model": usage.model,
                **({"inputUnits": usage.input_units} if usage.input_units is not None else {}),
                **({"outputUnits": usage.output_units} if usage.output_units is not None else {}),
            },
        }

    @app.post("/transcribe")
    async def transcribe_route(
        request: Request,
        content_type: Annotated[str | None, Header()] = None,
        x_fatia_agent_key: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        """Ditado do chat (#141): o áudio cru no corpo, o texto de volta.

        Não grava nada e não envia nada: o texto volta para o campo de mensagem,
        e é a pessoa quem decide mandar. Sem Bearer, como o `/title` — transcrever
        não alcança dado nenhum. O áudio vive em memória e morre com a requisição
        (ADR 020).
        """
        _exigir_credencial(resolved, x_fatia_agent_key)
        media_type = (content_type or "").split(";")[0].strip().lower()
        if media_type not in AUDIO_ACEITO:
            raise HTTPException(
                status_code=415,
                detail=(
                    f"Content-Type '{media_type or 'ausente'}' não é aceito. "
                    f"Use um de: {', '.join(sorted(AUDIO_ACEITO))}."
                ),
            )
        audio = await _ler_audio(request)
        if not audio:
            raise HTTPException(status_code=400, detail="O corpo veio sem áudio.")

        provider = build_provider(resolved)
        try:
            transcricao = await provider.transcribe(audio, media_type=media_type)
        finally:
            await provider.aclose()
        return {
            "text": transcricao.text,
            "usage": {
                "model": transcricao.model,
                **(
                    {"inputUnits": transcricao.duration_seconds}
                    if transcricao.duration_seconds is not None
                    else {}
                ),
            },
        }

    @app.post("/chat", response_model=None)
    async def chat_route(
        payload: ChatRequest,
        x_fatia_agent_key: Annotated[str | None, Header()] = None,
        authorization: Annotated[str | None, Header()] = None,
    ) -> StreamingResponse | JSONResponse:
        """Um turno de conversa, ou a retomada de uma pausa, em SSE (#248, ADR 023).

        **Duas credenciais, dois papéis.** `X-Fatia-Agent-Key` responde "esta
        chamada pode gastar inferência paga?" (ADR 018) — é o `apps/api` provando
        que é ele. `Authorization: Bearer` responde "em nome de quem?", é
        repassado ao `/mcp` e decide de quem é a thread. Nenhuma substitui a outra.

        **O que falha antes do primeiro byte falha com status.** Provedor não
        configurado, Bearer recusado pelo `/mcp`, retomada que não corresponde à
        pausa pendente — tudo isso acontece aqui, antes do `StreamingResponse`.
        Depois que o stream abre, o erro só cabe como evento — ver `chat/events.py`.
        """
        _exigir_credencial(resolved, x_fatia_agent_key)
        bearer = _exigir_bearer(authorization)
        fotos = tuple(
            FotoDoTurno(
                media_type=foto.media_type,
                base64=base64.b64encode(
                    _decodificar_imagem(foto.data, foto.media_type, f"photos[{indice}].data")
                ).decode("ascii"),
            )
            for indice, foto in enumerate(payload.photos)
        )
        if fotos and usable_models(resolved)["vision"] is None:
            # Antes do stream, para virar status: com o SSE aberto, a mesma
            # recusa chegaria como evento no meio de uma resposta que não começou.
            raise AIProviderNotConfigured(
                "Foto no chat precisa de um modelo de visão configurado e revisado "
                "(AI_MODEL_VISION), que também aceite tools."
            )

        provider = build_provider(resolved)
        client = build_mcp_client(resolved, bearer=bearer)

        try:
            # O catálogo antes do stream: é a primeira chamada que exercita o
            # Bearer, e a única chance de um token inválido virar 401 de verdade.
            permitidas = todas_permitidas(await client.list_tools())
            thread_id = thread_da_conversa(await _dono(client), str(payload.conversation_id))
            compilado = await grafo()
            if payload.resume is not None:
                recusa = await _recusa_de_retomada(
                    compilado, thread_id, payload.resume.interrupt_id
                )
                if recusa is not None:
                    await client.aclose()
                    await provider.aclose()
                    return recusa
        except BaseException:
            await client.aclose()
            await provider.aclose()
            raise

        contexto = ContextoDoTurno(
            provider=provider,
            client=client,
            permitidas=tuple(permitidas),
            run_id=uuid.uuid4().hex,
            timezone=payload.timezone,
            historico=tuple(mensagem.model_dump() for mensagem in payload.history),
            memorias=tuple(memoria.model_dump() for memoria in payload.memories),
            planejar=resolved.agent_chat_planner,
            fotos=fotos,
        )

        async def fluxo() -> AsyncIterator[str]:
            try:
                async for quadro in stream_chat_events(
                    compilado,
                    contexto,
                    thread_id=thread_id,
                    conversation_id=str(payload.conversation_id),
                    mensagem=payload.message,
                    retomada=payload.resume.value if payload.resume is not None else None,
                ):
                    yield quadro
            finally:
                # `finally`, e não depois do laço: quando o cliente desconecta, o
                # gerador é fechado com `GeneratorExit` e o laço nunca termina.
                await client.aclose()
                await provider.aclose()

        return StreamingResponse(
            fluxo(),
            media_type="text/event-stream",
            headers={
                # Sem isto, um proxy que bufferize entrega a conversa inteira de
                # uma vez, e o chat parece travado até a última palavra chegar.
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    return app


def _decodificar_imagem(dados: str, media_type: str, campo: str) -> bytes:
    """A imagem em bytes, ou o 4xx que diz o que corrigir."""
    if media_type not in MEDIA_TYPES_ACEITOS:
        raise HTTPException(
            status_code=415,
            detail=(
                f"media_type '{media_type}' não é aceito. "
                f"Use um de: {', '.join(sorted(MEDIA_TYPES_ACEITOS))}."
            ),
        )
    try:
        # `validate=True`: sem isso o base64 do Python **ignora** caractere
        # inválido em silêncio, e uma foto corrompida no caminho viraria bytes
        # truncados que o provedor recusa com um 400 sem explicação.
        imagem = base64.b64decode(dados, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{campo} inválido: {exc}") from exc
    if not imagem:
        raise HTTPException(status_code=400, detail=f"{campo} decodificou para zero bytes.")
    if len(imagem) > MAX_IMAGEM_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"A imagem tem {len(imagem)} bytes e o limite é {MAX_IMAGEM_BYTES}. "
                "Reduza a resolução no aparelho."
            ),
        )
    return imagem


async def _ler_audio(request: Request) -> bytes:
    """O corpo inteiro, recusado **durante** a leitura se passar do teto.

    Ler tudo e só depois medir deixaria qualquer um que tenha a chave do agente
    encher a memória do processo com um corpo de gigabytes.
    """
    lido = bytearray()
    async for pedaco in request.stream():
        lido.extend(pedaco)
        if len(lido) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"O áudio passa de {MAX_AUDIO_BYTES} bytes. Grave um trecho mais curto.",
            )
    return bytes(lido)


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


async def _dono(client: McpClient) -> str:
    """O id de quem está conversando, segundo o próprio `/mcp`.

    Pelo token, e não pelo corpo: é o `/mcp` que valida o Bearer, e ele devolve
    o usuário que o token representa. Um `userId` no corpo seria a thread de
    outra pessoa a um campo adulterado de distância (ADR 023).
    """
    resultado = await client.call_tool("get_me", {})
    try:
        perfil: object = json.loads(resultado.text)
    except ValueError:
        perfil = None
    identificador = perfil.get("id") if isinstance(perfil, dict) else None
    if resultado.is_error or not isinstance(identificador, str) or not identificador:
        raise McpResponseUnparseable(
            "O /mcp não devolveu o id de quem está conversando em 'get_me' — sem ele não há "
            "como saber de quem é a conversa."
        )
    return identificador


async def _recusa_de_retomada(
    grafo: GrafoDaConversa, thread_id: str, oferecido: str
) -> JSONResponse | None:
    """409 quando a retomada não responde à pausa que a thread está esperando."""
    pendente = await interrupcao_pendente(grafo, thread_id)
    if pendente is None:
        return JSONResponse(
            status_code=409,
            content={
                "error": {
                    "code": "CHAT_NOTHING_TO_RESUME",
                    "message": (
                        "Esta conversa não está esperando resposta. Envie uma mensagem nova."
                    ),
                }
            },
        )
    if not secrets.compare_digest(pendente, oferecido):
        return JSONResponse(
            status_code=409,
            content={
                "error": {
                    "code": "CHAT_RESUME_MISMATCH",
                    "message": "Esta resposta não corresponde à pergunta pendente.",
                }
            },
        )
    return None


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
