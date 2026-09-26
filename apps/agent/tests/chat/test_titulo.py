"""O título da conversa: curto, limpo, com custo medido, e nunca uma falha."""

from fastapi.testclient import TestClient

from fatia_agent.api import create_app
from fatia_agent.chat.titulo import MAX_TITULO, Titulo, gerar_titulo
from fatia_agent.providers import build_provider

from .support import ProviderRecordingTransport, bloco_de_uso, fragmento_de_texto


async def _titulo(
    settings_factory, *fragmentos: dict[str, object]
) -> tuple[Titulo, ProviderRecordingTransport]:
    transporte = ProviderRecordingTransport([list(fragmentos)])
    provider = build_provider(settings_factory(), transport=transporte)
    try:
        return await gerar_titulo(provider, "registra 200 g de frango no almoço"), transporte
    finally:
        await provider.aclose()


async def test_limpa_aspas_e_ponto_e_mede_o_custo(settings_factory):
    gerado, transporte = await _titulo(
        settings_factory, fragmento_de_texto('"Almoço com frango."\n'), bloco_de_uso()
    )

    assert gerado.titulo == "Almoço com frango"
    assert gerado.usage is not None
    assert gerado.usage.input_units == 812
    # Sem tools: nomear não chama o `/mcp`.
    assert "tools" not in transporte.corpos[0]


async def test_resposta_longa_e_cortada_no_teto_da_lista(settings_factory):
    gerado, _ = await _titulo(settings_factory, fragmento_de_texto("palavra " * 30))
    assert gerado.titulo is not None
    assert len(gerado.titulo) <= MAX_TITULO


async def test_resposta_vazia_nao_vira_titulo(settings_factory):
    gerado, _ = await _titulo(settings_factory, fragmento_de_texto("   \n"))
    assert gerado.titulo is None


def test_rota_sem_provedor_degrada_com_status(settings_factory):
    resposta = TestClient(create_app(settings_factory(ai_base_url=""))).post(
        "/title", json={"text": "oi"}
    )
    assert resposta.status_code == 503
    assert resposta.json()["error"]["code"] == "AI_PROVIDER_NOT_CONFIGURED"


def test_rota_exige_a_chave_do_agente_quando_a_inferencia_e_paga(settings_factory):
    resposta = TestClient(
        create_app(
            settings_factory(
                ai_base_url="https://gateway.ai.cloudflare.com/v1/conta/fatia/openai",
                ai_api_key="cf",
                agent_api_key="segredo",
            )
        )
    ).post("/title", json={"text": "oi"})
    assert resposta.status_code == 401
    assert resposta.json()["error"]["code"] == "AGENT_KEY_REJECTED"
