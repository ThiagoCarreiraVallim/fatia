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

    # Segredo compartilhado com o `apps/api`, exigido no header
    # `X-Fatia-Agent-Key` das rotas que fazem inferência. Ver
    # `agent_auth_unavailable_reason`.
    agent_api_key: str = ""

    # Endpoint do `/mcp` do NestJS — o **único** destino para onde o Bearer do
    # usuário sai daqui (ADR 021). Vazio = a rota de chat degrada com erro
    # nomeado, do mesmo jeito que `AI_BASE_URL` vazia degrada a inferência.
    mcp_base_url: str = ""

    # Menor que `AI_TIMEOUT_S` de propósito: do outro lado está o nosso Postgres,
    # não um modelo em CPU. Uma tool que não responde em meio minuto é falha, e
    # esperar dois minutos por ela só faria o chat parecer travado.
    mcp_timeout_s: float = 30.0


AGENT_API_KEY_HEADER = "x-fatia-agent-key"


def is_local_endpoint(base_url: str) -> bool:
    """True quando o endpoint é um provedor local que dispensa credencial."""
    host = urlparse(base_url).hostname
    return host in LOCAL_HOSTS


def host_em_rede_privada(host: str | None) -> bool:
    """True quando o host **não** é alcançável pela internet pública.

    `LOCAL_HOSTS` responde "é esta máquina?", que é a pergunta do provedor de IA.
    O `/mcp` faz uma pergunta maior: "o Bearer do usuário sai desta rede?". Dentro
    do compose o `apps/api` atende por `api` — um nome de serviço, resolvido pelo
    DNS do Docker, e que `localhost` não alcança porque `localhost` ali é o
    próprio agente. Recusar `http://api:3000/mcp` mandava quem sobe o compose
    "usar https ou apontar para um host local" numa rede onde nenhuma das duas
    coisas existe, e o chat respondia 503 em toda mensagem.

    O critério é o nome ter um rótulo só: `api`, `fatia-api`, `nestjs`. Um nome
    sem ponto não é registrável no DNS público — ele só resolve dentro de uma
    rede que alguém montou, que é exatamente onde o `http://` é aceitável. Host
    com ponto (`api.exemplo.com`) e IPv6 literal (`2001:db8::1`) continuam
    exigindo TLS: os dois podem estar do outro lado da internet.
    """
    if not host:
        return False
    if host in LOCAL_HOSTS:
        return True
    return "." not in host and ":" not in host


def endpoint_host(base_url: str) -> str:
    """Só o host do endpoint — diagnóstico sem entregar o caminho.

    `/capabilities` é anônima e o compose publica a porta em `0.0.0.0`. Uma
    `AI_BASE_URL` de gateway carrega id de conta e nome do gateway no *path*
    (`.../v1/<conta>/<gateway>/openai`), e devolvê-la inteira entrega isso a
    quem der um `curl` sem credencial. O host responde "para qual provedor eu
    aponto", que é a pergunta que a rota existe para responder.
    """
    return urlparse(base_url).hostname or ""


def agent_auth_unavailable_reason(settings: AgentSettings) -> str | None:
    """Por que a rota de inferência não pode aceitar chamada; `None` quando pode.

    Uma rota que dispara inferência sem autenticar é um **proxy aberto para um
    gateway pago** — a fronteira de custo da ADR 018. O agente não publica porta
    na internet hoje, mas "hoje" não é um mecanismo, e o compose já publica em
    `0.0.0.0`.

    A exigência acompanha o custo, e não o ambiente: com `AI_BASE_URL` local
    (LM Studio), inferência não custa nada a ninguém e pedir segredo só faria o
    desenvolvimento inventar um. Fora de `localhost`, `AGENT_API_KEY` é
    obrigatória — é a mesma regra que `AI_API_KEY` já segue, pelo mesmo motivo, e
    não há um `if ambiente == 'prod'` em lugar nenhum.
    """
    if settings.agent_api_key.strip():
        return None
    # Sem `AI_BASE_URL` não há inferência a proteger, e a mensagem que a pessoa
    # precisa ler é a do provedor ausente — não uma sobre segredo compartilhado.
    if not settings.ai_base_url.strip() or is_local_endpoint(settings.ai_base_url):
        return None
    host = urlparse(settings.ai_base_url).hostname or settings.ai_base_url
    return (
        f"AGENT_API_KEY está vazia e AI_BASE_URL aponta para '{host}', que não é local. "
        "A rota de reconhecimento dispara inferência paga: sem segredo compartilhado "
        "com o apps/api, ela seria um proxy aberto para o gateway (ADR 018)."
    )


def mcp_unavailable_reason(settings: AgentSettings) -> str | None:
    """Por que o chat não pode falar com o `/mcp`; `None` quando pode.

    O segundo caso é sobre o **Bearer**, e não sobre disponibilidade. A ADR 021
    aceita que o agente vire um ponto por onde o token do usuário transita; o
    preço disso é que uma `MCP_BASE_URL` errada não vaza dado do agente — vaza a
    credencial de quem está usando o produto, para quem quer que atenda naquele
    endereço. `http://` contra host remoto põe esse token em texto puro no fio,
    e é a única forma de errar que dá para reconhecer olhando só a configuração.

    Rede privada continua liberada em `http://`: é como o `apps/api` roda em
    desenvolvimento e dentro do compose, e exigir TLS ali só faria alguém
    inventar um certificado. Ver `host_em_rede_privada`.
    """
    if not settings.mcp_base_url.strip():
        return (
            "MCP_BASE_URL não está definida — o chat não tem como alcançar dado do usuário. "
            "O agente não fala com o Postgres (ADR 015): toda leitura passa pelo /mcp do "
            "apps/api, com o Bearer de quem está conversando. Em desenvolvimento aponte para "
            "http://localhost:3000/mcp. Sem ela, o restante do produto continua inteiro."
        )

    parsed = urlparse(settings.mcp_base_url)
    if parsed.scheme != "https" and not host_em_rede_privada(parsed.hostname):
        return (
            f"MCP_BASE_URL usa '{parsed.scheme or '(sem esquema)'}' contra o host "
            f"'{parsed.hostname or '(sem host)'}', que é alcançável de fora da rede. O agente "
            "encaminha o Bearer DO USUÁRIO para esse endereço: sem TLS, o token de acesso de "
            "quem está conversando trafega em texto puro. Use https, ou aponte para um host "
            "da rede local (localhost, ou o nome do serviço no compose — 'api')."
        )

    return None


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
