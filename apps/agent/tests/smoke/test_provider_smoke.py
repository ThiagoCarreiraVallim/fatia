"""Fumaça contra um provedor de verdade — fora do CI.

Roda com `uv run pytest -m smoke` numa máquina com o LM Studio no ar (ou com
`AI_BASE_URL` apontando para o gateway). É o único teste que prova que a
configuração está certa de verdade: o duplo do provedor prova o nosso lado do
protocolo, não o do provedor.
"""

import os

import pytest

from fatia_agent.providers import build_provider
from fatia_agent.settings import AgentSettings

pytestmark = [
    pytest.mark.smoke,
    pytest.mark.skipif(
        not os.getenv("AI_BASE_URL"),
        reason="exige AI_BASE_URL (LM Studio local ou AI Gateway)",
    ),
]

# 1x1 PNG transparente — imagem mínima que ainda é imagem de verdade.
PIXEL_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d4944415478da63fccf00000302010005cd8506000000004945"
    "4e44ae426082"
)


@pytest.fixture
def provider():
    return build_provider(AgentSettings())


async def test_o_endpoint_lista_modelos(provider):
    modelos = await provider.list_models()
    assert modelos, "o provedor não listou nenhum modelo"


async def test_texto_responde_uma_linha(provider):
    resposta = await provider.complete(
        "Responda apenas com a palavra: arroz.", system="Seja literal."
    )
    assert "arroz" in resposta.lower()


async def test_visao_aceita_imagem(provider):
    resposta = await provider.describe(
        PIXEL_PNG, prompt="Descreva em uma frase.", media_type="image/png"
    )
    assert resposta.strip()


async def test_embedding_devolve_um_vetor_por_texto(provider):
    vetores = await provider.embed(["arroz", "feijão"])
    assert len(vetores) == 2
    assert all(len(vetor) > 0 for vetor in vetores)
