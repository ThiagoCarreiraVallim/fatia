"""Falha passageira do `/mcp` volta ao modelo, e ele tenta de novo sozinho.

Antes, timeout, queda de rede, 429/5xx e resposta quebrada do `/mcp` subiam
como exceção e derrubavam o turno com `done: error` — a pessoa via "deu erro" e
tinha de reenviar a pergunta. Agora viram resultado de tool com falha, e o
modelo, que lê o erro, repete a chamada na rodada seguinte.
"""

import json

import httpx

from fatia_agent.chat.graph import falha_temporaria

from .support import fragmento_de_texto, resultado_mcp, sse_jsonrpc
from .test_graph import _com_tool
from .turno import CATALOGO, turno


def _mcp_que_falha(*respostas_do_call: httpx.Response | Exception) -> httpx.MockTransport:
    """`tools/list` sempre responde; cada `tools/call` consome a próxima resposta.

    Depois da lista acabar, `tools/call` responde `[]` com sucesso.
    """
    fila = list(respostas_do_call)

    def handler(request: httpx.Request) -> httpx.Response:
        corpo = json.loads(request.content)
        if corpo["method"] == "tools/list":
            return sse_jsonrpc(resultado_mcp(corpo["id"], {"tools": CATALOGO}))
        if fila:
            proxima = fila.pop(0)
            if isinstance(proxima, Exception):
                raise proxima
            return proxima
        return sse_jsonrpc(
            resultado_mcp(corpo["id"], {"content": [{"type": "text", "text": "[]"}]})
        )

    return httpx.MockTransport(handler)


async def test_503_do_mcp_volta_ao_modelo_que_tenta_de_novo(settings_factory):
    r = await turno(
        settings_factory,
        [
            _com_tool("list_meals", id="c1"),
            _com_tool("list_meals", id="c2"),
            [fragmento_de_texto("Você não registrou nada ontem.")],
        ],
        mcp_transport=_mcp_que_falha(httpx.Response(503)),
    )

    primeira, segunda = r.mensagens_de_tool()
    assert primeira["status"] == "error"
    assert primeira["content"] == falha_temporaria(somente_leitura=True)
    assert segunda["status"] == "success"
    assert r.data_of("error") == []
    assert r.data_of("done") == [{"status": "completed"}]
    # O erro chegou ao modelo, que é quem decide repetir.
    lido_pelo_modelo = r.provider.corpos[1]["messages"][-1]
    assert lido_pelo_modelo["role"] == "tool"
    assert "Falha temporária" in lido_pelo_modelo["content"]


async def test_queda_de_conexao_numa_leitura_e_repetida_pelo_cliente(settings_factory):
    # A leitura repete a conexão que caiu uma vez dentro do `McpClient`: o
    # modelo nem chega a ver a falha.
    r = await turno(
        settings_factory,
        [_com_tool("list_meals"), [fragmento_de_texto("Nada ontem.")]],
        mcp_transport=_mcp_que_falha(httpx.ConnectError("caiu")),
    )

    (resultado,) = r.mensagens_de_tool()
    assert resultado["status"] == "success"


async def test_401_continua_encerrando_o_turno(settings_factory):
    # Token vencido não passa sozinho: repetir só gastaria rodadas.
    r = await turno(
        settings_factory,
        [_com_tool("list_meals"), [fragmento_de_texto("nunca")]],
        mcp_transport=_mcp_que_falha(httpx.Response(401)),
    )

    (erro,) = r.data_of("error")
    assert erro["code"] == "MCP_UNAUTHORIZED"
    assert r.data_of("done") == [{"status": "error"}]


def test_a_escrita_nao_e_dada_como_falha_e_pede_conferencia():
    # A gravação pode ter chegado e só a resposta ter se perdido.
    texto = falha_temporaria(somente_leitura=False)
    assert "não deu para confirmar se a alteração foi gravada" in texto
    assert "consulte com uma leitura" in texto
