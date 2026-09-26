"""O ditado do chat (#141): áudio cru entra, texto sai, nada fica.

O provedor responde no formato documentado do `/audio/transcriptions` da OpenAI
com `response_format=verbose_json` — `text` e `duration` —, que é o que o
gateway e os servidores compatíveis implementam.
"""

import httpx
import pytest
from fastapi.testclient import TestClient

import fatia_agent.api as api_module
from fatia_agent.api import MAX_AUDIO_BYTES, create_app
from fatia_agent.providers import build_provider as build_provider_real
from fatia_agent.providers.openai_compat import OpenAICompatProvider

AUDIO = b"\x1aE\xdf\xa3webm-de-mentira"


def _app(
    settings_factory, monkeypatch, resposta: httpx.Response, **overrides: object
) -> tuple[TestClient, list[httpx.Request]]:
    pedidos: list[httpx.Request] = []

    def responder(request: httpx.Request) -> httpx.Response:
        request.read()
        pedidos.append(request)
        return resposta

    def build_provider_fake(settings, *, transport=None) -> OpenAICompatProvider:
        return build_provider_real(settings, transport=httpx.MockTransport(responder))

    monkeypatch.setattr(api_module, "build_provider", build_provider_fake)
    settings = settings_factory(**{"ai_model_transcription": "whisper-1", **overrides})
    return TestClient(create_app(settings)), pedidos


def test_transcreve_e_devolve_a_duracao_como_unidade(settings_factory, monkeypatch) -> None:
    client, pedidos = _app(
        settings_factory,
        monkeypatch,
        httpx.Response(200, json={"text": " registra 200 g de frango ", "duration": 3.4}),
    )

    resposta = client.post(
        "/transcribe", content=AUDIO, headers={"content-type": "audio/webm;codecs=opus"}
    )

    assert resposta.status_code == 200
    assert resposta.json() == {
        "text": "registra 200 g de frango",
        "usage": {"model": "whisper-1", "inputUnits": 3.4},
    }
    enviado = pedidos[0]
    assert enviado.url.path.endswith("/audio/transcriptions")
    assert enviado.headers["cf-aig-collect-log"] == "false"
    corpo = enviado.content
    assert b'name="model"\r\n\r\nwhisper-1' in corpo
    assert b'name="response_format"\r\n\r\nverbose_json' in corpo
    assert b'filename="audio.webm"' in corpo
    assert AUDIO in corpo


def test_sem_duracao_a_unidade_fica_de_fora(settings_factory, monkeypatch) -> None:
    client, _ = _app(settings_factory, monkeypatch, httpx.Response(200, json={"text": "oi"}))

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/ogg"})

    assert resposta.json()["usage"] == {"model": "whisper-1"}


@pytest.mark.parametrize(
    ("tipo", "status"), [("audio/flac", 415), ("application/json", 415), ("", 415)]
)
def test_recusa_formato_nao_aceito(settings_factory, monkeypatch, tipo: str, status: int) -> None:
    client, pedidos = _app(settings_factory, monkeypatch, httpx.Response(200, json={"text": ""}))

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": tipo})

    assert resposta.status_code == status
    assert pedidos == []


def test_recusa_corpo_vazio_e_grande_demais(settings_factory, monkeypatch) -> None:
    client, pedidos = _app(settings_factory, monkeypatch, httpx.Response(200, json={"text": ""}))

    vazio = client.post("/transcribe", content=b"", headers={"content-type": "audio/webm"})
    grande = client.post(
        "/transcribe",
        content=b"\0" * (MAX_AUDIO_BYTES + 1),
        headers={"content-type": "audio/webm"},
    )

    assert (vazio.status_code, grande.status_code) == (400, 413)
    assert pedidos == []


def test_sem_modelo_de_transcricao_degrada_com_status(settings_factory, monkeypatch) -> None:
    client, pedidos = _app(
        settings_factory,
        monkeypatch,
        httpx.Response(200, json={"text": ""}),
        ai_model_transcription="",
    )

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/webm"})

    assert resposta.status_code == 503
    assert resposta.json()["error"]["code"] == "AI_PROVIDER_NOT_CONFIGURED"
    assert "AI_MODEL_TRANSCRIPTION" in resposta.json()["error"]["message"]
    assert pedidos == []


def test_exige_a_chave_do_agente_quando_a_inferencia_e_paga(settings_factory, monkeypatch) -> None:
    client, pedidos = _app(
        settings_factory,
        monkeypatch,
        httpx.Response(200, json={"text": ""}),
        agent_api_key="segredo-combinado",
    )

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/webm"})

    assert resposta.status_code == 401
    assert pedidos == []
