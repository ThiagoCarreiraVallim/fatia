"""Foto no chat (ADR 020): vai ao modelo de visão e não fica em lugar nenhum.

A afirmação que importa é a do checkpoint: é ele que o Postgres guarda, e uma
foto ali seria exatamente a persistência que a ADR 004 proíbe.
"""

import base64
import json

from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import InMemorySaver

from fatia_agent.api import create_app
from fatia_agent.chat.graph import MARCA_DE_FOTO, montar_grafo
from fatia_agent.chat.state import FotoDoTurno

from .support import fim, fragmento_de_texto
from .test_chat_route import BEARER, app_com, corpo
from .turno import turno

# Bytes com cara de JPEG e um marcador ASCII: o `repr` do saver escaparia o
# resto, e o controle abaixo precisa achar alguma coisa.
BYTES = b"\xff\xd8\xff\xdbFOTO-DO-PRATO-SENTINELA\xff\xd9"
FOTO = FotoDoTurno(media_type="image/jpeg", base64=base64.b64encode(BYTES).decode("ascii"))


def _responde(texto: str) -> list[dict[str, object]]:
    return [fragmento_de_texto(texto), fim()]


async def test_a_foto_vai_ao_modelo_de_visao_na_ultima_fala(settings_factory) -> None:
    r = await turno(
        settings_factory,
        [_responde("Parece arroz com feijão.")],
        mensagem="o que tem nesse prato?",
        fotos=[FOTO],
    )

    corpo_enviado = r.provider.corpos[0]
    assert corpo_enviado["model"] == "google/gemma-4-12b-qat"
    ultima = corpo_enviado["messages"][-1]  # type: ignore[index]
    assert ultima["role"] == "user"
    assert ultima["content"][1] == {
        "type": "image_url",
        "image_url": {"url": f"data:image/jpeg;base64,{FOTO.base64}"},
    }
    assert ultima["content"][0]["text"].startswith("o que tem nesse prato?")


async def test_o_checkpoint_guarda_a_marca_e_nao_a_foto(settings_factory) -> None:
    saver = InMemorySaver()
    await turno(
        settings_factory,
        [_responde("Parece arroz com feijão.")],
        mensagem="o que tem nesse prato?",
        fotos=[FOTO],
        grafo=montar_grafo(saver),
    )

    gravado = repr(saver.storage) + repr(saver.writes) + repr(saver.blobs)
    assert FOTO.base64 not in gravado
    assert "FOTO-DO-PRATO-SENTINELA" not in gravado
    # Controle: a conversa está lá, e com a marca no lugar da foto.
    assert "o que tem nesse prato?" in gravado
    assert "foto(s) enviada(s)" in gravado


async def test_o_turno_seguinte_nao_ve_a_foto_e_volta_ao_modelo_de_texto(
    settings_factory,
) -> None:
    primeiro = await turno(
        settings_factory,
        [_responde("Parece arroz com feijão.")],
        mensagem="o que tem nesse prato?",
        fotos=[FOTO],
    )
    segundo = await turno(
        settings_factory,
        [_responde("Umas 400 kcal.")],
        mensagem="e quantas calorias?",
        grafo=primeiro.grafo,
    )

    enviado = segundo.provider.corpos[0]
    assert enviado["model"] == "ornith-1.0-9b"
    assert FOTO.base64 not in json.dumps(enviado)
    assert MARCA_DE_FOTO.format(n=1) in json.dumps(enviado, ensure_ascii=False)


def test_rota_recusa_foto_sem_modelo_de_visao(settings_factory, monkeypatch) -> None:
    client, _, _ = app_com(settings_factory, turnos=[], monkeypatch=monkeypatch, ai_model_vision="")

    resposta = client.post(
        "/chat",
        json=corpo(
            message="o que é isso?", photos=[{"mediaType": "image/jpeg", "data": FOTO.base64}]
        ),
        headers=BEARER,
    )

    assert resposta.status_code == 503
    assert resposta.json()["error"]["code"] == "AI_PROVIDER_NOT_CONFIGURED"
    assert "AI_MODEL_VISION" in resposta.json()["error"]["message"]


def test_rota_recusa_foto_em_formato_nao_aceito(settings_factory, monkeypatch) -> None:
    client, _, _ = app_com(settings_factory, turnos=[], monkeypatch=monkeypatch)

    resposta = client.post(
        "/chat",
        json=corpo(
            message="o que é isso?", photos=[{"mediaType": "image/gif", "data": FOTO.base64}]
        ),
        headers=BEARER,
    )

    assert resposta.status_code == 415


def test_rota_recusa_foto_na_resposta_a_uma_pausa(settings_factory) -> None:
    resposta = TestClient(create_app(settings_factory())).post(
        "/chat",
        json=corpo(
            resume={"interruptId": "i-1", "value": True},
            photos=[{"mediaType": "image/jpeg", "data": FOTO.base64}],
        ),
        headers=BEARER,
    )

    assert resposta.status_code == 422


def test_rota_manda_a_foto_ao_provedor(settings_factory, monkeypatch) -> None:
    client, provedor, _ = app_com(
        settings_factory, turnos=[_responde("Arroz.")], monkeypatch=monkeypatch
    )

    resposta = client.post(
        "/chat",
        json=corpo(
            message="o que é isso?", photos=[{"mediaType": "image/jpeg", "data": FOTO.base64}]
        ),
        headers=BEARER,
    )

    assert resposta.status_code == 200
    assert FOTO.base64 in json.dumps(provedor.corpos[0])
    assert FOTO.base64 not in resposta.text
