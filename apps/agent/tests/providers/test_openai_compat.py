"""O cliente OpenAI-compatível, contra um duplo do provedor."""

import base64
import json

import httpx
import pytest

from fatia_agent.providers import build_provider
from fatia_agent.providers.errors import (
    AIProviderNotConfigured,
    AIProviderRefused,
    AIProviderTimeout,
    AIResponseTruncated,
    AIResponseUnparseable,
)
from fatia_agent.providers.openai_compat import OpenAICompatProvider
from tests.support import RecordingTransport, chat_response

PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def make_provider(transport: httpx.MockTransport, **overrides: object) -> OpenAICompatProvider:
    kwargs: dict[str, object] = {
        "base_url": "http://localhost:1234/v1",
        "text_model": "ornith-1.0-9b",
        "vision_model": "google/gemma-4-12b-qat",
        "embedding_model": "text-embedding-nomic-embed-text-v1.5",
        "max_retries": 2,
        "retry_backoff_s": 0.0,
        "transport": transport,
    }
    kwargs.update(overrides)
    return OpenAICompatProvider(**kwargs)  # type: ignore[arg-type]


async def test_texto_devolve_o_conteudo_e_pede_o_modelo_de_texto():
    transport = RecordingTransport(lambda _r: chat_response("120 g de arroz"))
    async with make_provider(transport) as provider:
        assert await provider.complete("Quanto pesa?", system="Responda curto.") == "120 g de arroz"

    assert transport.requests[-1].url.path == "/v1/chat/completions"
    body = transport.last_json
    assert body["model"] == "ornith-1.0-9b"
    assert body["messages"] == [
        {"role": "system", "content": "Responda curto."},
        {"role": "user", "content": "Quanto pesa?"},
    ]


async def test_visao_manda_a_imagem_como_data_uri_no_modelo_de_visao():
    transport = RecordingTransport(lambda _r: chat_response("um prato de arroz"))
    async with make_provider(transport) as provider:
        assert await provider.describe(PIXEL_PNG, prompt="O que é isto?", media_type="image/png")

    body = transport.last_json
    assert body["model"] == "google/gemma-4-12b-qat"
    partes = body["messages"][0]["content"]  # type: ignore[index]
    assert partes[0] == {"type": "text", "text": "O que é isto?"}
    esperado = "data:image/png;base64," + base64.b64encode(PIXEL_PNG).decode("ascii")
    assert partes[1]["image_url"]["url"] == esperado


async def test_trocar_de_modelo_e_so_configuracao():
    """O critério de pronto da issue: trocar o modelo de visão sem tocar em `.py`.

    Mesmo código de produto (`describe`), duas configurações, dois modelos no
    fio. Se algum dia o nome do modelo for parar dentro do provedor, este teste
    passa a ver o mesmo valor nas duas chamadas.
    """
    transport = RecordingTransport(lambda _r: chat_response("ok"))
    modelos: list[object] = []
    for modelo in ("google/gemma-4-12b-qat", "ornith-1.0-9b"):
        async with make_provider(transport, vision_model=modelo) as provider:
            await provider.describe(PIXEL_PNG, prompt="?")
        modelos.append(transport.last_json["model"])

    assert modelos == ["google/gemma-4-12b-qat", "ornith-1.0-9b"]


async def test_embeddings_sao_reordenados_pelo_index():
    def handler(_request: httpx.Request) -> httpx.Response:
        # O provedor tem liberdade de devolver fora de ordem; quem pareia é o `index`.
        return httpx.Response(
            200,
            json={
                "data": [
                    {"index": 1, "embedding": [0.3, 0.4]},
                    {"index": 0, "embedding": [0.1, 0.2]},
                ]
            },
        )

    transport = RecordingTransport(handler)
    async with make_provider(transport) as provider:
        assert await provider.embed(["arroz", "feijão"]) == [[0.1, 0.2], [0.3, 0.4]]


async def test_sem_api_key_nao_manda_header_de_autorizacao():
    transport = RecordingTransport(lambda _r: chat_response("ok"))
    async with make_provider(transport, api_key="") as provider:
        await provider.complete("oi")
    assert "authorization" not in transport.requests[-1].headers


async def test_com_api_key_manda_bearer():
    transport = RecordingTransport(lambda _r: chat_response("ok"))
    async with make_provider(transport, api_key="cf-token") as provider:
        await provider.complete("oi")
    assert transport.requests[-1].headers["authorization"] == "Bearer cf-token"


async def test_401_vira_refused_e_nao_e_repetido():
    transport = RecordingTransport(lambda _r: httpx.Response(401, json={"error": "no"}))
    async with make_provider(transport) as provider:
        with pytest.raises(AIProviderRefused) as excinfo:
            await provider.complete("oi")

    assert excinfo.value.status_code == 401
    assert excinfo.value.code == "AI_PROVIDER_REFUSED"
    # Credencial errada não melhora na segunda tentativa; repetir só gasta cota.
    assert len(transport.requests) == 1


async def test_429_e_repetido_ate_o_limite_e_entao_vira_refused():
    transport = RecordingTransport(lambda _r: httpx.Response(429, json={"error": "slow down"}))
    async with make_provider(transport, max_retries=2) as provider:
        with pytest.raises(AIProviderRefused) as excinfo:
            await provider.complete("oi")

    assert excinfo.value.status_code == 429
    assert len(transport.requests) == 3  # 1 tentativa + 2 retries


async def test_429_que_depois_responde_bem_devolve_o_conteudo():
    respostas = [httpx.Response(429, json={}), chat_response("deu certo")]

    def handler(_request: httpx.Request) -> httpx.Response:
        return respostas.pop(0)

    transport = RecordingTransport(handler)
    async with make_provider(transport) as provider:
        assert await provider.complete("oi") == "deu certo"
    assert len(transport.requests) == 2


async def test_timeout_vira_erro_nomeado_com_o_nome_da_variavel():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("estourou", request=request)

    transport = RecordingTransport(handler)
    async with make_provider(transport, max_retries=1) as provider:
        with pytest.raises(AIProviderTimeout) as excinfo:
            await provider.complete("oi")

    assert "AI_TIMEOUT_S" in excinfo.value.message
    assert len(transport.requests) == 2


async def test_corpo_que_nao_e_json_vira_unparseable():
    transport = RecordingTransport(lambda _r: httpx.Response(200, text="<html>gateway page</html>"))
    async with make_provider(transport) as provider:
        with pytest.raises(AIResponseUnparseable):
            await provider.complete("oi")


async def test_resposta_sem_choices_vira_unparseable():
    transport = RecordingTransport(lambda _r: httpx.Response(200, json={"choices": []}))
    async with make_provider(transport) as provider:
        with pytest.raises(AIResponseUnparseable):
            await provider.complete("oi")


async def test_finish_reason_length_nao_devolve_texto_pela_metade():
    """Truncar em silêncio é o pior desfecho: parece sucesso."""
    transport = RecordingTransport(lambda _r: chat_response("120 g de arr", finish_reason="length"))
    async with make_provider(transport) as provider:
        with pytest.raises(AIResponseTruncated) as excinfo:
            await provider.complete("oi")

    assert excinfo.value.code == "AI_RESPONSE_TRUNCATED"


async def test_capacidade_sem_modelo_configurado_degrada_com_o_nome_da_variavel():
    transport = RecordingTransport(lambda _r: chat_response("ok"))
    async with make_provider(transport, vision_model="") as provider:
        with pytest.raises(AIProviderNotConfigured) as excinfo:
            await provider.describe(PIXEL_PNG, prompt="?")

    assert "AI_MODEL_VISION" in excinfo.value.message
    # Não chegou a sair requisição nenhuma: degradou antes da rede.
    assert transport.requests == []


async def test_list_models_le_os_ids(settings_factory):
    transport = RecordingTransport(
        lambda _r: httpx.Response(200, json={"data": [{"id": "ornith-1.0-9b"}, {"id": "x"}]})
    )
    async with build_provider(settings_factory(), transport=transport) as provider:
        assert await provider.list_models() == ["ornith-1.0-9b", "x"]
    assert transport.requests[-1].url.path == "/v1/models"


async def test_json_do_pedido_nao_carrega_campo_de_identidade(settings_factory):
    """O agente não manda `userId` para o provedor de modelo.

    Isolamento é da aplicação (ADR 010) e a leitura de dado passa pelo `/mcp`
    com o Bearer do usuário (ADR 015). O provedor de inferência não tem por que
    receber identidade nenhuma.
    """
    transport = RecordingTransport(lambda _r: chat_response("ok"))
    async with build_provider(settings_factory(), transport=transport) as provider:
        await provider.complete("oi")

    bruto = json.dumps(transport.last_json).lower()
    for proibido in ("userid", "user_id", "email", "bearer"):
        assert proibido not in bruto
