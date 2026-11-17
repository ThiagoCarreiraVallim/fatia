"""O modo da IA por categoria (ADR 039, #385), do lado do agente.

Quem decide o que é automático é o `apps/api` (`toolModes`), e quem garante os tetos
(5 por resposta, 10 itens), o "nunca automático" e o Desfazer também é ele. O agente:

- tira do catálogo as tools da categoria **Desligada**;
- executa sem cartão a confirmável marcada como automática, mandando o header
  `x-fatia-auto-write` para o `/mcp` gravar o "antes";
- quando o `/mcp` recusa com `AUTO_WRITE_NEEDS_OK`, devolve a escrita ao cartão de confirmação;
- nunca torna automática uma tool de apagar, nem uma que não seja confirmável.
"""

import json
from collections.abc import Callable

import httpx

from fatia_agent.chat.mcp_client import HEADER_AGENT_KEY, HEADER_AUTO_WRITE

from .support import (
    McpRecordingTransport,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
    resultado_mcp,
    sse_jsonrpc,
    tool_do_catalogo,
)
from .turno import CATALOGO, CONVERSA, turno

AGUA = {"ml": 300}
GRAVADO = {
    "kind": "saved",
    "label": "Gravado",
    "at": "2026-11-17T12:00:00.000Z",
    "lines": [{"label": "Quantidade", "after": "300 ml"}],
    "undoable": True,
    "autoWriteId": "6f1c0a52-8d0e-4b8e-9a43-3b7a1d2b5c11",
}

CATALOGO_IA = [
    *CATALOGO,
    tool_do_catalogo("log_water", read_only=False, confirmable=True),
    tool_do_catalogo("forget_memory", read_only=False, confirmable=True),
    tool_do_catalogo("delete_water_log", read_only=False, confirmable=True),
]


def _pede(identificador: str, nome: str, argumentos: object) -> list[dict[str, object]]:
    return [
        fragmento_de_tool(0, id=identificador, name=nome, arguments=json.dumps(argumentos)),
        fim("tool_calls"),
    ]


def _mcp(responder: Callable[[str, httpx.Request], dict[str, object]]) -> McpRecordingTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        corpo = json.loads(request.content)
        if corpo["method"] == "tools/list":
            return sse_jsonrpc(resultado_mcp(corpo["id"], {"tools": CATALOGO_IA}))
        return sse_jsonrpc(resultado_mcp(corpo["id"], responder(corpo["params"]["name"], request)))

    return McpRecordingTransport(handler)


def _gravou(_nome: str, _request: httpx.Request) -> dict[str, object]:
    return {
        "content": [{"type": "text", "text": json.dumps({"waterLogId": "w1"})}],
        "structuredContent": GRAVADO,
    }


def _chamadas(mcp: McpRecordingTransport, nome: str) -> list[httpx.Request]:
    return [
        r
        for r in mcp.requests
        if json.loads(r.content).get("method") == "tools/call"
        and json.loads(r.content)["params"]["name"] == nome
    ]


async def test_automatica_grava_sem_cartao_e_manda_o_header(settings_factory):
    mcp = _mcp(_gravou)
    r = await turno(
        settings_factory,
        [_pede("c1", "log_water", AGUA), [fragmento_de_texto("Anotei 300 ml.")]],
        mensagem="bebi 300 ml",
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
        auto_write=["log_water"],
    )

    assert r.data_of("done") == [{"status": "completed"}]
    (chamada,) = _chamadas(mcp, "log_water")
    assert json.loads(chamada.headers[HEADER_AUTO_WRITE]) == {
        "conversationId": CONVERSA,
        "runId": "token-1",
        "toolCallId": "c1",
    }
    # Com a credencial de serviço do agente: sem ela o `/mcp` recusa o header (403).
    assert chamada.headers[HEADER_AGENT_KEY] == "chave-do-agente"
    # O cartão "Gravado" chega à tela, com o id que o Desfazer usa.
    assert r.data_of("artifact") == [{"toolCallId": "c1", **GRAVADO}]


async def test_sem_modo_automatico_continua_pedindo_ok(settings_factory):
    mcp = _mcp(_gravou)
    r = await turno(
        settings_factory,
        [_pede("c1", "log_water", AGUA)],
        mensagem="bebi 300 ml",
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
    )

    assert r.data_of("done") == [{"status": "interrupted"}]
    assert _chamadas(mcp, "log_water") == []


async def test_recusa_do_mcp_volta_ao_cartao_e_o_sim_grava_sem_o_header(settings_factory):
    def responder(_nome: str, request: httpx.Request) -> dict[str, object]:
        if HEADER_AUTO_WRITE in request.headers:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": "AUTO_WRITE_NEEDS_OK: Já foram 5 gravações automáticas "
                        "nesta resposta. Peça a confirmação da pessoa.",
                    }
                ],
                "isError": True,
            }
        return _gravou(_nome, request)

    mcp = _mcp(responder)
    pausado = await turno(
        settings_factory,
        [_pede("c1", "log_water", AGUA)],
        mensagem="bebi 300 ml",
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
        auto_write=["log_water"],
    )

    assert pausado.data_of("done") == [{"status": "interrupted"}]
    (acao,) = pausado.interrupcao()["value"]["actions"]
    assert (acao["kind"], acao["toolCallId"], acao["arguments"]) == ("confirm", "c1", AGUA)
    # A recusa não vira resultado: nada de "falhou" no histórico do modelo.
    assert pausado.mensagens_de_tool() == []

    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("Anotei.")]],
        mensagem=None,
        retomada={"approvals": {"c1": True}},
        grafo=pausado.grafo,
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
        auto_write=["log_water"],
    )
    tentativa, confirmada = _chamadas(mcp, "log_water")
    assert HEADER_AUTO_WRITE in tentativa.headers
    assert HEADER_AUTO_WRITE not in confirmada.headers
    assert retomado.data_of("done") == [{"status": "completed"}]


async def test_apagar_nunca_e_automatico_mesmo_que_a_lista_diga(settings_factory):
    mcp = _mcp(_gravou)
    for nome in ("forget_memory", "delete_water_log"):
        r = await turno(
            settings_factory,
            [_pede("c1", nome, {"id": "x"})],
            mensagem="apaga",
            mcp_transport=mcp,
            catalogo=CATALOGO_IA,
            auto_write=["forget_memory", "delete_water_log"],
            thread=f"user-1:{nome}",
        )
        assert r.data_of("done") == [{"status": "interrupted"}], nome
    assert _chamadas(mcp, "forget_memory") == []
    assert _chamadas(mcp, "delete_water_log") == []


async def test_desligada_sai_do_catalogo(settings_factory):
    r = await turno(
        settings_factory,
        [[fragmento_de_texto("Não consigo registrar água por aqui.")]],
        mensagem="bebi 300 ml",
        mcp_transport=_mcp(_gravou),
        catalogo=CATALOGO_IA,
        off=["log_water"],
    )

    nomes = {t["function"]["name"] for t in r.provider.corpos[0]["tools"]}
    assert "log_water" not in nomes
    assert "log_meal" in nomes


async def test_desligada_pedida_mesmo_assim_nao_executa(settings_factory):
    mcp = _mcp(_gravou)
    r = await turno(
        settings_factory,
        [_pede("c1", "log_water", AGUA), [fragmento_de_texto("Não consegui.")]],
        mensagem="bebi 300 ml",
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
        off=["log_water"],
        auto_write=["log_water"],
    )

    assert _chamadas(mcp, "log_water") == []
    (resultado,) = r.mensagens_de_tool()
    assert resultado["status"] == "error"


async def test_escrita_normal_nao_leva_o_header(settings_factory):
    mcp = _mcp(_gravou)
    pausado = await turno(
        settings_factory,
        [_pede("c1", "log_water", AGUA)],
        mensagem="bebi 300 ml",
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
        auto_write=["log_meal"],
    )
    await turno(
        settings_factory,
        [[fragmento_de_texto("ok")]],
        mensagem=None,
        retomada={"approvals": {"c1": True}},
        grafo=pausado.grafo,
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
    )
    (chamada,) = _chamadas(mcp, "log_water")
    assert HEADER_AUTO_WRITE not in chamada.headers


def _e_consulta(request: httpx.Request) -> bool:
    return bool(json.loads(request.headers.get(HEADER_AUTO_WRITE, "{}")).get("lookup"))


def _timeout_e_depois(consulta: Callable[[], dict[str, object]]) -> McpRecordingTransport:
    """A gravação estoura o tempo (pode ter gravado); a consulta por `toolCallId` responde."""

    def responder(nome: str, request: httpx.Request) -> dict[str, object]:
        if _e_consulta(request):
            return consulta()
        raise httpx.ReadTimeout("o /mcp demorou", request=request)

    return _mcp(responder)


async def test_timeout_que_gravou_mostra_o_gravado_pela_consulta(settings_factory):
    mcp = _timeout_e_depois(lambda: _gravou("log_water", None))  # type: ignore[arg-type]
    r = await turno(
        settings_factory,
        [_pede("c1", "log_water", AGUA), [fragmento_de_texto("Anotei 300 ml.")]],
        mensagem="bebi 300 ml",
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
        auto_write=["log_water"],
    )

    assert r.data_of("done") == [{"status": "completed"}]
    gravacao, consulta = _chamadas(mcp, "log_water")
    assert not _e_consulta(gravacao)
    assert json.loads(consulta.headers[HEADER_AUTO_WRITE]) == {
        "conversationId": CONVERSA,
        "runId": "token-1",
        "toolCallId": "c1",
        "lookup": True,
    }
    assert r.data_of("artifact") == [{"toolCallId": "c1", **GRAVADO}]


async def test_timeout_sem_registro_nao_vira_cartao_nem_grava_de_novo(settings_factory):
    mcp = _timeout_e_depois(
        lambda: {
            "content": [
                {"type": "text", "text": "AUTO_WRITE_UNKNOWN: não há gravação desta chamada."}
            ],
            "isError": True,
        }
    )
    r = await turno(
        settings_factory,
        [_pede("c1", "log_water", AGUA), [fragmento_de_texto("Pode não ter gravado.")]],
        mensagem="bebi 300 ml",
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
        auto_write=["log_water"],
    )

    # Sem cartão de confirmação: aprovar gravaria duas vezes se a primeira tiver chegado.
    assert r.data_of("done") == [{"status": "completed"}]
    (mensagem,) = r.mensagens_de_tool()
    assert "pode não ter" in mensagem["content"].lower()
    assert "pergunte" in mensagem["content"].lower()
    gravacoes = [c for c in _chamadas(mcp, "log_water") if not _e_consulta(c)]
    assert len(gravacoes) == 1


async def test_consulta_que_tambem_falha_avisa_sem_gravar_de_novo(settings_factory):
    def responder(_nome: str, request: httpx.Request) -> dict[str, object]:
        raise httpx.ReadTimeout("o /mcp demorou", request=request)

    mcp = _mcp(responder)
    r = await turno(
        settings_factory,
        [_pede("c1", "log_water", AGUA), [fragmento_de_texto("Pode não ter gravado.")]],
        mensagem="bebi 300 ml",
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
        auto_write=["log_water"],
    )

    assert r.data_of("done") == [{"status": "completed"}]
    (mensagem,) = r.mensagens_de_tool()
    assert "pode não ter" in mensagem["content"].lower()
    assert len([c for c in _chamadas(mcp, "log_water") if not _e_consulta(c)]) == 1


async def test_credencial_recusada_volta_ao_cartao(settings_factory):
    def handler(request: httpx.Request) -> httpx.Response:
        corpo = json.loads(request.content)
        if corpo["method"] == "tools/list":
            return sse_jsonrpc(resultado_mcp(corpo["id"], {"tools": CATALOGO_IA}))
        if HEADER_AUTO_WRITE in request.headers:
            return httpx.Response(403, json={"message": "só do agente"})
        return sse_jsonrpc(resultado_mcp(corpo["id"], _gravou("log_water", request)))

    mcp = McpRecordingTransport(handler)
    r = await turno(
        settings_factory,
        [_pede("c1", "log_water", AGUA)],
        mensagem="bebi 300 ml",
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
        auto_write=["log_water"],
    )
    # 403 vem antes de qualquer gravação: o cartão é seguro.
    assert r.data_of("done") == [{"status": "interrupted"}]


async def test_sem_token_do_turno_pede_o_ok(settings_factory):
    mcp = _mcp(_gravou)
    r = await turno(
        settings_factory,
        [_pede("c1", "log_water", AGUA)],
        mensagem="bebi 300 ml",
        mcp_transport=mcp,
        catalogo=CATALOGO_IA,
        auto_write=["log_water"],
        run_token=None,
    )
    assert r.data_of("done") == [{"status": "interrupted"}]
    assert _chamadas(mcp, "log_water") == []
