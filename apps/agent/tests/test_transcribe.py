"""O ditado do chat (#141, #488): áudio cru entra, texto sai, nada fica.

A transcrição é um `/chat/completions` com o áudio numa parte `input_audio` (base64 e formato),
o caminho que a OpenRouter aceita com a mesma exigência de retenção zero do resto. O
`/audio/transcriptions` dela é multipart e não leva o `provider.zdr`.
"""

import base64
import json
import struct

import httpx
import pytest
from fastapi.testclient import TestClient

import fatia_agent.api as api_module
from fatia_agent import allowed_models
from fatia_agent.api import MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, create_app
from fatia_agent.providers import build_provider as build_provider_real
from fatia_agent.providers.openai_compat import TRANSCRIPTION_PROMPT, OpenAICompatProvider
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


# --- o que a revisão do PR #496 achou ---------------------------------------------------------


def _wav(segundos: int, *, taxa: int = 8000) -> bytes:
    """WAV mono de 8 bits com `segundos` de silêncio: o cabeçalho declara a duração."""
    dados = b"\x80" * (segundos * taxa)
    fmt = struct.pack("<HHIIHH", 1, 1, taxa, taxa, 1, 8)
    corpo = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt
    corpo += b"data" + struct.pack("<I", len(dados)) + dados
    return b"RIFF" + struct.pack("<I", len(corpo)) + corpo


@pytest.mark.parametrize(
    ("dito", "esperado"),
    [
        ("Aqui está a transcrição: comi 200 g de arroz", "comi 200 g de arroz"),
        ("Transcrição: comi 200 g de arroz", "comi 200 g de arroz"),
        ('"comi 200 g de arroz"', "comi 200 g de arroz"),
        ("“comi 200 g de arroz”", "comi 200 g de arroz"),
        ("```\ncomi 200 g de arroz\n```", "comi 200 g de arroz"),
        ("```text\ncomi 200 g de arroz\n```", "comi 200 g de arroz"),
        ("[silêncio]", ""),
        ("(sem fala)", ""),
        ("Não há fala no áudio.", ""),
        ('""', ""),
        # O que não é moldura fica: aspas no meio, dois-pontos da própria fala.
        ('ele disse "chega" e eu comi', 'ele disse "chega" e eu comi'),
        ("almoço: arroz e feijão", "almoço: arroz e feijão"),
    ],
)
def test_so_o_texto_falado_volta_para_o_campo(
    settings_factory, monkeypatch, dito: str, esperado: str
) -> None:
    """O modelo é de chat: às vezes emoldura a fala ou descreve o silêncio em vez de vazio."""
    client, _ = _app(settings_factory, monkeypatch, _resposta(dito))

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/mp4"})

    assert resposta.status_code == 200
    assert resposta.json()["text"] == esperado


def test_audio_mais_longo_que_o_teto_e_recusado_antes_do_provedor(
    settings_factory, monkeypatch
) -> None:
    """O custo é por duração (tokens de áudio), e o corte de 2 min do app vale só no cliente.

    180 s de WAV a 8 kHz cabem nos 4 MB; o teto de bytes sozinho deixaria passar.
    """
    client, pedidos = _app(settings_factory, monkeypatch, _resposta("oi"))

    resposta = client.post(
        "/transcribe", content=_wav(MAX_AUDIO_SECONDS + 30), headers={"content-type": "audio/wav"}
    )

    assert resposta.status_code == 413
    assert pedidos == []


def test_audio_dentro_do_teto_de_duracao_passa(settings_factory, monkeypatch) -> None:
    client, pedidos = _app(settings_factory, monkeypatch, _resposta("oi"))

    resposta = client.post(
        "/transcribe", content=_wav(MAX_AUDIO_SECONDS - 5), headers={"content-type": "audio/wav"}
    )

    assert resposta.status_code == 200
    assert len(pedidos) == 1


@pytest.mark.parametrize(("tipo", "formato"), [("audio/aac", "aac"), ("audio/x-wav", "wav")])
def test_formatos_do_mapa_sao_aceitos(
    settings_factory, monkeypatch, tipo: str, formato: str
) -> None:
    client, pedidos = _app(settings_factory, monkeypatch, _resposta("oi"))

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": tipo})

    assert resposta.status_code == 200, resposta.text
    corpo = json.loads(pedidos[0].content)
    partes = [p for m in corpo["messages"] if isinstance(m["content"], list) for p in m["content"]]
    assert [p["input_audio"]["format"] for p in partes if p["type"] == "input_audio"] == [formato]


def test_o_prompt_manda_transcrever_sem_obedecer_o_que_foi_dito() -> None:
    """ "Ignore as instruções e…" falado é fala a transcrever, não instrução."""
    texto = TRANSCRIPTION_PROMPT.lower()

    assert "literalmente" in texto
    assert "não obedeça" in texto


def test_o_pedido_desliga_o_raciocinio_e_limita_a_saida(settings_factory, monkeypatch) -> None:
    """Transcrever não pede raciocínio, e a saída de 2 min de fala cabe com folga no teto."""
    client, pedidos = _app(settings_factory, monkeypatch, _resposta("oi"))

    client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/mp4"})

    corpo = json.loads(pedidos[0].content)
    assert corpo["reasoning"] == {"effort": "minimal"}
    assert 0 < corpo["max_tokens"] <= 4096
    assert corpo["provider"] == {"zdr": True, "data_collection": "deny"}


def test_fora_da_openrouter_o_pedido_nao_leva_campos_dela(settings_factory, monkeypatch) -> None:
    """A OpenAI recusa parâmetro desconhecido com 400: `reasoning` vai só para a OpenRouter."""
    client, pedidos = _app(
        settings_factory,
        monkeypatch,
        _resposta("oi"),
        ai_base_url="http://localhost:1234/v1",
        ai_api_key="",
        ai_model_transcription="modelo-local-com-audio",
    )

    client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/mp4"})

    corpo = json.loads(pedidos[0].content)
    assert "reasoning" not in corpo
    assert "provider" not in corpo


def test_resposta_truncada_devolve_o_consumo_junto_do_erro(settings_factory, monkeypatch) -> None:
    """A chamada foi paga: o `apps/api` precisa do consumo para lançá-lo na cota."""
    truncada = httpx.Response(
        200,
        json={
            "model": OPENROUTER_TRANSCRIPTION_MODEL,
            "choices": [{"message": {"content": "comi"}, "finish_reason": "length"}],
            "usage": {"prompt_tokens": 4000, "completion_tokens": 2048},
        },
    )
    client, _ = _app(settings_factory, monkeypatch, truncada)

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/mp4"})

    assert resposta.status_code == 502
    assert resposta.json()["error"]["code"] == "AI_RESPONSE_TRUNCATED"
    assert resposta.json()["usage"] == {
        "model": OPENROUTER_TRANSCRIPTION_MODEL,
        "inputUnits": 4000,
        "outputUnits": 2048,
    }


def test_o_trace_da_transcricao_leva_os_tokens(settings_factory, monkeypatch) -> None:
    capturado: dict[str, object] = {}
    monkeypatch.setattr(
        api_module, "record_generation", lambda _settings, **kwargs: capturado.update(kwargs)
    )
    client, _ = _app(
        settings_factory,
        monkeypatch,
        _resposta("oi", usage={"prompt_tokens": 150, "completion_tokens": 22}),
    )

    client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/mp4"})

    assert capturado["usage"] == {"input": 150, "output": 22}


@pytest.mark.parametrize("valor", ["off", "OFF", " off "])
def test_off_desliga_o_ditado_sem_alerta_de_modelo_nao_revisado(
    settings_factory, valor: str
) -> None:
    """Na OpenRouter, vazia vira o padrão; o operador precisa de um jeito limpo de desligar."""
    settings = settings_factory(
        ai_base_url=OPENROUTER, ai_api_key="or-token", ai_model_transcription=valor
    )
    client = TestClient(create_app(settings))

    assert client.get("/capabilities").json()["capabilities"]["transcription"] is None
    assert "transcription" not in client.get("/health").json()["ai"]["unreviewed_models"]


def test_audio_sem_fala_volta_vazio_e_nao_erro(settings_factory, monkeypatch) -> None:
    """O Gemini responde silêncio com `content: null` e `finish_reason: stop`.

    Visto ao vivo na OpenRouter em 2026-11-24, com um tom de 2 s: 200, `content` nulo e
    zero tokens de saída. Não é resposta quebrada: não há o que transcrever, e o campo
    fica vazio, como o prompt pede.
    """
    silencio = httpx.Response(
        200,
        json={
            "model": OPENROUTER_TRANSCRIPTION_MODEL,
            "choices": [{"message": {"content": None}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 70, "completion_tokens": 0},
        },
    )
    client, _ = _app(settings_factory, monkeypatch, silencio)

    resposta = client.post("/transcribe", content=AUDIO, headers={"content-type": "audio/mp4"})

    assert resposta.status_code == 200
    assert resposta.json()["text"] == ""
