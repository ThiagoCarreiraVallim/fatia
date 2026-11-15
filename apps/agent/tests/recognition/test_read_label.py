"""Leitura do rótulo por foto (#375, #333) — sem rede.

Como no reconhecimento do prato, o que se afirma não é o acerto do modelo, e sim
que toda resposta vira dado validado ou erro nomeado. Uma regra a mais, a que
importa no rótulo: **campo que o modelo não leu fica `None`, nunca zero** — o
`apps/api` mostra o campo em branco e a pessoa completa olhando a embalagem.
"""

import base64
import json

import pytest
from fastapi.testclient import TestClient

from fatia_agent.api import create_app
from fatia_agent.providers.base import Description, Usage
from fatia_agent.providers.errors import AIResponseUnparseable
from fatia_agent.recognition import read_label
from fatia_agent.schemas.label_reading import parse_label_reading

JPEG_MINIMO = bytes.fromhex("ffd8ffd9")

RESPOSTA_BOA = json.dumps(
    {
        "name": "Iogurte natural integral",
        "per": "100g",
        "serving_grams": 170,
        "kcal": 51,
        "protein_g": 4.1,
        "carbs_g": 5.3,
        "fat_g": 3.0,
        "fiber_g": None,
        "sodium_mg": 60,
        "note": None,
    },
    ensure_ascii=False,
)


class VisaoFalsa:
    def __init__(self, resposta: str, usage: Usage | None = None) -> None:
        self._resposta = resposta
        self._usage = usage
        self.chamadas: list[tuple[bytes, str, str]] = []

    async def describe(
        self, image: bytes, *, prompt: str, media_type: str = "image/jpeg"
    ) -> Description:
        self.chamadas.append((image, prompt, media_type))
        return Description(text=self._resposta, usage=self._usage)

    async def aclose(self) -> None:  # pragma: no cover
        return None


async def test_resposta_bem_formada_vira_rotulo():
    medido = await read_label(VisaoFalsa(RESPOSTA_BOA), JPEG_MINIMO)

    assert medido.label.name == "Iogurte natural integral"
    assert medido.label.per == "100g"
    assert medido.label.kcal == 51
    # Não lido continua não lido.
    assert medido.label.fiber_g is None


async def test_o_prompt_pede_a_tabela_nutricional():
    visao = VisaoFalsa(RESPOSTA_BOA)

    await read_label(visao, JPEG_MINIMO)

    _, prompt, _ = visao.chamadas[0]
    assert "tabela nutricional" in prompt.lower()
    assert "100 g" in prompt


def test_campo_ausente_fica_none_e_nao_zero():
    lido = parse_label_reading(json.dumps({"per": "serving", "serving_grams": 30, "kcal": 120}))

    assert lido.kcal == 120
    assert lido.protein_g is None
    assert lido.sodium_mg is None


def test_numero_negativo_vira_none_sem_derrubar_a_leitura():
    lido = parse_label_reading(json.dumps({"per": "100g", "kcal": -5, "protein_g": 3}))

    assert lido.kcal is None
    assert lido.protein_g == 3


def test_nome_e_nota_longos_sao_cortados_e_nao_viram_502():
    lido = parse_label_reading(
        json.dumps({"per": "100g", "kcal": 50, "name": "G" * 400, "note": "n" * 900})
    )

    assert lido.kcal == 50
    assert lido.name == "G" * 160
    assert lido.note == "n" * 280


def test_porcao_fora_da_faixa_some_e_o_resto_fica():
    for porcao in (0, -10, 5000, "trinta"):
        lido = parse_label_reading(
            json.dumps({"per": "serving", "serving_grams": porcao, "kcal": 120})
        )
        assert lido.serving_grams is None
        assert lido.kcal == 120


def test_texto_onde_era_numero_vira_none():
    lido = parse_label_reading(json.dumps({"per": "100g", "kcal": "muitas", "fat_g": 2}))

    assert lido.kcal is None
    assert lido.fat_g == 2


async def test_falha_de_formato_leva_o_consumo_da_chamada():
    """O provedor foi chamado e cobrou: o custo precisa chegar à cota mesmo sem rótulo."""
    uso = Usage(model="z-ai/glm-5.3-flash", input_units=900, output_units=20)

    with pytest.raises(AIResponseUnparseable) as erro:
        await read_label(VisaoFalsa("não sei", uso), JPEG_MINIMO)

    assert erro.value.usage == uso


def test_base_desconhecida_reprova():
    with pytest.raises(AIResponseUnparseable):
        parse_label_reading(json.dumps({"per": "xícara", "kcal": 5}))


def test_prosa_sem_json_vira_erro_nomeado():
    with pytest.raises(AIResponseUnparseable):
        parse_label_reading("Não consegui ler a tabela.")


def test_foto_sem_tabela_devolve_tudo_vazio_com_nota():
    lido = parse_label_reading(
        json.dumps({"per": "100g", "note": "não encontrei a tabela nutricional"})
    )

    assert lido.kcal is None
    assert lido.note == "não encontrei a tabela nutricional"


def _corpo() -> dict[str, str]:
    return {
        "image_base64": base64.b64encode(JPEG_MINIMO).decode("ascii"),
        "media_type": "image/jpeg",
    }


@pytest.fixture
def client_com_visao(settings_factory, monkeypatch):
    def _factory(resposta: str, usage: Usage | None = None, **overrides: object) -> TestClient:
        import fatia_agent.api as modulo

        monkeypatch.setattr(
            modulo, "build_provider", lambda _settings, **_kw: VisaoFalsa(resposta, usage)
        )
        return TestClient(create_app(settings_factory(**overrides)))

    return _factory


def test_rota_devolve_o_rotulo_e_o_consumo(client_com_visao):
    uso = Usage(model="z-ai/glm-5.3-flash", input_units=900, output_units=60)

    resposta = client_com_visao(RESPOSTA_BOA, uso).post("/read-label", json=_corpo())

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["label"]["kcal"] == 51
    assert corpo["label"]["fiber_g"] is None
    assert corpo["usage"] == {"model": "z-ai/glm-5.3-flash", "inputUnits": 900, "outputUnits": 60}


def test_rota_nao_aceita_campo_de_identidade(client_com_visao):
    corpo = {**_corpo(), "user_id": "x"}

    assert client_com_visao(RESPOSTA_BOA).post("/read-label", json=corpo).status_code == 422


def test_prosa_do_modelo_vira_502(client_com_visao):
    resposta = client_com_visao("não sei").post("/read-label", json=_corpo())

    assert resposta.status_code == 502


def test_502_de_formato_devolve_o_consumo_para_a_cota(client_com_visao):
    uso = Usage(model="z-ai/glm-5.3-flash", input_units=900, output_units=20)

    resposta = client_com_visao("não sei", uso).post("/read-label", json=_corpo())

    assert resposta.status_code == 502
    corpo = resposta.json()
    assert corpo["error"]["code"] == "AI_RESPONSE_UNPARSEABLE"
    assert corpo["usage"] == {"model": "z-ai/glm-5.3-flash", "inputUnits": 900, "outputUnits": 20}


def test_segredo_configurado_e_exigido_no_header(client_com_visao):
    """Rota de inferência anônima seria proxy aberto para o gateway pago (ADR 018)."""
    client = client_com_visao(RESPOSTA_BOA, agent_api_key="segredo-do-compose")

    sem_header = client.post("/read-label", json=_corpo())
    certo = client.post(
        "/read-label", json=_corpo(), headers={"X-Fatia-Agent-Key": "segredo-do-compose"}
    )

    assert sem_header.status_code == 401
    assert certo.status_code == 200
