"""Revisão de destino e de modelo como subprocessador (issue #136).

O risco que estes testes existem para prender não é um bug: é uma **edição de
painel**. Alguém troca `AI_MODEL_VISION` — ou `AI_BASE_URL`, que mora no mesmo
painel — no Dokploy, os bytes passam a sair para outro fornecedor, e as três
afirmações da `/privacy` (quem é o subprocessador, que há transferência
internacional, que o dado não treina modelo) ficam falsas sem que nenhuma linha
do repositório mude, sem erro e sem sintoma.

São **duas** listas e dois grupos de casos aqui, de propósito: nenhuma implica a
outra. Um gateway revisado pode servir um modelo que ninguém examinou, e um
modelo revisado pode ser servido por qualquer proxy compatível com o protocolo
da OpenAI. Por isso os casos de modelo rodam com o host **já autorizado** — sem
isso eles passariam pela recusa errada e deixariam de provar o que dizem provar.

Nenhum teste aqui fala com rede: a recusa acontece **antes** de a requisição
existir, que é o único momento em que ela ainda protege alguma coisa.
"""

import pytest
from fastapi.testclient import TestClient

from fatia_agent import allowed_models
from fatia_agent import settings as settings_module
from fatia_agent.allowed_models import (
    CAPABILITIES,
    CAPABILITY_ENV_VARS,
    configured_models,
    usable_models,
)
from fatia_agent.api import create_app
from fatia_agent.providers import build_provider
from fatia_agent.providers.errors import (
    AIEndpointNotAllowed,
    AIModelNotAllowed,
    AIProviderNotConfigured,
)
from fatia_agent.settings import AgentSettings

from .support import RecordingTransport, chat_response

GATEWAY_HOST = "gateway.ai.cloudflare.com"
GATEWAY = f"https://{GATEWAY_HOST}/v1/conta/fatia/openai"

# Outro proxy que fala o mesmo protocolo e serve nomes de modelo populares. É a
# troca de uma variável só que o guarda de `ALLOWED_MODELS` não via.
OUTRO_PROXY = "https://api.deepinfra.com/v1/openai"

# 1x1 PNG transparente — imagem mínima que ainda é imagem de verdade.
PIXEL_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d4944415478da63fccf00000302010005cd85060000000049454e44ae426082"
)


@pytest.fixture
def gateway_settings(settings_factory, monkeypatch):
    """Endpoint remoto com credencial — o cenário de produção da ADR 015.

    O host do gateway entra na lista revisada aqui porque os casos que usam esta
    fixture são sobre **modelo**. Com `ALLOWED_HOSTS` vazia eles morreriam na
    recusa anterior, continuariam verdes, e provariam a guarda errada.
    """
    _permitir_host(monkeypatch, GATEWAY_HOST)
    return settings_factory(ai_base_url=GATEWAY, ai_api_key="cf-token")


@pytest.fixture
def proxy_nao_revisado_settings(settings_factory, monkeypatch):
    """Só `AI_BASE_URL` muda: o gateway é o revisado, o destino configurado não é.

    E o modelo de **toda** capacidade está autorizado — sem isso o teste passaria
    pela recusa de modelo e não provaria nada sobre o destino.
    """
    _permitir_host(monkeypatch, GATEWAY_HOST)
    tabela = {
        "text": frozenset({"ornith-1.0-9b"}),
        "vision": frozenset({"google/gemma-4-12b-qat"}),
        "embedding": frozenset({"text-embedding-nomic-embed-text-v1.5"}),
        "transcription": frozenset(),
    }
    monkeypatch.setattr(allowed_models, "ALLOWED_MODELS", tabela)
    return settings_factory(ai_base_url=OUTRO_PROXY, ai_api_key="tok")


@pytest.fixture
def transporte():
    """Duplo que grava o que saiu.

    Nenhum teste aqui pode depender de o LM Studio estar (ou não) no ar na
    máquina de quem roda: a primeira versão destes casos provava "não vazou"
    por ausência de exceção, e passava verde por acaso numa máquina sem
    provedor. Com o duplo, `transporte.requests` é a afirmação direta —
    lista vazia significa que nenhum byte saiu.
    """
    return RecordingTransport(lambda _request: chat_response("ok"))


def _permitir(monkeypatch: pytest.MonkeyPatch, capability: str, *models: str) -> None:
    """Simula a PR que acrescenta um modelo revisado à lista.

    `monkeypatch` em vez de um parâmetro injetável de propósito: um ponto de
    injeção existiria também em produção, e alguém acabaria passando a lista por
    variável de ambiente — que é exatamente a troca sem diff que a lista impede.
    """
    tabela = {nome: frozenset(lista) for nome, lista in allowed_models.ALLOWED_MODELS.items()}
    tabela[capability] = frozenset(models)
    monkeypatch.setattr(allowed_models, "ALLOWED_MODELS", tabela)


def _permitir_host(monkeypatch: pytest.MonkeyPatch, *hosts: str) -> None:
    """Simula a PR que declara um destino como subprocessador revisado."""
    monkeypatch.setattr(allowed_models, "ALLOWED_HOSTS", frozenset(hosts))


async def _capturar(chamada) -> Exception | None:
    """Roda a chamada e devolve a exceção, em vez de deixá-la propagar.

    Existe para que a **primeira** asserção do teste possa ser "nada saiu", e não
    "levantou a exceção certa". Com `pytest.raises` envolvendo a chamada, remover
    a guarda falha em `DID NOT RAISE` — verdadeiro, mas descreve o contrato de
    erro, não o vazamento. Quem lê o CI vermelho precisa ler "a imagem saiu".
    """
    try:
        await chamada
    except Exception as exc:  # o teste é quem classifica a exceção, não o helper
        return exc
    return None


async def test_visao_com_modelo_nao_revisado_nao_deixa_a_foto_sair(gateway_settings, transporte):
    """O caso central da issue: `AI_MODEL_VISION` trocado no painel.

    A asserção que vale é `transporte.requests == []`. O que a issue promete não
    é um código de erro — é que **a imagem do prato não chega ao fornecedor não
    revisado**, e isso é uma afirmação sobre o que saiu pelo fio.
    """
    provider = build_provider(gateway_settings, transport=transporte)

    erro = await _capturar(
        provider.describe(PIXEL_PNG, prompt="O que é isto?", media_type="image/png")
    )

    assert transporte.requests == [], "a imagem do prato saiu para um fornecedor não revisado"
    assert isinstance(erro, AIModelNotAllowed)
    assert erro.code == "AI_MODEL_NOT_ALLOWED"
    # "Acionável" tem conteúdo: a variável errada, o valor que está lá, e o que
    # fazer. Sem isso o operador só vê "a foto parou de funcionar".
    assert "AI_MODEL_VISION" in erro.message
    assert "google/gemma-4-12b-qat" in erro.message
    assert "ALLOWED_MODELS" in erro.message


async def test_modelo_revisado_no_gateway_chega_ao_fornecedor(
    gateway_settings, transporte, monkeypatch
):
    """A outra direção. Sem ela, o guarda poderia estar recusando tudo e ninguém saber."""
    _permitir(monkeypatch, "vision", "google/gemma-4-12b-qat")
    provider = build_provider(gateway_settings, transport=transporte)

    await provider.describe(PIXEL_PNG, prompt="O que é isto?", media_type="image/png")

    assert transporte.last_json["model"] == "google/gemma-4-12b-qat"


async def test_endpoint_local_nao_exige_revisao(settings_factory, transporte):
    """LM Studio não tem subprocessador: o dado não sai da máquina.

    Se a revisão valesse aqui, a promessa da ADR 015 — "trocar de modelo é editar
    `.env` e reiniciar" — morreria no desenvolvimento inteiro, e a lista viraria
    burocracia em vez de defesa. O modelo é o mesmo do caso acima, e a lista
    continua vazia: o que muda é só o endpoint.
    """
    settings = settings_factory(ai_base_url="http://localhost:1234/v1")
    provider = build_provider(settings, transport=transporte)

    await provider.describe(PIXEL_PNG, prompt="O que é isto?", media_type="image/png")

    assert transporte.last_json["model"] == "google/gemma-4-12b-qat"


@pytest.mark.parametrize("capability", ["text", "embedding"])
async def test_texto_e_embedding_tambem_passam_pela_revisao(
    gateway_settings, transporte, capability
):
    """Não é só a foto. A frase digitada e o texto embeddado também saem do app.

    Cobrir só visão deixaria `AI_MODEL_TEXT` como porta aberta — e o modo de
    falha da lista é justamente esquecer uma capacidade, não errar a regra.
    """
    provider = build_provider(gateway_settings, transport=transporte)

    chamada = (
        provider.complete("comi arroz e feijão no almoço")
        if capability == "text"
        else provider.embed(["arroz"])
    )
    erro = await _capturar(chamada)

    assert transporte.requests == [], "o texto do usuário saiu para um fornecedor não revisado"
    assert isinstance(erro, AIModelNotAllowed)
    assert CAPABILITY_ENV_VARS[capability] in erro.message


@pytest.mark.parametrize("capability", ["vision", "text", "embedding"])
async def test_trocar_a_base_url_para_proxy_nao_revisado_nao_deixa_nada_sair(
    proxy_nao_revisado_settings, transporte, capability
):
    """O buraco que a lista de modelos não via: a troca é de `AI_BASE_URL`.

    Todos os modelos configurados estão revisados; quem mudou foi *a máquina que
    recebe os bytes*. Um gateway roteia para muitos fornecedores e muitos
    gateways servem o mesmo nome de modelo — nenhuma das duas listas implica a
    outra, então vigiar só o nome deixava a foto sair para um terceiro não
    declarado sem diff, sem erro e sem sintoma.
    """
    provider = build_provider(proxy_nao_revisado_settings, transport=transporte)

    chamada = {
        "vision": lambda: provider.describe(
            PIXEL_PNG, prompt="O que é isto?", media_type="image/png"
        ),
        "text": lambda: provider.complete("comi arroz e feijão no almoço"),
        "embedding": lambda: provider.embed(["arroz"]),
    }[capability]
    erro = await _capturar(chamada())

    assert transporte.requests == [], "o dado saiu para um destino não revisado"
    assert isinstance(erro, AIEndpointNotAllowed)
    assert erro.code == "AI_ENDPOINT_NOT_ALLOWED"
    # Código próprio, e não o do modelo: a correção é outra variável e outra
    # lista. Mandar quem opera mexer em `ALLOWED_MODELS` aqui seria mandá-lo
    # para o lugar errado.
    assert erro.code != "AI_MODEL_NOT_ALLOWED"
    assert "api.deepinfra.com" in erro.message
    assert "ALLOWED_HOSTS" in erro.message


async def test_destino_revisado_com_modelo_revisado_chega_ao_fornecedor(
    gateway_settings, transporte, monkeypatch
):
    """A outra direção das duas listas juntas: com host e modelo revisados, passa."""
    _permitir(monkeypatch, "vision", "google/gemma-4-12b-qat")
    provider = build_provider(gateway_settings, transport=transporte)

    await provider.describe(PIXEL_PNG, prompt="O que é isto?", media_type="image/png")

    assert str(transporte.requests[-1].url).startswith(f"https://{GATEWAY_HOST}/")


async def test_afrouxar_a_lista_de_credencial_nao_afrouxa_a_de_privacidade(
    settings_factory, transporte, monkeypatch
):
    """As duas listas de "isto é local" são separadas, e este caso é o que prende isso.

    `settings.LOCAL_HOSTS` existe para uma pergunta de conveniência — "chave
    vazia aqui é descuido ou é o normal?". Se a revisão de privacidade lesse
    *ela*, acrescentar um host para parar de preencher `AI_API_KEY` desligaria a
    revisão de subprocessador inteira, sem que ninguém percebesse a relação.
    """
    monkeypatch.setattr(
        settings_module, "LOCAL_HOSTS", settings_module.LOCAL_HOSTS | {"api.deepinfra.com"}
    )
    settings = settings_factory(ai_base_url=OUTRO_PROXY, ai_api_key="")
    provider = build_provider(settings, transport=transporte)

    erro = await _capturar(
        provider.describe(PIXEL_PNG, prompt="O que é isto?", media_type="image/png")
    )

    assert transporte.requests == [], "a imagem saiu porque a lista de credencial foi afrouxada"
    assert isinstance(erro, AIEndpointNotAllowed)


def test_health_expoe_o_destino_nao_revisado(proxy_nao_revisado_settings):
    """Um fato só, e não um por capacidade: se o destino recusa, nenhuma delas envia nada."""
    corpo = TestClient(create_app(proxy_nao_revisado_settings)).get("/health").json()

    assert corpo["ai"]["unreviewed_host"] is not None
    assert "api.deepinfra.com" in corpo["ai"]["unreviewed_host"]


def test_capabilities_nao_anuncia_nada_com_destino_nao_revisado(proxy_nao_revisado_settings):
    """Com os três modelos revisados, o que zera o anúncio é só o destino."""
    corpo = TestClient(create_app(proxy_nao_revisado_settings)).get("/capabilities").json()

    assert corpo["capabilities"] == {
        "text": None,
        "vision": None,
        "embedding": None,
        "transcription": None,
    }


async def test_capacidade_sem_modelo_continua_dizendo_que_falta_configurar(settings_factory):
    """Modelo vazio não é modelo não revisado.

    São ações opostas para quem opera — "preencha a variável" contra "revise o
    fornecedor". Sem este caso, a lista vazia transformaria todo esquecimento de
    configuração numa acusação de privacidade.
    """
    settings = settings_factory(ai_base_url=GATEWAY, ai_api_key="cf-token", ai_model_vision="")
    duplo = RecordingTransport(lambda _r: chat_response("x"))
    provider = build_provider(settings, transport=duplo)

    with pytest.raises(AIProviderNotConfigured) as excinfo:
        await provider.describe(PIXEL_PNG, prompt="O que é isto?", media_type="image/png")

    assert "AI_MODEL_VISION" in excinfo.value.message


def test_toda_capacidade_declarada_tem_entrada_na_lista():
    """Guarda de esquecimento, no espírito do `tool-catalog.spec.ts`.

    Capacidade nova (transcrição, em #141) sem entrada aqui cairia no `.get()`
    com `frozenset()` — recusaria tudo, o que é seguro, mas passaria em silêncio
    pela pergunta que importa: alguém revisou o fornecedor de áudio?
    """
    assert set(allowed_models.ALLOWED_MODELS) == set(CAPABILITIES)
    assert set(CAPABILITY_ENV_VARS) == set(CAPABILITIES)


def test_configured_models_le_todo_ai_model_que_ja_existe(settings_factory):
    """Guarda de esquecimento com dente, ao contrário da de cima.

    A anterior confere só que as **chaves** existem, e por isso não pega o modo
    de falha real: `configured_models` devolve `"transcription": ""` fixo em
    código. Quando a #141 acrescentar `ai_model_transcription` às settings,
    `/health` e `/capabilities` continuariam dizendo "transcrição não está
    configurada" com o modelo configurado — e nenhuma asserção de chave acusaria.

    Aqui a pergunta é outra: para toda capacidade cuja variável **já existe** nas
    settings, o valor lido tem de ser o que está lá. A capacidade que ainda não
    tem variável fica prendida pelo ramo de baixo, que é o que documenta o `""`
    fixo como correto *enquanto* ela não existir.
    """
    sentinela = "modelo-sentinela"

    for capability, env_var in CAPABILITY_ENV_VARS.items():
        campo = env_var.lower()
        if campo not in AgentSettings.model_fields:
            assert configured_models(settings_factory())[capability] == "", (
                f"{env_var} não existe em AgentSettings, então `configured_models` só pode "
                f"devolver vazio para '{capability}'."
            )
            continue

        settings = settings_factory(**{campo: sentinela})
        assert configured_models(settings)[capability] == sentinela, (
            f"{env_var} existe em AgentSettings, mas `configured_models` não devolve o valor "
            f"dela para a capacidade '{capability}' — /health e /capabilities vão anunciar a "
            "capacidade como não configurada com ela configurada, e a revisão de modelo dela "
            "nunca roda."
        )


def test_capabilities_nao_anuncia_modelo_nao_revisado(gateway_settings):
    """A rota anuncia o que a próxima chamada aceita, não o que está no `.env`.

    Anunciar `vision: gemma` e recusar a chamada seguinte faria o operador
    procurar o problema no lugar errado.
    """
    corpo = TestClient(create_app(gateway_settings)).get("/capabilities").json()

    assert corpo["capabilities"] == {
        "text": None,
        "vision": None,
        "embedding": None,
        "transcription": None,
    }


def test_health_expoe_o_motivo_da_recusa_por_capacidade(gateway_settings):
    """A troca de `AI_MODEL_*` no painel é silenciosa; `/health` é onde ela deixa de ser."""
    corpo = TestClient(create_app(gateway_settings)).get("/health").json()

    assert corpo["status"] == "ok"
    assert corpo["ai"]["configured"] is True
    assert set(corpo["ai"]["unreviewed_models"]) == {"text", "vision", "embedding"}


def test_health_local_nao_acusa_nada(settings_factory):
    corpo = TestClient(create_app(settings_factory())).get("/health").json()

    assert corpo["ai"]["unreviewed_models"] == {}


def test_usable_models_segue_a_lista_revisada(gateway_settings, monkeypatch):
    _permitir(monkeypatch, "text", "ornith-1.0-9b")

    usaveis = usable_models(gateway_settings)

    assert usaveis["text"] == "ornith-1.0-9b"
    assert usaveis["vision"] is None
