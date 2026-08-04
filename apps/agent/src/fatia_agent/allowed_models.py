"""Destinos revisados como subprocessador: **host e modelo** (issue #136).

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

**São duas listas, porque são duas perguntas diferentes.** `AI_MODEL_*` diz *o
que* roda; `AI_BASE_URL` diz *para qual máquina os bytes saem* — e ela mora no
mesmo painel do Dokploy, editável do mesmo jeito. Vigiar só o nome do modelo
deixava um buraco de tamanho igual ao que a lista existe para fechar: com um
modelo já revisado configurado, bastava trocar a base para outro proxy
compatível com o protocolo da OpenAI que servisse aquele mesmo nome, e a foto
do prato saía para um terceiro não declarado — sem diff, sem erro, sem sintoma.
Um gateway roteia para muitos fornecedores de modelo, e muitos gateways servem
o mesmo nome de modelo: nenhuma das duas listas implica a outra.

**Só vale para endpoint remoto.** Endpoint local (LM Studio) não tem
subprocessador: o dado não sai da máquina, não há terceiro a declarar, e a
ergonomia de desenvolvimento que a ADR 015 promete continua intacta. A fronteira
é a mesma da ADR 018 — o que atravessa a rede expõe, o que não atravessa, não.
Quem responde "isto é local?" para fins de privacidade é `PRIVACY_LOCAL_HOSTS`,
aqui, e não a lista homônima da `settings` — ver o comentário dela para o porquê
e para o escape que ela aceita.

As duas listas nascem **vazias**, e isso não é lacuna: nenhuma funcionalidade de
IA hospedada foi para produção (#139 e #141 seguem abertas), então nem o host
nem os modelos foram revisados ou declarados na `/privacy`. Quem escolher o
destino de produção acrescenta host e modelo aqui **na mesma PR** em que
atualiza a política. É exatamente o efeito pretendido: falha fechada até alguém
decidir.
"""

from collections.abc import Mapping

from .settings import AgentSettings, endpoint_host

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

# Hosts de `AI_BASE_URL` revisados como subprocessador. Mesmo peso da lista
# acima e mesmo critério: acrescentar um nome aqui é declarar "esta máquina
# recebe dado de saúde de usuário da instância pública e está nomeada na
# /privacy".
#
# Só o host entra, nunca a URL inteira: o path de um gateway carrega id de conta
# e nome do gateway (ver `settings.endpoint_host`), que mudam sem que o
# subprocessador mude. Comparar a URL inteira faria a lista recusar uma troca de
# conta — que não é uma decisão de privacidade — e obrigaria a colar um
# identificador de infraestrutura num arquivo público.
ALLOWED_HOSTS: frozenset[str] = frozenset()

# Hosts que a **revisão de privacidade** trata como "não há terceiro": o dado não
# sai da máquina, então não há subprocessador a declarar nem lista a consultar.
#
# Lista própria, e não `settings.LOCAL_HOSTS`, embora o conteúdo seja hoje o
# mesmo. A da `settings` responde outra pergunta — a docstring dela diz, com
# todas as letras, que serve "só para decidir se `AI_API_KEY` vazia é um descuido
# ou o normal". Reusá-la faria uma conveniência de credencial mover a fronteira
# de privacidade em silêncio: quem acrescentasse um host lá para parar de
# preencher `AI_API_KEY` desligaria, sem saber, as duas listas acima. São duas
# perguntas, e uma delas tem consequência jurídica.
#
# **Escape conhecido, e aceito.** Um proxy reverso ouvindo em `localhost` que
# encaminha para um gateway remoto passa por aqui e desliga a revisão inteira.
# Não há como distinguir isso de um LM Studio olhando só a URL — quem sabe para
# onde os bytes vão depois é quem configurou o proxy. Fica registrado porque um
# fail-open declarado é a única forma honesta de ter um: quem opera instância
# própria responde pela política dela (ADR 020), e quem opera a pública não põe
# proxy nenhum no caminho.
PRIVACY_LOCAL_HOSTS: frozenset[str] = frozenset(
    {"localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal"}
)


def is_local_destination(base_url: str) -> bool:
    """True quando o destino não envolve terceiro — a fronteira de privacidade da #136."""
    return endpoint_host(base_url) in PRIVACY_LOCAL_HOSTS


def unreviewed_host_reason(base_url: str) -> str | None:
    """Mensagem quando o **destino** da requisição não foi revisado; `None` quando foi.

    `base_url` vazia devolve `None` de propósito, pelo mesmo motivo que modelo
    vazio: "não configurado" já é `settings.ai_unavailable_reason`, com outra
    mensagem e outra ação. URL sem host reconhecível cai na recusa — não é local
    e não está na lista, então falha fechada.
    """
    if not base_url.strip() or is_local_destination(base_url):
        return None

    host = endpoint_host(base_url)
    if host in ALLOWED_HOSTS:
        return None

    lista = ", ".join(sorted(ALLOWED_HOSTS)) if ALLOWED_HOSTS else "(nenhum — a lista está vazia)"
    return (
        f"AI_BASE_URL aponta para o host '{host or '(sem host)'}', que não passou por revisão de "
        "privacidade, então nenhuma capacidade envia dado para lá. Hosts revisados: "
        f"{lista}. O nome do modelo não responde por isto: qualquer proxy compatível com o "
        "protocolo da OpenAI pode servir um modelo já revisado, e quem recebe os bytes é o host. "
        "Se a troca é intencional, acrescente o host em ALLOWED_HOSTS na mesma PR que atualiza a "
        "política — a lista existe para que isso passe por um diff. Endpoint local não cai nesta "
        "regra: sem terceiro, não há subprocessador a declarar."
    )


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
    remote = not is_local_destination(settings.ai_base_url)
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
        # TODO(#141): passa a ser `settings.ai_model_transcription` quando a
        # variável existir. Declarada como ausente e não omitida porque a
        # capacidade já existe na lista revisada; o `""` fixo é correto só
        # enquanto não há variável para ler, e
        # `test_configured_models_le_todo_ai_model_que_ja_existe` fica vermelho
        # no dia em que houver.
        "transcription": "",
    }


def usable_models(settings: AgentSettings) -> dict[str, str | None]:
    """O que o `/capabilities` deve anunciar: `None` quando não configurado **ou** não revisado.

    Anunciar um modelo que a próxima chamada vai recusar é pior do que não
    anunciar nada — quem lê a rota acredita nela, e o erro aparece longe daqui.
    """
    # Host não revisado derruba todas as capacidades de uma vez: não é uma
    # capacidade que está errada, é para onde todas elas apontam.
    if unreviewed_host_reason(settings.ai_base_url) is not None:
        return {capability: None for capability in configured_models(settings)}

    remote = not is_local_destination(settings.ai_base_url)
    usable: dict[str, str | None] = {}
    for capability, model in configured_models(settings).items():
        blocked = unreviewed_model_reason(capability, model, remote=remote) is not None
        usable[capability] = model if model.strip() and not blocked else None
    return usable


__all__ = [
    "ALLOWED_HOSTS",
    "ALLOWED_MODELS",
    "CAPABILITIES",
    "CAPABILITY_ENV_VARS",
    "CAPABILITY_LABELS",
    "PRIVACY_LOCAL_HOSTS",
    "configured_models",
    "is_local_destination",
    "unreviewed_host_reason",
    "unreviewed_model_reason",
    "unreviewed_models",
    "usable_models",
]
