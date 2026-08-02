"""Superfície HTTP do agente.

Só duas rotas nesta issue, e nenhuma delas faz inferência — ver o README, §"O que
esta issue deliberadamente não entrega". O que a superfície estabelece aqui é o
**contrato de erro**: todo `AIProviderError` vira um envelope `{"error": {...}}`
com um `code` estável, que é o que o NestJS vai traduzir para o cliente cair no
caminho manual.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import __version__
from .providers import build_provider
from .providers.errors import (
    AIProviderError,
    AIProviderNotConfigured,
    AIProviderRefused,
    AIProviderTimeout,
)
from .settings import AgentSettings, ai_unavailable_reason

# 503: falta configuração nossa. 504: o provedor demorou. 502: o provedor
# respondeu, mas mal. Todos são "tente de novo ou registre manualmente".
_STATUS_BY_ERROR: dict[type[AIProviderError], int] = {
    AIProviderNotConfigured: 503,
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
            "ai": {"configured": reason is None, "reason": reason},
        }

    @app.get("/capabilities")
    async def capabilities() -> dict[str, object]:
        """Quais capacidades estão atendidas e por qual modelo.

        Levanta `AIProviderNotConfigured` quando o provedor não pode ser montado
        — é a degradação explícita da ADR 015, com código e mensagem acionável.
        """
        build_provider(resolved)
        return {
            "base_url": resolved.ai_base_url,
            "capabilities": {
                "text": resolved.ai_model_text or None,
                "vision": resolved.ai_model_vision or None,
                "embedding": resolved.ai_model_embedding or None,
                # Transcrição chega com #141; ver providers/base.py.
                "transcription": None,
            },
        }

    return app


# `uvicorn fatia_agent.api:app`
app = create_app()

__all__: list[str] = ["app", "create_app"]
