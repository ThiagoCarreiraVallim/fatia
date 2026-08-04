"""Superfície HTTP do agente.

Duas rotas de diagnóstico (`/health`, `/capabilities`) e uma de inferência
(`/recognize-meal`, #139). O que a superfície estabelece é o **contrato de
erro**: todo `AIProviderError` vira um envelope `{"error": {...}}` com um `code`
estável, que é o que o NestJS traduz para o cliente cair no caminho manual.

A rota de inferência é autenticada por segredo compartilhado com o `apps/api` —
ver `settings.agent_auth_unavailable_reason`. Ela **não** recebe identidade de
usuário: o agente não fala com o banco nem com o `/mcp` neste fluxo, e mandar um
Bearer de usuário para um serviço que não precisa dele só aumentaria o estrago de
um comprometimento.
"""

import base64
import binascii
import secrets
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import __version__
from .allowed_models import unreviewed_host_reason, unreviewed_models, usable_models
from .providers import build_provider
from .providers.errors import (
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


# 503: falta configuração nossa. 504: o provedor demorou. 502: o provedor
# respondeu, mas mal. Todos são "tente de novo ou registre manualmente".
_STATUS_BY_ERROR: dict[type[AIProviderError], int] = {
    AIProviderNotConfigured: 503,
    # Também 503, e também "configuração nossa": o modelo apontado, ou o host
    # para onde os bytes iriam, não passou por revisão de privacidade. O `code`
    # é que separa os três para quem opera — são três correções diferentes.
    AIModelNotAllowed: 503,
    AIEndpointNotAllowed: 503,
    AIProviderTimeout: 504,
    AIProviderRefused: 502,
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
        raise HTTPException(status_code=401, detail="Credencial do agente ausente ou inválida.")


# `uvicorn fatia_agent.api:app`
app = create_app()

__all__: list[str] = ["app", "create_app"]
