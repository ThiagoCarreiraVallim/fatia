"""Reconhecimento de refeição por foto (#139) — sem rede e sem LM Studio ligado.

O provedor é substituído por um duplo que devolve exatamente o texto que se quer
exercitar. O que importa afirmar aqui **não é o acerto do modelo** — quem mede
acerto é a #138 — e sim que toda forma de resposta que um modelo real produz
vira ou dado validado ou erro nomeado, nunca exceção crua nem lista com lixo.
"""

import base64
import json

import pytest
from fastapi.testclient import TestClient

from fatia_agent.api import MAX_IMAGEM_BYTES, create_app
from fatia_agent.providers.errors import AIProviderRefused, AIResponseUnparseable
from fatia_agent.recognition import recognize_meal
from fatia_agent.schemas.recognized_meal import parse_recognized_meal

# JPEG mínimo de verdade (SOI + EOI). Serve para o corpo da requisição: o agente
# não decodifica imagem, quem faz isso é o provedor.
JPEG_MINIMO = bytes.fromhex("ffd8ffd9")

RESPOSTA_BOA = json.dumps(
    {
        "items": [
            {
                "name": "arroz branco cozido",
                "grams": 150,
                "confidence": 0.82,
                "kcal": 193,
                "protein_g": 3.6,
                "carbs_g": 42.0,
                "fat_g": 0.3,
            },
            {"name": "feijão carioca cozido", "grams": 90, "confidence": 0.61},
        ],
        "note": None,
    },
    ensure_ascii=False,
)


class VisaoFalsa:
    """Duplo da `VisionCapability`. Guarda o que recebeu, para poder afirmar."""

    def __init__(self, resposta: str | Exception) -> None:
        self._resposta = resposta
        self.chamadas: list[tuple[bytes, str, str]] = []

    async def describe(self, image: bytes, *, prompt: str, media_type: str = "image/jpeg") -> str:
        self.chamadas.append((image, prompt, media_type))
        if isinstance(self._resposta, Exception):
            raise self._resposta
        return self._resposta

    async def aclose(self) -> None:  # pragma: no cover - simetria com o provedor real
        return None


# --- a função de reconhecimento --------------------------------------------


async def test_resposta_bem_formada_vira_itens():
    meal = await recognize_meal(VisaoFalsa(RESPOSTA_BOA), JPEG_MINIMO)

    assert [item.name for item in meal.items] == ["arroz branco cozido", "feijão carioca cozido"]
    assert meal.items[0].grams == 150
    assert meal.items[0].kcal == 193
    # Macro ausente permanece ausente. Virar zero faria "não sei" e "não tem"
    # ficarem indistinguíveis, e um item com 0 kcal entra na refeição sem sintoma.
    assert meal.items[1].kcal is None


async def test_itens_saem_do_mais_confiavel_para_o_menos():
    """A tela de confirmação só protege se for lida — e lê-se de cima para baixo."""
    resposta = json.dumps(
        {
            "items": [
                {"name": "couve refogada", "grams": 40, "confidence": 0.2},
                {"name": "arroz branco cozido", "grams": 150, "confidence": 0.9},
                {"name": "bife grelhado", "grams": 120, "confidence": 0.5},
            ]
        }
    )

    meal = await recognize_meal(VisaoFalsa(resposta), JPEG_MINIMO)

    assert [item.name for item in meal.items] == [
        "arroz branco cozido",
        "bife grelhado",
        "couve refogada",
    ]


async def test_resposta_em_prosa_vira_erro_nomeado():
    """O modo estruturado é irregular entre modelos; prosa acontece de verdade.

    Sem este caminho, um modelo educado derrubava a rota com `JSONDecodeError`
    cru — sem `code`, e portanto sem como o NestJS mandar a pessoa para o
    registro manual.
    """
    resposta = "Analisando a foto, vejo arroz, feijão e um bife. Bom apetite!"

    with pytest.raises(AIResponseUnparseable) as excecao:
        await recognize_meal(VisaoFalsa(resposta), JPEG_MINIMO)

    assert excecao.value.code == "AI_RESPONSE_UNPARSEABLE"


async def test_json_embrulhado_em_markdown_e_aceito():
    """Crase é o embrulho mais comum, e recusá-lo seria recusar resposta certa."""
    resposta = f"Claro! Aqui está:\n\n```json\n{RESPOSTA_BOA}\n```\n\nEspero ter ajudado."

    meal = await recognize_meal(VisaoFalsa(resposta), JPEG_MINIMO)

    assert len(meal.items) == 2


async def test_item_sem_gramas_reprova_a_resposta_inteira():
    """Meio item é pior que nenhum: sem porção não há macro, e o item entraria mudo."""
    resposta = json.dumps({"items": [{"name": "arroz", "confidence": 0.5}]})

    with pytest.raises(AIResponseUnparseable):
        await recognize_meal(VisaoFalsa(resposta), JPEG_MINIMO)


async def test_gramas_zero_ou_negativa_reprova():
    resposta = json.dumps({"items": [{"name": "arroz", "grams": 0, "confidence": 0.5}]})

    with pytest.raises(AIResponseUnparseable):
        await recognize_meal(VisaoFalsa(resposta), JPEG_MINIMO)


async def test_foto_sem_comida_devolve_lista_vazia_e_nao_erro():
    """Foto de gato é resposta legítima, não falha.

    Erro aqui viraria "tente de novo" na UI; o certo é "não identifiquei" e o
    caminho manual aberto, que é o que a issue chama de não ter beco sem saída.
    """
    resposta = json.dumps({"items": [], "note": "não identifiquei alimentos na foto"})

    meal = await recognize_meal(VisaoFalsa(resposta), JPEG_MINIMO)

    assert meal.items == []
    assert meal.note is not None


async def test_erro_do_provedor_atravessa_sem_ser_engolido():
    visao = VisaoFalsa(AIProviderRefused("o gateway recusou", status_code=429))

    with pytest.raises(AIProviderRefused) as excecao:
        await recognize_meal(visao, JPEG_MINIMO)

    assert excecao.value.status_code == 429


async def test_o_prompt_de_sistema_viaja_junto_da_imagem():
    """Parte dos endpoints ignora `system` quando a mensagem do usuário é
    multimodal. Um "responda apenas JSON" descartado em silêncio é como se perde
    o modo estruturado sem nenhum sintoma — daí ele ir no mesmo bloco de texto."""
    visao = VisaoFalsa(RESPOSTA_BOA)

    await recognize_meal(visao, JPEG_MINIMO, media_type="image/png")

    imagem, prompt, media_type = visao.chamadas[0]
    assert imagem == JPEG_MINIMO
    assert media_type == "image/png"
    assert "APENAS com JSON" in prompt
    assert '"confidence"' in prompt


# --- o parser, isolado ------------------------------------------------------


def test_chave_dentro_de_string_nao_desbalanceia_o_parser():
    """`{` dentro do nome do prato quebrava qualquer contagem ingênua de chaves."""
    texto = 'blá {"items":[{"name":"pão {caseiro}","grams":50,"confidence":0.4}]} blá'

    meal = parse_recognized_meal(texto)

    assert meal.items[0].name == "pão {caseiro}"


def test_nome_com_espaco_sobrando_e_normalizado():
    texto = '{"items":[{"name":"  arroz   branco  ","grams":10,"confidence":0.1}]}'

    assert parse_recognized_meal(texto).items[0].name == "arroz branco"


def test_confianca_fora_da_faixa_reprova():
    texto = '{"items":[{"name":"arroz","grams":10,"confidence":8}]}'

    with pytest.raises(AIResponseUnparseable):
        parse_recognized_meal(texto)


def test_a_mensagem_de_erro_nao_carrega_o_nome_do_alimento():
    """A mensagem vai para log, e nome de alimento é dado de saúde.

    `docs/DATA_RETENTION.md` afirma que nada do que a pessoa comeu aparece em
    log; o dump de erro do pydantic traria a lista inteira de volta.
    """
    texto = '{"items":[{"name":"whey isolado sabor baunilha","grams":30,"confidence":9}]}'

    with pytest.raises(AIResponseUnparseable) as excecao:
        parse_recognized_meal(texto)

    assert "whey" not in str(excecao.value).lower()


# --- a rota HTTP ------------------------------------------------------------


def _corpo(imagem: bytes = JPEG_MINIMO, media_type: str = "image/jpeg") -> dict[str, str]:
    return {
        "image_base64": base64.b64encode(imagem).decode("ascii"),
        "media_type": media_type,
    }


@pytest.fixture
def client_com_visao(settings_factory, monkeypatch):
    """App com o provedor trocado por um duplo, sem mexer no transporte HTTP."""

    def _factory(resposta: str | Exception, **overrides: object) -> TestClient:
        import fatia_agent.api as modulo

        monkeypatch.setattr(modulo, "build_provider", lambda _settings: VisaoFalsa(resposta))
        return TestClient(create_app(settings_factory(**overrides)))

    return _factory


def test_rota_devolve_os_itens_reconhecidos(client_com_visao):
    resposta = client_com_visao(RESPOSTA_BOA).post("/recognize-meal", json=_corpo())

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert [item["name"] for item in corpo["items"]] == [
        "arroz branco cozido",
        "feijão carioca cozido",
    ]


def test_rota_nao_aceita_campo_de_identidade_no_corpo(client_com_visao):
    """O agente não sabe de quem é a foto, e não deve passar a saber.

    `extra: forbid` é o que impede que alguém acrescente `user_id` "só para o
    log" e crie um segundo lugar onde o dado do usuário existe.
    """
    corpo = {**_corpo(), "user_id": "00000000-0000-0000-0000-000000000000"}

    resposta = client_com_visao(RESPOSTA_BOA).post("/recognize-meal", json=corpo)

    assert resposta.status_code == 422


def test_media_type_nao_suportado_responde_415(client_com_visao):
    """HEIC é o padrão do iPhone e os endpoints de visão não o aceitam."""
    resposta = client_com_visao(RESPOSTA_BOA).post(
        "/recognize-meal", json=_corpo(media_type="image/heic")
    )

    assert resposta.status_code == 415


def test_base64_invalido_responde_400(client_com_visao):
    resposta = client_com_visao(RESPOSTA_BOA).post(
        "/recognize-meal", json={"image_base64": "não é base64!!", "media_type": "image/jpeg"}
    )

    assert resposta.status_code == 400


def test_imagem_acima_do_teto_responde_413(client_com_visao):
    """O teto do chamador não é teto: quem paga a inferência é este serviço."""
    grande = b"\xff\xd8" + b"\x00" * MAX_IMAGEM_BYTES

    resposta = client_com_visao(RESPOSTA_BOA).post("/recognize-meal", json=_corpo(grande))

    assert resposta.status_code == 413


def test_prosa_do_modelo_vira_502_com_code_estavel(client_com_visao):
    resposta = client_com_visao("Vejo arroz e feijão no prato.").post(
        "/recognize-meal", json=_corpo()
    )

    assert resposta.status_code == 502
    assert resposta.json()["error"]["code"] == "AI_RESPONSE_UNPARSEABLE"


def test_sem_provedor_configurado_a_rota_degrada_com_code(settings_factory):
    client = TestClient(create_app(settings_factory(ai_base_url="")))

    resposta = client.post("/recognize-meal", json=_corpo())

    assert resposta.status_code == 503
    assert resposta.json()["error"]["code"] == "AI_PROVIDER_NOT_CONFIGURED"


# --- a guarda de custo ------------------------------------------------------


def test_endpoint_remoto_sem_segredo_recusa_antes_de_inferir(settings_factory, monkeypatch):
    """Proxy aberto para gateway pago é a armadilha da ADR 018.

    Não é 401: quem chamou não tem como consertar mandando outra coisa. É
    configuração nossa faltando — e o teto de gasto some sem nenhum sintoma até
    a fatura.
    """
    import fatia_agent.api as modulo

    chamou = False

    def _nao_deveria(_settings: object) -> object:
        nonlocal chamou
        chamou = True
        raise AssertionError("o provedor não deveria ser montado")

    monkeypatch.setattr(modulo, "build_provider", _nao_deveria)
    client = TestClient(
        create_app(
            settings_factory(
                ai_base_url="https://gateway.ai.cloudflare.com/v1/conta/gw/openai",
                ai_api_key="cf-token",
                agent_api_key="",
            )
        )
    )

    resposta = client.post("/recognize-meal", json=_corpo())

    assert resposta.status_code == 503
    assert resposta.json()["error"]["code"] == "AI_PROVIDER_NOT_CONFIGURED"
    assert "AGENT_API_KEY" in resposta.json()["error"]["message"]
    assert chamou is False


def test_segredo_configurado_e_exigido_no_header(client_com_visao):
    client = client_com_visao(RESPOSTA_BOA, agent_api_key="segredo-do-compose")

    sem_header = client.post("/recognize-meal", json=_corpo())
    errado = client.post("/recognize-meal", json=_corpo(), headers={"X-Fatia-Agent-Key": "chute"})
    certo = client.post(
        "/recognize-meal", json=_corpo(), headers={"X-Fatia-Agent-Key": "segredo-do-compose"}
    )

    assert sem_header.status_code == 401
    assert errado.status_code == 401
    assert certo.status_code == 200
