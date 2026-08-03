"""Modelos revisados como subprocessador, por capacidade (issue #136).

Existe por um furo estrutural, não por burocracia.

O Cloudflare AI Gateway troca o modelo **por configuração, sem deploy** — e a
ADR 015 vende isso como vantagem ("trocar de provedor é trocar duas variáveis de
ambiente"). Só que trocar o modelo troca *quem recebe a foto do prato*, e a foto
de refeição é dado pessoal sensível (LGPD art. 5º II). A `/privacy` nomeia esse
terceiro, declara a transferência internacional e afirma que o dado não é usado
para treinar modelo. As três frases dependem de **qual** modelo está configurado.

Sem nada no caminho, alguém edita `AI_MODEL_VISION` no painel do Dokploy e as
três viram mentira — sem que uma linha do repositório mude, sem erro, sem
sintoma. Esta lista é o ponto onde essa troca vira um diff, e um diff é onde a
revisão do texto legal acontece.

**Só vale para endpoint remoto.** Endpoint local (LM Studio) não tem
subprocessador: o dado não sai da máquina, não há terceiro a declarar, e a
ergonomia de desenvolvimento que a ADR 015 promete continua intacta. A fronteira
é a mesma da ADR 018 — o que atravessa a rede expõe, o que não atravessa, não.

A lista nasce **vazia** em toda capacidade, e isso não é lacuna: nenhuma
funcionalidade de IA hospedada foi para produção (#139 e #141 seguem abertas),
então nenhum modelo foi revisado nem declarado na `/privacy`. Quem escolher o
modelo de produção acrescenta o nome aqui **na mesma PR** em que atualiza a
política. É exatamente o efeito pretendido: falha fechada até alguém decidir.
"""

from collections.abc import Mapping

from .settings import AgentSettings, is_local_endpoint

# As quatro capacidades da `providers/base.py`. Transcrição ainda não tem
# implementação (#141), mas entra aqui hoje: a lista precisa existir *antes* do
# primeiro modelo de áudio, senão ele nasce sem revisão.
CAPABILITIES: tuple[str, ...] = ("text", "vision", "embedding", "transcription")

CAPABILITY_ENV_VARS: Mapping[str, str] = {
    "text": "AI_MODEL_TEXT",
    "vision": "AI_MODEL_VISION",
    "embedding": "AI_MODEL_EMBEDDING",
    "transcription": "AI_MODEL_TRANSCRIPTION",
}

CAPABILITY_LABELS: Mapping[str, str] = {
    "text": "texto",
    "vision": "visão",
    "embedding": "embedding",
    "transcription": "transcrição",
}

# Acrescentar um nome aqui é declarar: "este fornecedor recebe dado de saúde de
# usuário da instância pública, está nomeado na /privacy e não usa o dado para
# treinar". Não é uma lista de modelos que funcionam — é uma lista de decisões.
ALLOWED_MODELS: Mapping[str, frozenset[str]] = {
    "text": frozenset(),
    "vision": frozenset(),
    "embedding": frozenset(),
    "transcription": frozenset(),
}


def unreviewed_model_reason(capability: str, model: str, *, remote: bool) -> str | None:
    """Mensagem quando o modelo não pode ser usado; `None` quando pode.

    Modelo vazio devolve `None` de propósito: "capacidade não configurada" já é
    tratado por `_require_model`, com outro erro e outra mensagem. Confundir os
    dois faria "esqueci de configurar" e "configurei um fornecedor não revisado"
    chegarem ao operador como o mesmo problema.
    """
    if not model.strip() or not remote:
        return None

    permitidos = ALLOWED_MODELS.get(capability, frozenset())
    if model in permitidos:
        return None

    env_var = CAPABILITY_ENV_VARS.get(capability, "AI_MODEL_*")
    label = CAPABILITY_LABELS.get(capability, capability)
    lista = ", ".join(sorted(permitidos)) if permitidos else "(nenhum — a lista está vazia)"
    return (
        f"{env_var}='{model}' aponta para um modelo remoto que não passou por revisão de "
        f"privacidade, então a capacidade de {label} recusa a chamada. Modelos revisados "
        f"para esta capacidade: {lista}. Mandar dado de saúde para um fornecedor não "
        "declarado tornaria a /privacy falsa (LGPD art. 5º II e art. 11 I). Se a troca é "
        "intencional, acrescente o modelo em ALLOWED_MODELS na mesma PR que atualiza a "
        "política — a lista existe para que isso passe por um diff. Endpoint local não "
        "cai nesta regra: sem terceiro, não há subprocessador a declarar."
    )


def unreviewed_models(settings: AgentSettings) -> dict[str, str]:
    """Capacidade → motivo, para toda capacidade configurada com modelo não revisado.

    Serve ao `/health`: o operador precisa ver a recusa **antes** de alguém tentar
    usar a capacidade, não pelo primeiro 503 de um usuário.
    """
    remote = not is_local_endpoint(settings.ai_base_url)
    reasons: dict[str, str] = {}
    for capability, model in configured_models(settings).items():
        reason = unreviewed_model_reason(capability, model, remote=remote)
        if reason is not None:
            reasons[capability] = reason
    return reasons


def configured_models(settings: AgentSettings) -> dict[str, str]:
    """O que está no ambiente, sem julgar. Vazio quando a capacidade não foi configurada."""
    return {
        "text": settings.ai_model_text,
        "vision": settings.ai_model_vision,
        "embedding": settings.ai_model_embedding,
        # Sem implementação até #141; declarada como ausente, não omitida.
        "transcription": "",
    }


def usable_models(settings: AgentSettings) -> dict[str, str | None]:
    """O que o `/capabilities` deve anunciar: `None` quando não configurado **ou** não revisado.

    Anunciar um modelo que a próxima chamada vai recusar é pior do que não
    anunciar nada — quem lê a rota acredita nela, e o erro aparece longe daqui.
    """
    remote = not is_local_endpoint(settings.ai_base_url)
    usable: dict[str, str | None] = {}
    for capability, model in configured_models(settings).items():
        blocked = unreviewed_model_reason(capability, model, remote=remote) is not None
        usable[capability] = model if model.strip() and not blocked else None
    return usable


__all__ = [
    "ALLOWED_MODELS",
    "CAPABILITIES",
    "CAPABILITY_ENV_VARS",
    "CAPABILITY_LABELS",
    "configured_models",
    "unreviewed_model_reason",
    "unreviewed_models",
    "usable_models",
]
