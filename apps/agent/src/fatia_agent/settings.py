"""Configuração do agente, lida do ambiente.

Regra da ADR 015: **nenhum `if ambiente == 'prod'` no caminho de inferência**.
Dev e produção falam o mesmo protocolo OpenAI-compatível; o que muda entre eles
é `AI_BASE_URL` + `AI_API_KEY` + os nomes de modelo. Este módulo é o único lugar
que sabe disso.
"""

from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict

# Endereços que não exigem credencial: LM Studio em dev, direto ou visto de
# dentro de um container. Serve só para decidir se `AI_API_KEY` vazia é um
# descuido ou o normal.
#
# **Não é a fronteira de privacidade.** Quem decide "há terceiro recebendo dado
# de saúde aqui?" é `allowed_models.PRIVACY_LOCAL_HOSTS`, que é uma lista
# separada de propósito: acrescentar um host aqui para parar de preencher
# `AI_API_KEY` não pode desligar a revisão de subprocessador da #136.
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal"})

LM_STUDIO_URL = "http://localhost:1234/v1"


class AgentSettings(BaseSettings):
    """Env do agente. Nada aqui levanta exceção: configuração faltando vira
    degradação explícita na hora do uso, não serviço que se recusa a subir."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    ai_base_url: str = ""
    ai_api_key: str = ""

    # Quatro capacidades, quatro variáveis. Amarrar todas a um único nome de
    # modelo é justamente o acoplamento que esta issue existe para evitar: o
    # gateway roteia visão e texto para modelos diferentes.
    ai_model_text: str = ""
    ai_model_vision: str = ""
    ai_model_embedding: str = ""

    # Visão em CPU local leva dezenas de segundos. O default do httpx (5s) faria
    # isso parecer "o modelo não responde" quando na verdade o cliente desistiu.
    ai_timeout_s: float = 120.0

    ai_max_retries: int = 2
    ai_retry_backoff_s: float = 0.5


def is_local_endpoint(base_url: str) -> bool:
    """True quando o endpoint é um provedor local que dispensa credencial."""
    host = urlparse(base_url).hostname
    return host in LOCAL_HOSTS


def endpoint_host(base_url: str) -> str:
    """Só o host do endpoint — diagnóstico sem entregar o caminho.

    `/capabilities` é anônima e o compose publica a porta em `0.0.0.0`. Uma
    `AI_BASE_URL` de gateway carrega id de conta e nome do gateway no *path*
    (`.../v1/<conta>/<gateway>/openai`), e devolvê-la inteira entrega isso a
    quem der um `curl` sem credencial. O host responde "para qual provedor eu
    aponto", que é a pergunta que a rota existe para responder.
    """
    return urlparse(base_url).hostname or ""


def ai_unavailable_reason(settings: AgentSettings) -> str | None:
    """Mensagem acionável quando a inferência não pode acontecer; `None` quando pode.

    O segundo caso — `AI_API_KEY` vazia contra um endpoint remoto — existe porque
    o LM Studio aceita chave vazia. Todo o desenvolvimento passa assim e ninguém
    percebe; o sintoma só aparece como 401 no primeiro deploy. Aqui vira erro
    nomeado antes da primeira chamada.
    """
    if not settings.ai_base_url.strip():
        return (
            "AI_BASE_URL não está definida — o agente sobe, mas não faz inferência. "
            f"Em desenvolvimento aponte para o LM Studio local (AI_BASE_URL={LM_STUDIO_URL}); "
            "em produção, para o Cloudflare AI Gateway. Sem ela, o registro manual "
            "continua sendo o caminho e nenhuma funcionalidade do produto se perde."
        )

    if not settings.ai_api_key.strip() and not is_local_endpoint(settings.ai_base_url):
        host = urlparse(settings.ai_base_url).hostname or settings.ai_base_url
        return (
            f"AI_API_KEY está vazia e AI_BASE_URL aponta para '{host}', que não é local. "
            "O LM Studio dispensa credencial, um gateway não — preencha AI_API_KEY."
        )

    return None
