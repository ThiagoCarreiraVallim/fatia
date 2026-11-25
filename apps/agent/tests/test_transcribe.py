"""O ditado do chat (#141, #488): áudio cru entra, texto sai, nada fica.

A transcrição é um `/chat/completions` com o áudio numa parte `input_audio` (base64 e formato),
o caminho que a OpenRouter aceita com a mesma exigência de retenção zero do resto. O
`/audio/transcriptions` dela é multipart e não leva o `provider.zdr`.
"""

import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

import fatia_agent.api as api_module
from fatia_agent import allowed_models
from fatia_agent.api import MAX_AUDIO_BYTES, create_app
from fatia_agent.providers import build_provider as build_provider_real
from fatia_agent.providers.openai_compat import OpenAICompatProvider
from fatia_agent.settings import OPENROUTER_TRANSCRIPTION_MODEL

AUDIO = b"\x1aE\xdf\xa3webm-de-mentira"
OPENROUTER = "https://openrouter.ai/api/v1"
CHAVE = "chave-do-agente"


def _resposta(texto: str, *, usage: dict[str, object] | None = None) -> httpx.Response:
    corpo: dict[str, object] = {
        "model": OPENROUTER_TRANSCRIPTION_MODEL,
        "choices": [{"message": {"content": texto}, "finish_reason": "stop"}],
    }
    if usage is not None:
        corpo["usage"] = usage
    return httpx.Response(200, json=corpo)


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
    settings = settings_factory(
        **{
            "ai_base_url": OPENROUTER,
            "ai_api_key": "or-token",
            "ai_model_text": "z-ai/glm-5.3-flash",
            "ai_model_vision": "z-ai/glm-5.3-flash",
            "ai_model_embedding": "",
            # Inferência remota é paga: o agente exige a chave combinada com o `apps/api`.
            "agent_api_key": CHAVE,
            **overrides,
        }
    )
    client = TestClient(create_app(settings), headers={"x-fatia-agent-key": CHAVE})
    return client, pedidos


def test_transcreve_pelo_chat_com_o_audio_em_base64_e_retencao_zero(
    settings_factory, monkeypatch
) -> None:
    client, pedidos = _app(
        settings_factory,
        monkeypatch,
        _resposta(
            " registra 200 g de frango ",
            usage={"prompt_tokens": 150, "completion_tokens": 22},
        ),
    )

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/mp4"})

    assert resposta.status_code == 200
    assert resposta.json() == {
        "text": "registra 200 g de frango",
        "usage": {
            "model": OPENROUTER_TRANSCRIPTION_MODEL,
            "inputUnits": 150,
            "outputUnits": 22,
        },
    }
    enviado = pedidos[0]
    assert enviado.url.path.endswith("/chat/completions")
    assert enviado.headers["cf-aig-collect-log"] == "false"
    corpo = json.loads(enviado.content)
    assert corpo["model"] == OPENROUTER_TRANSCRIPTION_MODEL
    assert corpo["provider"] == {"zdr": True, "data_collection": "deny"}
    partes = [p for m in corpo["messages"] if isinstance(m["content"], list) for p in m["content"]]
    audio = [p for p in partes if p["type"] == "input_audio"]
    assert audio == [
        {
            "type": "input_audio",
            "input_audio": {"data": base64.b64encode(AUDIO).decode(), "format": "m4a"},
        }
    ]


@pytest.mark.parametrize(
    ("tipo", "formato"),
    [
        ("audio/mp4", "m4a"),
        ("audio/x-m4a", "m4a"),
        ("audio/webm;codecs=opus", "webm"),
        ("audio/ogg", "ogg"),
        ("audio/mpeg", "mp3"),
        ("audio/wav", "wav"),
    ],
)
def test_o_formato_do_audio_sai_do_content_type(
    settings_factory, monkeypatch, tipo: str, formato: str
) -> None:
    """O app grava AAC (`audio/mp4`) e a web grava webm/opus; os dois vão como estão."""
    client, pedidos = _app(settings_factory, monkeypatch, _resposta("oi"))

    client.post("/transcribe", content=AUDIO, headers={"content-type": tipo})

    corpo = json.loads(pedidos[0].content)
    partes = [p for m in corpo["messages"] if isinstance(m["content"], list) for p in m["content"]]
    assert [p["input_audio"]["format"] for p in partes if p["type"] == "input_audio"] == [formato]


def test_sem_usage_as_unidades_ficam_de_fora(settings_factory, monkeypatch) -> None:
    client, _ = _app(settings_factory, monkeypatch, _resposta("oi"))

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/ogg"})

    assert resposta.json()["usage"] == {"model": OPENROUTER_TRANSCRIPTION_MODEL}


def test_na_openrouter_a_voz_funciona_sem_configuracao_propria(settings_factory) -> None:
    """Se a IA funciona, a voz funciona (#488): sem `AI_MODEL_TRANSCRIPTION`, o padrão revisado."""
    settings = settings_factory(
        ai_base_url=OPENROUTER, ai_api_key="or-token", ai_model_text="z-ai/glm-5.3-flash"
    )

    assert settings.ai_model_transcription == OPENROUTER_TRANSCRIPTION_MODEL
    assert OPENROUTER_TRANSCRIPTION_MODEL in allowed_models.ALLOWED_MODELS["transcription"]
    corpo = TestClient(create_app(settings)).get("/capabilities").json()
    assert corpo["capabilities"]["transcription"] == OPENROUTER_TRANSCRIPTION_MODEL


def test_ai_model_transcription_continua_sendo_override(settings_factory) -> None:
    settings = settings_factory(
        ai_base_url=OPENROUTER, ai_api_key="or-token", ai_model_transcription="outro/modelo"
    )

    assert settings.ai_model_transcription == "outro/modelo"


def test_fora_da_openrouter_nao_ha_padrao(settings_factory) -> None:
    """No LM Studio local o nome de um modelo da OpenRouter não existe: sem padrão nem microfone."""
    assert settings_factory().ai_model_transcription == ""


@pytest.mark.parametrize(
    ("tipo", "status"), [("audio/flac", 415), ("application/json", 415), ("", 415)]
)
def test_recusa_formato_nao_aceito(settings_factory, monkeypatch, tipo: str, status: int) -> None:
    client, pedidos = _app(settings_factory, monkeypatch, _resposta(""))

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": tipo})

    assert resposta.status_code == status
    assert pedidos == []


def test_recusa_corpo_vazio_e_grande_demais(settings_factory, monkeypatch) -> None:
    client, pedidos = _app(settings_factory, monkeypatch, _resposta(""))

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
        _resposta(""),
        ai_base_url="http://localhost:1234/v1",
        ai_api_key="",
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
        _resposta(""),
        agent_api_key="segredo-combinado",
    )

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/webm"})

    assert resposta.status_code == 401
    assert pedidos == []
