"""O grafo: a ordem dos eventos, o ciclo de tool e as paradas.

Nada de duplo caseiro de provedor ou de cliente MCP: os dois são os objetos de
produção, com o transporte do `httpx` trocado por um que emite o formato de
verdade. É o que torna estes casos capazes de reprovar a tradução entre camadas,
que é onde os defeitos desta série moraram.
"""

import asyncio
import json
from collections.abc import AsyncIterator, Sequence
from typing import Never

import httpx
import pytest

from fatia_agent.chat.graph import (
    MAX_CARACTERES_POR_MENSAGEM,
    MAX_RODADAS_DE_TOOL,
    stream_chat_events,
)
from fatia_agent.chat.mcp_client import McpClient
from fatia_agent.chat.tool_policy import somente_leitura
from fatia_agent.providers import build_provider
from fatia_agent.providers.base import TextDelta, ToolCall, TurnEnd

from .support import (
    McpRecordingTransport,
    ProviderRecordingTransport,
    duplo_do_mcp,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
    resultado_mcp,
    sse_jsonrpc,
    tool_do_catalogo,
)

TOKEN = "tok-do-usuario"

CATALOGO = [
    tool_do_catalogo("list_meals", read_only=True),
    tool_do_catalogo("log_meal", read_only=False),
    tool_do_catalogo("delete_meal", read_only=False),
]


async def rodar(
    settings_factory,
    turnos,
    *,
    mcp_transport: httpx.AsyncBaseTransport | None = None,
    mensagem: str = "o que eu comi ontem?",
    historico=(),
):
    """Roda o grafo inteiro e devolve (eventos, transporte do provedor, transporte do mcp)."""
    provider_transport = ProviderRecordingTransport(turnos)
    provider = build_provider(settings_factory(), transport=provider_transport)
    transporte_mcp = mcp_transport if mcp_transport is not None else duplo_do_mcp(catalogo=CATALOGO)
    client = McpClient(base_url="http://localhost:3000/mcp", bearer=TOKEN, transport=transporte_mcp)

    permitidas = somente_leitura(await client.list_tools())
    eventos = [
        evento
        async for evento in stream_chat_events(
            provider, client, permitidas, mensagem=mensagem, historico=historico
        )
    ]

    await client.aclose()
    await provider.aclose()
    return eventos, provider_transport, transporte_mcp


async def test_resposta_sem_tool_sai_token_a_token_e_termina_com_done(settings_factory):
    eventos, _, _ = await rodar(
        settings_factory,
        [[fragmento_de_texto("Você "), fragmento_de_texto("comeu arroz.")]],
    )

    assert [(e.name, e.data) for e in eventos] == [
        ("token", {"text": "Você "}),
        ("token", {"text": "comeu arroz."}),
        ("done", {"reason": "stop"}),
    ]


async def test_o_ciclo_de_tool_emite_start_end_e_so_depois_a_resposta(settings_factory):
    """A ordem é o contrato: a UI mostra "consultando…" e troca pelo texto.

    Igualdade da sequência inteira, e não `any(...)`: com `assert any`, um evento
    de tool emitido DEPOIS da resposta passaria verde — e é exatamente o que
    acontece quando alguém troca o `writer` por acumular e emitir no fim.
    """
    eventos, provider_transport, mcp_transport = await rodar(
        settings_factory,
        [
            [
                fragmento_de_tool(0, id="c1", name="list_meals", arguments='{"date":"2026-08-05"}'),
                fim("tool_calls"),
            ],
            [fragmento_de_texto("Arroz e feijão.")],
        ],
        mcp_transport=duplo_do_mcp(
            catalogo=CATALOGO,
            resultados={
                "list_meals": {"content": [{"type": "text", "text": '[{"nome":"arroz"}]'}]}
            },
        ),
    )

    assert [(e.name, e.data) for e in eventos] == [
        ("tool", {"name": "list_meals", "phase": "start", "arguments": '{"date":"2026-08-05"}'}),
        (
            "tool",
            {"name": "list_meals", "phase": "end", "ok": True, "result": '[{"nome":"arroz"}]'},
        ),
        ("token", {"text": "Arroz e feijão."}),
        ("done", {"reason": "stop"}),
    ]

    # O resultado da tool volta ao modelo como mensagem `tool`, amarrada pelo id.
    segunda_chamada = provider_transport.corpos[1]["messages"]
    assert segunda_chamada[-1] == {
        "role": "tool",
        "tool_call_id": "c1",
        "content": '[{"nome":"arroz"}]',
    }
    # E o `/mcp` recebeu o Bearer nas duas idas: catálogo e execução.
    assert mcp_transport.bearers == [f"Bearer {TOKEN}", f"Bearer {TOKEN}"]


async def test_o_modelo_so_enxerga_as_tools_de_leitura(settings_factory):
    """O recorte da ADR 021, verificado no que **sai** para o provedor.

    Afirmar sobre `somente_leitura` sozinho não bastaria: o defeito interessante
    é o catálogo certo ser calculado e o errado ser enviado.
    """
    _, provider_transport, _ = await rodar(settings_factory, [[fragmento_de_texto("oi")]])

    tools = provider_transport.corpos[0]["tools"]
    assert [t["function"]["name"] for t in tools] == ["list_meals"]


async def test_tool_alucinada_vira_falha_de_tool_e_a_conversa_continua(settings_factory):
    """O modelo pede `delete_meal`, que existe no catálogo mas não no recorte.

    Nada é chamado no `/mcp`, o modelo recebe o motivo e responde. Derrubar a
    conversa aqui trocaria "pedi a tool errada" por "o chat caiu".
    """
    mcp_transport = duplo_do_mcp(catalogo=CATALOGO)
    eventos, provider_transport, _ = await rodar(
        settings_factory,
        [
            [fragmento_de_tool(0, id="c1", name="delete_meal", arguments="{}"), fim("tool_calls")],
            [fragmento_de_texto("Não consigo apagar por aqui.")],
        ],
        mcp_transport=mcp_transport,
    )

    nomes = [(e.name, e.data.get("phase"), e.data.get("ok")) for e in eventos if e.name == "tool"]
    assert nomes == [("tool", "start", None), ("tool", "end", False)]
    assert eventos[-1].data == {"reason": "stop"}

    # Só o `tools/list` foi ao `/mcp` — nenhum `tools/call`.
    assert [rpc["method"] for rpc in mcp_transport.rpcs] == ["tools/list"]
    # E o modelo leu o motivo, para poder se corrigir.
    resultado = provider_transport.corpos[1]["messages"][-1]
    assert "não está no recorte permitido" in resultado["content"]


async def test_argumentos_quebrados_do_modelo_nao_derrubam_a_conversa(settings_factory):
    mcp_transport = duplo_do_mcp(catalogo=CATALOGO)
    eventos, _, _ = await rodar(
        settings_factory,
        [
            [
                fragmento_de_tool(0, id="c1", name="list_meals", arguments='{"date":'),
                fim("tool_calls"),
            ],
            [fragmento_de_texto("Pode repetir?")],
        ],
        mcp_transport=mcp_transport,
    )

    (fim_da_tool,) = [e for e in eventos if e.name == "tool" and e.data["phase"] == "end"]
    assert fim_da_tool.data["ok"] is False
    assert [rpc["method"] for rpc in mcp_transport.rpcs] == ["tools/list"]
    assert eventos[-1].data == {"reason": "stop"}


async def test_tool_que_falha_no_apps_api_vira_evento_com_ok_falso(settings_factory):
    eventos, _, _ = await rodar(
        settings_factory,
        [
            [fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"), fim("tool_calls")],
            [fragmento_de_texto("Não achei.")],
        ],
        mcp_transport=duplo_do_mcp(
            catalogo=CATALOGO,
            resultados={
                "list_meals": {
                    "content": [{"type": "text", "text": "NOT_FOUND: nada nessa data"}],
                    "isError": True,
                }
            },
        ),
    )

    (fim_da_tool,) = [e for e in eventos if e.name == "tool" and e.data["phase"] == "end"]
    assert fim_da_tool.data["ok"] is False
    assert "NOT_FOUND" in fim_da_tool.data["result"]


async def test_modelo_em_laco_para_no_teto_de_rodadas(settings_factory):
    """Modelo que só pede tool, para sempre. O teto é o que impede o laço.

    Sem ele, cada mensagem gastaria a cota de 60/min do `/mcp` **do usuário** —
    e a fatura do gateway, que é nossa.

    **O número está escrito à mão de propósito.** Importando `MAX_RODADAS_DE_TOOL`
    para o lado direito da igualdade, o caso concordava com qualquer valor: subir
    a constante para 99 mantinha a suíte verde, e 99 rodadas de 5 tools passam de
    quatro vezes a cota do usuário. O teto é decisão de produto; mudá-lo tem de
    custar editar este número.
    """
    turno_em_laco = [
        fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"),
        fim("tool_calls"),
    ]
    mcp_transport = duplo_do_mcp(catalogo=CATALOGO)
    eventos, provider_transport, _ = await rodar(
        settings_factory, [turno_em_laco], mcp_transport=mcp_transport
    )

    assert MAX_RODADAS_DE_TOOL == 4
    assert eventos[-1].data == {"reason": "step_limit"}
    chamadas = [rpc["method"] for rpc in mcp_transport.rpcs]
    assert chamadas.count("tools/call") == 4
    # Uma decisão a mais que rodada: a última é a que ainda pede tool e é barrada.
    assert len(provider_transport.corpos) == 5


async def test_laco_sem_texto_nenhum_ainda_devolve_algo_para_a_tela(settings_factory):
    """Balão vazio é indistinguível de travamento para quem está olhando."""
    eventos, _, _ = await rodar(
        settings_factory,
        [[fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"), fim("tool_calls")]],
    )

    tokens = [e for e in eventos if e.name == "token"]
    assert tokens and tokens[0].data["text"].strip()


async def test_teto_de_tools_por_rodada(settings_factory):
    """Dez tools num turno viram cinco chamadas, não dez."""
    fragmentos = [
        fragmento_de_tool(i, id=f"c{i}", name="list_meals", arguments="{}") for i in range(10)
    ]
    mcp_transport = duplo_do_mcp(catalogo=CATALOGO)
    await rodar(
        settings_factory,
        [[*fragmentos, fim("tool_calls")], [fragmento_de_texto("pronto")]],
        mcp_transport=mcp_transport,
    )

    chamadas = [rpc["method"] for rpc in mcp_transport.rpcs]
    assert chamadas.count("tools/call") == 5


async def test_o_historico_entra_no_prompt_antes_da_mensagem(settings_factory):
    _, provider_transport, _ = await rodar(
        settings_factory,
        [[fragmento_de_texto("oi")]],
        mensagem="e hoje?",
        historico=[
            {"role": "user", "content": "o que eu comi ontem?"},
            {"role": "assistant", "content": "arroz"},
        ],
    )

    mensagens = provider_transport.corpos[0]["messages"]
    assert mensagens[0]["role"] == "system"
    assert [m["content"] for m in mensagens[1:]] == [
        "o que eu comi ontem?",
        "arroz",
        "e hoje?",
    ]


async def test_falha_do_mcp_no_meio_da_conversa_vira_evento_de_erro(settings_factory):
    """Quando o primeiro token saiu, o 200 já foi — o erro só cabe dentro do fluxo.

    E `done` continua sendo o último evento: um cliente que só sabe fechar no
    `done` não pode ficar pendurado por causa de uma falha.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        corpo = json.loads(request.content)
        if corpo["method"] == "tools/list":
            return sse_jsonrpc(resultado_mcp(corpo["id"], {"tools": CATALOGO}))
        raise httpx.ConnectError("apps/api caiu")

    eventos, _, _ = await rodar(
        settings_factory,
        [[fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"), fim("tool_calls")]],
        mcp_transport=McpRecordingTransport(handler),
    )

    assert [e.name for e in eventos[-2:]] == ["error", "done"]
    assert eventos[-2].data["code"] == "MCP_UNREACHABLE"
    assert eventos[-1].data == {"reason": "error"}


async def test_provedor_que_cai_no_meio_do_stream_vira_evento_de_erro(settings_factory):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.RemoteProtocolError("gateway fechou a conexão")

    provider = build_provider(settings_factory(), transport=httpx.MockTransport(handler))
    mcp_transport = duplo_do_mcp(catalogo=CATALOGO)
    client = McpClient(base_url="http://localhost:3000/mcp", bearer=TOKEN, transport=mcp_transport)
    permitidas = somente_leitura(await client.list_tools())

    eventos = [
        evento
        async for evento in stream_chat_events(
            provider, client, permitidas, mensagem="oi", historico=[]
        )
    ]
    await client.aclose()
    await provider.aclose()

    assert [e.name for e in eventos] == ["error", "done"]
    assert eventos[0].data["code"] == "AI_PROVIDER_UNREACHABLE"


async def test_defeito_nosso_nao_vira_evento_de_erro_generico(settings_factory):
    """Exceção sem `code` continua subindo: o traceback é a única pista dela.

    Se ela virasse um `error` genérico no fluxo, o chat responderia "algo deu
    errado" e o defeito ficaria invisível.
    """

    class ProvedorComDefeito:
        def stream_chat(self, messages, *, tools=()) -> Never:
            raise ZeroDivisionError("defeito de programação")

    mcp_transport = duplo_do_mcp(catalogo=CATALOGO)
    client = McpClient(base_url="http://localhost:3000/mcp", bearer=TOKEN, transport=mcp_transport)
    permitidas = somente_leitura(await client.list_tools())

    with pytest.raises(ZeroDivisionError):
        async for _ in stream_chat_events(
            ProvedorComDefeito(),  # type: ignore[arg-type]
            client,
            permitidas,
            mensagem="oi",
            historico=[],
        ):
            pass

    await client.aclose()


# ------------------------------------------------------- o streaming incremental

# Uma reversão que emita os tokens no fim do nó (ou no fim da conversa) não muda
# a ORDEM de evento nenhum: nos casos acima, o turno que tem texto é o último. Os
# dois casos abaixo são os únicos que distinguem "emitiu na hora" de "emitiu no
# fim", e a propriedade que eles seguram é a que a #247 inteira existe para ter —
# um chat que só responde no fim parece travado.
PORTAO_TIMEOUT_S = 2.0


class ProvedorComPortao:
    """Provedor cujo turno **não termina** até alguém abrir o portão.

    O turno parado no meio é o ponto: um nó que acumule os pedaços e só emita
    depois do `async for` não tem nada para emitir enquanto o modelo não acaba —
    e o primeiro `token` só apareceria depois do portão, ou nunca.
    """

    def __init__(self, *, tool_calls: tuple[ToolCall, ...] = ()) -> None:
        self.portao = asyncio.Event()
        self._tool_calls = tool_calls

    async def stream_chat(
        self,
        messages: Sequence[dict[str, object]],
        *,
        tools: Sequence[dict[str, object]] = (),
    ) -> AsyncIterator[TextDelta | TurnEnd]:
        yield TextDelta(text="Você ")
        yield TextDelta(text="comeu ")
        await self.portao.wait()
        yield TextDelta(text="arroz.")
        yield TurnEnd(tool_calls=self._tool_calls)


async def test_o_token_sai_antes_de_o_turno_do_modelo_terminar(settings_factory):
    """O primeiro token chega com o modelo ainda escrevendo.

    Sem isto, nada no repositório distingue o chat token a token do chat que
    responde inteiro no fim: os dois passam por todos os outros casos, porque
    bufferizar não troca a ordem relativa dos eventos.
    """
    provedor = ProvedorComPortao()
    client = McpClient(
        base_url="http://localhost:3000/mcp",
        bearer=TOKEN,
        transport=duplo_do_mcp(catalogo=CATALOGO),
    )
    permitidas = somente_leitura(await client.list_tools())

    fluxo = stream_chat_events(
        provedor, client, permitidas, mensagem="o que eu comi?", historico=[]
    )
    try:
        primeiro = await asyncio.wait_for(anext(fluxo), timeout=PORTAO_TIMEOUT_S)
        assert (primeiro.name, primeiro.data) == ("token", {"text": "Você "})

        segundo = await asyncio.wait_for(anext(fluxo), timeout=PORTAO_TIMEOUT_S)
        assert (segundo.name, segundo.data) == ("token", {"text": "comeu "})

        # Só agora o modelo termina. O resto do fluxo continua igual.
        provedor.portao.set()
        resto = [evento async for evento in fluxo]
    finally:
        await fluxo.aclose()

    assert [(e.name, e.data) for e in resto] == [
        ("token", {"text": "arroz."}),
        ("done", {"reason": "stop"}),
    ]

    await client.aclose()


async def test_o_evento_de_tool_tambem_sai_antes_de_a_conversa_acabar(settings_factory):
    """A mesma garantia para o `tool` de `phase: "start"`.

    É ele que faz a tela mostrar "consultando suas refeições…" **enquanto** o
    `/mcp` responde. Aqui o `/mcp` fica pendurado de propósito: o `start` tem de
    chegar com a consulta ainda em curso, senão ele é um rótulo de progresso
    sobre uma coisa que já acabou.
    """
    provedor = ProvedorComPortao(tool_calls=(ToolCall(id="c1", name="list_meals", arguments="{}"),))
    mcp_respondendo = asyncio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        corpo = json.loads(request.content)
        if corpo["method"] == "tools/list":
            return sse_jsonrpc(resultado_mcp(corpo["id"], {"tools": CATALOGO}))
        await mcp_respondendo.wait()
        return sse_jsonrpc(
            resultado_mcp(corpo["id"], {"content": [{"type": "text", "text": "[]"}]})
        )

    client = McpClient(
        base_url="http://localhost:3000/mcp", bearer=TOKEN, transport=httpx.MockTransport(handler)
    )
    permitidas = somente_leitura(await client.list_tools())

    fluxo = stream_chat_events(provedor, client, permitidas, mensagem="oi", historico=[])
    try:
        # Os dois tokens do turno que ainda não terminou.
        await asyncio.wait_for(anext(fluxo), timeout=PORTAO_TIMEOUT_S)
        await asyncio.wait_for(anext(fluxo), timeout=PORTAO_TIMEOUT_S)
        provedor.portao.set()
        await asyncio.wait_for(anext(fluxo), timeout=PORTAO_TIMEOUT_S)  # "arroz."

        # O `/mcp` ainda não respondeu, e o `start` já tem de estar no fio.
        inicio = await asyncio.wait_for(anext(fluxo), timeout=PORTAO_TIMEOUT_S)
        assert (inicio.name, inicio.data["phase"]) == ("tool", "start")

        mcp_respondendo.set()
        fim_da_tool = await asyncio.wait_for(anext(fluxo), timeout=PORTAO_TIMEOUT_S)
        assert (fim_da_tool.name, fim_da_tool.data["phase"]) == ("tool", "end")
    finally:
        mcp_respondendo.set()
        await fluxo.aclose()

    await client.aclose()


async def test_historico_gigante_e_cortado_e_a_conversa_segue(settings_factory):
    """A resposta longa do modelo volta no histórico — e não pode matar a conversa.

    "Monte um plano de 7 dias" sai com mais de 4 000 caracteres, o NestJS
    persiste e reenvia no turno seguinte. Recusar isso com 422 mataria o fio para
    sempre, por um teto nosso que nem o PWA nem o NestJS têm como enxergar.
    """
    resposta_longa = "a" * (MAX_CARACTERES_POR_MENSAGEM + 2_000)
    _, provider_transport, _ = await rodar(
        settings_factory,
        [[fragmento_de_texto("ok")]],
        mensagem="e amanhã?",
        historico=[{"role": "assistant", "content": resposta_longa}],
    )

    (do_historico,) = [
        m for m in provider_transport.corpos[0]["messages"] if m["role"] == "assistant"
    ]
    assert len(do_historico["content"]) < len(resposta_longa)
    assert do_historico["content"].startswith("a" * MAX_CARACTERES_POR_MENSAGEM)
    # Cortado com marca visível: corte silencioso faz o modelo responder sobre
    # uma frase que ele acha completa e não está.
    assert do_historico["content"].endswith("… (mensagem cortada por tamanho)")
