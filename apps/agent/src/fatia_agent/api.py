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
from .settings import AgentSettings, ai_unavailable_reason, endpoint_host

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

    return app


# `uvicorn fatia_agent.api:app`
app = create_app()

__all__: list[str] = ["app", "create_app"]
