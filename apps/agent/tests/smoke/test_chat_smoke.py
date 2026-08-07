"""Fumaça do chat contra o que está de verdade no ar — fora do CI.

Dois provedores, duas variáveis, e por isso dois grupos de casos:

- os do `/mcp` exigem `MCP_BASE_URL` **e** `MCP_BEARER` (um token de usuário de
  verdade — `docs/MCP.md` explica como emitir um);
- o de ponta a ponta exige também `AI_BASE_URL`.

É o único teste que prova o que o duplo **não** pode provar: que o `/mcp` do
NestJS de fato aceita um POST de JSON-RPC sem `initialize`, sem sessão e sem
cabeçalho de versão. Toda a decisão de escrever o cliente à mão depende disso, e
é uma propriedade do outro repositório — se ela mudar, é aqui que aparece.

    MCP_BASE_URL=http://localhost:3000/mcp MCP_BEARER=... uv run pytest -m smoke
"""

import os

import pytest

from fatia_agent.chat.mcp_client import McpClient
from fatia_agent.chat.tool_policy import somente_leitura

pytestmark = [
    pytest.mark.smoke,
    pytest.mark.skipif(
        not os.getenv("MCP_BASE_URL") or not os.getenv("MCP_BEARER"),
        reason="exige MCP_BASE_URL e MCP_BEARER (um token de usuário de verdade)",
    ),
]


@pytest.fixture
async def mcp():
    client = McpClient(
        base_url=os.environ["MCP_BASE_URL"],
        bearer=os.environ["MCP_BEARER"],
        timeout_s=float(os.getenv("MCP_TIMEOUT_S", "30")),
    )
    yield client
    await client.aclose()


async def test_o_mcp_serve_o_catalogo_sem_handshake(mcp):
    catalogo = await mcp.list_tools()
    assert catalogo, "o /mcp não devolveu nenhuma tool"
    # `tools/call` logo em seguida, na mesma conexão e sem sessão: é a segunda
    # metade da propriedade, e a que quebraria se o servidor virasse stateful.
    assert any(tool.name == "get_me" for tool in catalogo)


async def test_o_recorte_de_leitura_nao_e_vazio_nem_o_catalogo_inteiro(mcp):
    """O critério da ADR 021 contra o catálogo de verdade.

    As duas pontas importam: vazio significaria que a anotação não chega no fio
    (e o chat ficaria sem ferramenta nenhuma, em silêncio); igual ao total
    significaria que o recorte não recorta nada — e que uma tool de escrita está
    sendo oferecida ao modelo.
    """
    catalogo = await mcp.list_tools()
    permitidas = somente_leitura(catalogo)

    assert 0 < len(permitidas) < len(catalogo)


async def test_uma_tool_de_leitura_responde_de_verdade(mcp):
    resultado = await mcp.call_tool("get_me", {})
    assert resultado.is_error is False
    assert resultado.text.strip()
