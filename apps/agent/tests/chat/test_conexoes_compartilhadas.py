"""O pool de conexões do processo, e a repetição só de leitura no `/mcp`."""

import json

import httpx
import pytest

from fatia_agent.chat.errors import McpUnreachable
from fatia_agent.chat.mcp_client import McpClient
from fatia_agent.http_pool import SharedTransport

from .support import duplo_do_mcp, resultado_mcp, sse_jsonrpc, tool_do_catalogo

CATALOGO = [tool_do_catalogo("get_me", read_only=True)]


class InnerQueConta(httpx.MockTransport):
    def __init__(self, handler) -> None:
        super().__init__(handler)
        self.fechado = 0

    async def aclose(self) -> None:
        self.fechado += 1


async def test_cada_cliente_leva_o_proprio_bearer_pelo_mesmo_pool():
    """O pool é de todos; o Bearer, só de quem conversa."""
    duplo = duplo_do_mcp(catalogo=CATALOGO)
    compartilhado = SharedTransport(keepalive_expiry_s=4.0, inner=duplo)

    for bearer in ("pessoa-a", "pessoa-b", "pessoa-a"):
        async with McpClient(
            base_url="http://api/mcp", bearer=bearer, transport=compartilhado
        ) as client:
            await client.list_tools()

    assert duplo.bearers == ["Bearer pessoa-a", "Bearer pessoa-b", "Bearer pessoa-a"]


async def test_fechar_o_cliente_nao_fecha_o_pool():
    inner = InnerQueConta(lambda request: httpx.Response(200))
    compartilhado = SharedTransport(keepalive_expiry_s=4.0, inner=inner)

    async with httpx.AsyncClient(transport=compartilhado) as cliente:
        await cliente.get("http://api/")
    assert inner.fechado == 0

    await compartilhado.shutdown()
    assert inner.fechado == 1


def _mcp_que_cai_na_primeira(chamadas: list[str]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        mensagem = json.loads(request.content)
        chamadas.append(mensagem["method"])
        if len(chamadas) == 1:
            raise httpx.RemoteProtocolError("Server disconnected without sending a response.")
        if mensagem["method"] == "tools/list":
            return sse_jsonrpc(resultado_mcp(mensagem["id"], {"tools": CATALOGO}))
        return sse_jsonrpc(
            resultado_mcp(mensagem["id"], {"content": [{"type": "text", "text": "{}"}]})
        )

    return httpx.MockTransport(handler)


async def test_leitura_repete_uma_vez_quando_a_conexao_cai():
    chamadas: list[str] = []
    async with McpClient(
        base_url="http://api/mcp", bearer="b", transport=_mcp_que_cai_na_primeira(chamadas)
    ) as client:
        tools = await client.list_tools()

    assert [t.name for t in tools] == ["get_me"]
    assert chamadas == ["tools/list", "tools/list"]


async def test_escrita_nao_repete_quando_a_conexao_cai():
    """A primeira gravação pode ter chegado e só a resposta se perdido."""
    chamadas: list[str] = []
    async with McpClient(
        base_url="http://api/mcp", bearer="b", transport=_mcp_que_cai_na_primeira(chamadas)
    ) as client:
        with pytest.raises(McpUnreachable):
            await client.call_tool("log_meal", {"date": "2026-10-18"})

    assert chamadas == ["tools/call"]
