"""O cliente do `/mcp`: o Bearer que sai, o SSE que entra, e os erros nomeados."""

import httpx
import pytest

from fatia_agent.chat.errors import (
    McpNotConfigured,
    McpRefused,
    McpResponseUnparseable,
    McpTimeout,
    McpUnauthorized,
    McpUnreachable,
)
from fatia_agent.chat.mcp_client import McpClient, build_mcp_client

from .support import (
    McpRecordingTransport,
    duplo_do_mcp,
    resultado_mcp,
    sse_jsonrpc,
    tool_do_catalogo,
)

# Sem entropia de propósito. A primeira versão disto era `tok-do-usuario-abc123`, e o gitleaks
# reprovou a varredura de histórico das três PRs da épica — a regra `generic-api-key` mede
# entropia, e não tem como saber que a fixture é falsa. Silenciar com `gitleaks:allow` resolveria
# a build e deixaria a lição pela metade: o problema não era a varredura, era a fixture parecer
# credencial. Um valor que ninguém confunde com token não precisa de exceção.
TOKEN = "bearer-de-teste"


def cliente(transport: httpx.AsyncBaseTransport, *, bearer: str = TOKEN) -> McpClient:
    return McpClient(base_url="http://localhost:3000/mcp", bearer=bearer, transport=transport)


async def test_o_bearer_do_usuario_chega_ao_mcp():
    """A propriedade inteira da ADR 021 depende disto.

    Se o token não sair daqui, o `/mcp` responde com a conta errada — ou com
    nenhuma. Não há como o resto do desenho estar certo e este teste falhar.
    """
    transport = duplo_do_mcp(catalogo=[tool_do_catalogo("list_meals", read_only=True)])

    async with cliente(transport) as mcp:
        await mcp.list_tools()

    assert transport.bearers == [f"Bearer {TOKEN}"]


async def test_manda_os_dois_tipos_no_accept():
    """O transporte do `apps/api` responde 406 quando falta qualquer um dos dois.

    Afirmado sobre o header que sai, e não sobre a resposta do duplo: o duplo
    responderia 200 de qualquer jeito, e é justamente isso que esconderia o
    defeito até o primeiro `curl` contra o servidor de verdade.
    """
    transport = duplo_do_mcp(catalogo=[])

    async with cliente(transport) as mcp:
        await mcp.list_tools()

    accept = transport.requests[0].headers["accept"]
    assert "application/json" in accept
    assert "text/event-stream" in accept


async def test_nao_manda_versao_de_protocolo_por_nao_ter_negociado_nenhuma():
    """O servidor recusa com 400 uma versão fora da lista que ele suporta.

    Como o cliente não faz `initialize` (o `/mcp` é sem sessão), não há versão
    negociada a ecoar — mandar um número fixo seria prometer uma negociação que
    não houve.
    """
    transport = duplo_do_mcp(catalogo=[])

    async with cliente(transport) as mcp:
        await mcp.list_tools()

    assert "mcp-protocol-version" not in transport.requests[0].headers


async def test_le_a_resposta_de_dentro_do_sse_com_keepalive_no_meio():
    """O `/mcp` responde `text/event-stream`, não JSON puro.

    O duplo intercala `: keepalive` porque o servidor intercala. Um parser que
    fizesse `response.json()` — ou que tratasse toda linha como JSON — estouraria
    aqui, e passaria verde contra um duplo que respondesse `application/json`.
    """
    transport = duplo_do_mcp(
        catalogo=[
            tool_do_catalogo("list_meals", read_only=True),
            tool_do_catalogo("log_meal", read_only=False),
        ]
    )

    async with cliente(transport) as mcp:
        catalogo = await mcp.list_tools()

    assert [tool.name for tool in catalogo] == ["list_meals", "log_meal"]
    assert catalogo[0].annotations["readOnlyHint"] is True


async def test_aceita_resposta_em_json_puro_tambem():
    """`enableJsonResponse: true` do outro lado não pode derrubar o chat."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=resultado_mcp(1, {"tools": []}))

    async with cliente(McpRecordingTransport(handler)) as mcp:
        assert await mcp.list_tools() == []


async def test_segue_o_cursor_de_paginacao():
    """Catálogo truncado em silêncio é indistinguível de catálogo pequeno."""
    paginas = [
        {"tools": [tool_do_catalogo("get_me", read_only=True)], "nextCursor": "p2"},
        {"tools": [tool_do_catalogo("list_meals", read_only=True)]},
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        import json as jsonlib

        corpo = jsonlib.loads(request.content)
        params = corpo.get("params") or {}
        indice = 1 if params.get("cursor") == "p2" else 0
        return sse_jsonrpc(resultado_mcp(corpo["id"], paginas[indice]))

    async with cliente(McpRecordingTransport(handler)) as mcp:
        catalogo = await mcp.list_tools()

    assert [tool.name for tool in catalogo] == ["get_me", "list_meals"]


async def test_tool_sem_anotacoes_nao_perde_o_resto_do_catalogo():
    """Anotação ausente vira `{}`, e `{}` não passa no recorte — falha fechada."""
    transport = duplo_do_mcp(
        catalogo=[
            {"name": "sem_anotacao", "description": "x", "inputSchema": {"type": "object"}},
        ]
    )

    async with cliente(transport) as mcp:
        catalogo = await mcp.list_tools()

    assert catalogo[0].annotations == {}


async def test_call_tool_devolve_o_texto_dos_blocos():
    transport = duplo_do_mcp(
        catalogo=[tool_do_catalogo("list_meals", read_only=True)],
        resultados={
            "list_meals": {
                "content": [
                    {"type": "text", "text": "linha 1"},
                    {"type": "image", "data": "..."},
                    {"type": "text", "text": "linha 2"},
                ]
            }
        },
    )

    async with cliente(transport) as mcp:
        resultado = await mcp.call_tool("list_meals", {"date": "2026-08-05"})

    assert resultado.text == "linha 1\nlinha 2"
    assert resultado.is_error is False
    # Os argumentos saem dentro de `params.arguments`, como o JSON-RPC do MCP exige.
    assert transport.rpcs[-1]["params"] == {
        "name": "list_meals",
        "arguments": {"date": "2026-08-05"},
    }


async def test_erro_de_execucao_da_tool_nao_vira_excecao():
    """O registry do `apps/api` devolve falha como `isError`, não como erro de protocolo.

    O modelo precisa ler a categoria e se corrigir; transformar isso em exceção
    derrubaria a conversa por causa de uma data mal formatada.
    """
    transport = duplo_do_mcp(
        catalogo=[],
        resultados={
            "get_meal": {
                "content": [{"type": "text", "text": "NOT_FOUND: refeição inexistente"}],
                "isError": True,
            }
        },
    )

    async with cliente(transport) as mcp:
        resultado = await mcp.call_tool("get_meal", {"id": "x"})

    assert resultado.is_error is True
    assert "NOT_FOUND" in resultado.text


@pytest.mark.parametrize("status", [401, 403])
async def test_token_recusado_vira_erro_proprio(status: int):
    """Separado de `MCP_REFUSED` porque a ação é do usuário, não do operador."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"message": "Unauthorized"})

    async with cliente(McpRecordingTransport(handler)) as mcp:
        with pytest.raises(McpUnauthorized) as excinfo:
            await mcp.list_tools()

    assert excinfo.value.code == "MCP_UNAUTHORIZED"


async def test_status_de_erro_que_nao_e_de_credencial_vira_mcp_refused():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"message": "Too Many Requests"})

    async with cliente(McpRecordingTransport(handler)) as mcp:
        with pytest.raises(McpRefused) as excinfo:
            await mcp.list_tools()

    assert excinfo.value.code == "MCP_REFUSED"
    assert excinfo.value.status_code == 429


@pytest.mark.parametrize(
    ("excecao", "esperado", "code"),
    [
        (httpx.ConnectTimeout("estourou"), McpTimeout, "MCP_TIMEOUT"),
        (httpx.ReadTimeout("estourou"), McpTimeout, "MCP_TIMEOUT"),
        # As três abaixo herdam de `RequestError`, e **não** de
        # `TimeoutException`. Um `except httpx.TimeoutException` sozinho as
        # deixaria escapar cruas, sem `code` — o mesmo buraco que a revisão desta
        # série encontrou no provedor.
        (httpx.ConnectError("recusou"), McpUnreachable, "MCP_UNREACHABLE"),
        (httpx.ReadError("caiu no meio"), McpUnreachable, "MCP_UNREACHABLE"),
        (httpx.RemoteProtocolError("fechou"), McpUnreachable, "MCP_UNREACHABLE"),
    ],
)
async def test_falha_de_transporte_vira_erro_nomeado(
    excecao: httpx.RequestError, esperado: type[Exception], code: str
):
    def handler(request: httpx.Request) -> httpx.Response:
        raise excecao

    async with cliente(McpRecordingTransport(handler)) as mcp:
        with pytest.raises(esperado) as excinfo:
            await mcp.list_tools()

    assert excinfo.value.code == code  # type: ignore[attr-defined]


async def test_as_familias_de_transporte_sao_mesmo_irmas_e_nao_maes():
    """Controle da parametrização acima, e o motivo dela existir.

    Sem esta afirmação, alguém que "simplificasse" o `except` para só
    `TimeoutException` veria os casos acima ficarem vermelhos sem entender por
    quê — e alguém que os visse verdes poderia concluir que o segundo ramo é
    redundante. Confirmado no interpretador: não é.
    """
    for tipo in (httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError):
        assert issubclass(tipo, httpx.RequestError)
        assert not issubclass(tipo, httpx.TimeoutException)


async def test_erro_de_protocolo_do_jsonrpc_vira_erro_nomeado():
    def handler(request: httpx.Request) -> httpx.Response:
        return sse_jsonrpc(
            {"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "Method not found"}}
        )

    async with cliente(McpRecordingTransport(handler)) as mcp:
        with pytest.raises(McpResponseUnparseable) as excinfo:
            await mcp.list_tools()

    assert "Method not found" in excinfo.value.message


async def test_sse_sem_nenhum_evento_com_dado_vira_erro_nomeado():
    """O evento de priming vem com `data:` vazio. Ele não é resposta."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=b": keepalive\n\nid: 1\ndata: \n\n",
            headers={"content-type": "text/event-stream"},
        )

    async with cliente(McpRecordingTransport(handler)) as mcp:
        with pytest.raises(McpResponseUnparseable):
            await mcp.list_tools()


def test_sem_mcp_base_url_degrada_com_erro_nomeado(settings_factory):
    """Mesma degradação do provedor: o serviço sobe, e o chat diz o que falta."""
    with pytest.raises(McpNotConfigured) as excinfo:
        build_mcp_client(settings_factory(mcp_base_url=""), bearer=TOKEN)

    assert excinfo.value.code == "MCP_NOT_CONFIGURED"
    assert "MCP_BASE_URL" in excinfo.value.message


def test_http_puro_contra_host_remoto_e_recusado(settings_factory):
    """O agente encaminha o Bearer DO USUÁRIO para esse endereço.

    Sem TLS, o token de quem está conversando trafega em texto puro — e é a única
    forma de errar que dá para reconhecer olhando só a configuração.
    """
    with pytest.raises(McpNotConfigured) as excinfo:
        build_mcp_client(settings_factory(mcp_base_url="http://api.exemplo.com/mcp"), bearer=TOKEN)

    assert "Bearer" in excinfo.value.message
    assert "api.exemplo.com" in excinfo.value.message


@pytest.mark.parametrize(
    "url",
    [
        # O valor que o `.env.example` e o `infra/docker-compose.yml` mandam
        # usar, escrito à mão: dentro do compose o `apps/api` atende por `api`,
        # e `localhost` ali é o próprio agente. Recusar este endereço dava 503
        # `MCP_NOT_CONFIGURED` em toda mensagem de quem sobe o compose, com uma
        # mensagem mandando usar https numa rede onde https não existe.
        "http://api:3000/mcp",
        "http://fatia-api:3000/mcp",
        "https://api.exemplo.com/mcp",
        "http://localhost:3000/mcp",
        "http://host.docker.internal:3000/mcp",
    ],
)
def test_endereco_de_rede_privada_ou_com_tls_e_aceito(settings_factory, url: str):
    cliente_montado = build_mcp_client(settings_factory(mcp_base_url=url), bearer=TOKEN)
    assert cliente_montado is not None


@pytest.mark.parametrize(
    "url",
    [
        "http://api.exemplo.com/mcp",
        # IPv6 literal não tem ponto e mesmo assim pode estar do outro lado da
        # internet: é o caso que a regra "nome de rótulo único" erraria.
        "http://[2001:db8::1]:3000/mcp",
    ],
)
def test_http_puro_contra_endereco_de_fora_continua_recusado(settings_factory, url: str):
    with pytest.raises(McpNotConfigured):
        build_mcp_client(settings_factory(mcp_base_url=url), bearer=TOKEN)


def test_o_token_nao_aparece_na_mensagem_de_erro_de_configuracao(settings_factory):
    """Mensagem de erro vira log. O token não pode ir junto."""
    with pytest.raises(McpNotConfigured) as excinfo:
        build_mcp_client(
            settings_factory(mcp_base_url="http://api.exemplo.com/mcp"), bearer="segredo-do-token"
        )

    assert "segredo-do-token" not in excinfo.value.message
