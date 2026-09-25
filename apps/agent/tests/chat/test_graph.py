"""O grafo: o protocolo no fio, o ciclo de tool, a memória da thread e as paradas.

Nada de duplo caseiro de provedor ou de cliente MCP: os dois são os objetos de
produção, com o transporte do `httpx` trocado por um que emite o formato de
verdade. A confirmação e as perguntas estão em `test_confirmacao.py`.
"""

import asyncio
import json
from collections.abc import AsyncIterator, Sequence
from typing import Never

import httpx
import pytest
from langgraph.checkpoint.memory import InMemorySaver

from fatia_agent.chat.graph import (
    MAX_CARACTERES_POR_MENSAGEM,
    MAX_RODADAS_DE_TOOL,
    MAX_TOOLS_POR_RODADA,
    SEM_RESPOSTA,
    montar_grafo,
    stream_chat_events,
)
from fatia_agent.chat.mcp_client import McpClient
from fatia_agent.chat.state import ContextoDoTurno
from fatia_agent.chat.tool_policy import todas_permitidas
from fatia_agent.prompts.chat_pt_br import cercar
from fatia_agent.providers.base import TextDelta, ToolCall, TurnEnd

from .support import (
    bloco_de_uso,
    duplo_do_mcp,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
    resultado_mcp,
    sse_jsonrpc,
)
from .turno import CATALOGO, CONVERSA, THREAD, TOKEN, quadros, turno


def _com_tool(nome: str, *, id: str = "c1", arguments: str = "{}") -> list[dict[str, object]]:
    return [fragmento_de_tool(0, id=id, name=nome, arguments=arguments), fim("tool_calls")]


async def test_resposta_sem_tool_segue_o_protocolo_nativo(settings_factory):
    r = await turno(
        settings_factory, [[fragmento_de_texto("Você "), fragmento_de_texto("comeu arroz.")]]
    )

    assert r.nomes()[:2] == ["start", "catalog"]
    assert r.nomes()[-2:] == ["messages/complete", "done"]
    assert r.de("start") == [{"conversationId": CONVERSA, "runId": "run-1"}]
    assert [d[0]["content"] for d in r.de("messages")] == ["Você ", "comeu arroz."]
    # Os fragmentos são da mesma mensagem: é pelo `id` que a tela os junta.
    assert len({d[0]["id"] for d in r.de("messages")}) == 1
    assert r.de("messages")[0][0]["type"] == "AIMessageChunk"
    assert r.de("messages")[0][1] == {"langgraph_node": "agente"}
    (final,) = r.de("messages/complete")[0]
    assert final["content"] == "Você comeu arroz."
    assert final["id"] == r.de("messages")[0][0]["id"]
    assert r.de("done") == [{"status": "completed"}]


async def test_o_catalogo_leva_o_titulo_de_toda_tool_oferecida(settings_factory):
    """A tela rotula pelo título que o `/mcp` anuncia — não por uma tabela à mão."""
    r = await turno(settings_factory, [[fragmento_de_texto("ok")]])

    (catalogo,) = r.de("catalog")
    assert catalogo["tools"]["list_meals"] == "List Meals"
    assert catalogo["tools"]["log_meal"] == "Log Meal"
    assert "delete_meal" not in catalogo["tools"]


async def test_o_ciclo_de_tool_chega_pelas_atualizacoes_do_grafo(settings_factory):
    r = await turno(
        settings_factory,
        [
            _com_tool("list_meals", arguments='{"date":"2026-08-05"}'),
            [fragmento_de_texto("Arroz.")],
        ],
        mcp_transport=duplo_do_mcp(
            catalogo=CATALOGO,
            resultados={
                "list_meals": {"content": [{"type": "text", "text": '[{"nome":"arroz"}]'}]}
            },
        ),
    )

    pedido = next(d["agente"]["messages"][0] for d in r.de("updates") if "agente" in d)
    assert pedido["tool_calls"][0]["name"] == "list_meals"
    assert pedido["tool_calls"][0]["args"] == {"date": "2026-08-05"}
    (resultado,) = r.mensagens_de_tool()
    assert resultado["tool_call_id"] == "c1"
    assert resultado["status"] == "success"
    assert resultado["content"] == '[{"nome":"arroz"}]'
    assert r.texto() == "Arroz."
    assert r.de("done") == [{"status": "completed"}]

    # A resposta da tool volta ao modelo no formato da OpenAI, cercada como dado.
    segundo = r.provider.corpos[1]["messages"]
    assert segundo[-1] == {
        "role": "tool",
        "tool_call_id": "c1",
        "content": cercar("RESULTADO DE list_meals", '[{"nome":"arroz"}]'),
    }


async def test_o_modelo_enxerga_leitura_confirmavel_e_ask_user_mas_nao_a_restrita(
    settings_factory,
):
    r = await turno(settings_factory, [[fragmento_de_texto("ok")]])

    nomes = {tool["function"]["name"] for tool in r.provider.corpos[0]["tools"]}
    assert nomes == {"list_meals", "log_meal", "log_weight", "ask_user"}


async def test_tool_alucinada_vira_falha_de_tool_e_a_conversa_continua(settings_factory):
    r = await turno(
        settings_factory, [_com_tool("delete_meal"), [fragmento_de_texto("Não posso apagar.")]]
    )

    (resultado,) = r.mensagens_de_tool()
    assert resultado["status"] == "error"
    assert "recorte permitido" in resultado["content"]
    assert r.chamadas_ao_mcp("delete_meal") == 0
    assert r.texto() == "Não posso apagar."


async def test_argumentos_quebrados_do_modelo_nao_derrubam_a_conversa(settings_factory):
    r = await turno(
        settings_factory,
        [_com_tool("list_meals", arguments='{"date":'), [fragmento_de_texto("Tentei.")]],
    )

    (resultado,) = r.mensagens_de_tool()
    assert resultado["status"] == "error"
    assert "não são JSON" in resultado["content"]
    assert r.chamadas_ao_mcp("list_meals") == 0
    # A chamada torta ainda vai ao provedor com a resposta dela, senão ele
    # recusaria o histórico na volta seguinte.
    chamada = r.provider.corpos[1]["messages"][-2]["tool_calls"][0]
    assert chamada["function"]["arguments"] == '{"date":'


async def test_tool_que_falha_no_apps_api_vira_resultado_com_erro(settings_factory):
    r = await turno(
        settings_factory,
        [_com_tool("list_meals"), [fragmento_de_texto("Deu erro.")]],
        mcp_transport=duplo_do_mcp(
            catalogo=CATALOGO,
            resultados={
                "list_meals": {"content": [{"type": "text", "text": "NOT_FOUND"}], "isError": True}
            },
        ),
    )

    (resultado,) = r.mensagens_de_tool()
    assert (resultado["status"], resultado["content"]) == ("error", "NOT_FOUND")


async def test_modelo_em_laco_pausa_no_teto_e_pergunta_se_continua(settings_factory):
    """O teto de voltas deixou de ser um corte calado: vira a pausa `continue`."""
    r = await turno(settings_factory, [_com_tool("list_meals")])

    assert r.chamadas_ao_mcp("list_meals") == MAX_RODADAS_DE_TOOL
    assert r.de("done") == [{"status": "interrupted"}]
    pausa = r.interrupcao()["value"]
    assert pausa["kind"] == "continue"
    assert pausa["actions"] == []
    # O resumo diz o que já foi feito, pelo título da tool — é o que deixa a
    # pessoa decidir sem adivinhar.
    assert "List Meals" in pausa["summary"]


async def test_continuar_concede_mais_voltas(settings_factory):
    pausado = await turno(settings_factory, [_com_tool("list_meals")])
    retomado = await turno(
        settings_factory,
        [_com_tool("list_meals"), [fragmento_de_texto("Pronto.")]],
        mensagem=None,
        retomada=True,
        grafo=pausado.grafo,
    )

    # A chamada que estava pendente roda, e o modelo segue de onde parou.
    assert retomado.chamadas_ao_mcp("list_meals") == 2
    assert retomado.texto() == "Pronto."
    assert retomado.de("done") == [{"status": "completed"}]


async def test_parar_por_aqui_fecha_sem_ferramenta(settings_factory):
    pausado = await turno(settings_factory, [_com_tool("list_meals")])
    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("Até aqui encontrei arroz.")]],
        mensagem=None,
        retomada=False,
        grafo=pausado.grafo,
    )

    assert retomado.chamadas_ao_mcp("list_meals") == 0
    (unica,) = retomado.provider.corpos
    # A volta de fechamento não recebe ferramenta nenhuma, e o prompt diz por quê.
    assert "tools" not in unica
    assert "NÃO chame mais nenhuma ferramenta" in unica["messages"][0]["content"]
    assert retomado.texto() == "Até aqui encontrei arroz."


async def test_tool_que_falha_duas_vezes_vira_reflexao(settings_factory):
    r = await turno(
        settings_factory,
        [
            _com_tool("list_meals", id="c1"),
            _com_tool("list_meals", id="c2"),
            # A terceira insistência não roda: vira reflexão antes da tool.
            _com_tool("list_meals", id="c3"),
            [fragmento_de_texto("Não consegui consultar.")],
        ],
        mcp_transport=duplo_do_mcp(
            catalogo=CATALOGO,
            resultados={
                "list_meals": {"content": [{"type": "text", "text": "x"}], "isError": True}
            },
        ),
    )

    assert r.chamadas_ao_mcp("list_meals") == 2
    ultimo = r.provider.corpos[-1]["messages"][0]["content"]
    assert "falhou 2 vezes seguidas" in ultimo
    assert r.texto().endswith("Não consegui consultar.")


async def test_resposta_que_mostra_uuid_e_refeita_uma_vez(settings_factory):
    r = await turno(
        settings_factory,
        [
            [fragmento_de_texto("Sua refeição 3f1c9a52-6b1e-4d8a-9c2f-0a5e7b3d1c44 foi ok.")],
            [fragmento_de_texto("Seu almoço foi registrado.")],
        ],
    )

    assert len(r.provider.corpos) == 2
    assert "identificador interno" in r.provider.corpos[1]["messages"][0]["content"]
    assert r.de("validation")[0] == {
        "ok": False,
        "issues": ["a resposta mostrou um identificador interno (UUID)"],
    }
    (final,) = r.de("messages/complete")[0]
    assert final["content"] == "Seu almoço foi registrado."


async def test_a_validacao_nao_vira_pingue_pongue(settings_factory):
    r = await turno(
        settings_factory,
        [[fragmento_de_texto("Como uma IA, não posso.")]],
    )

    # Uma volta de correção, e só: a segunda reprovação fecha o turno.
    assert len(r.provider.corpos) == 2
    assert r.de("done") == [{"status": "completed"}]


async def test_resposta_vazia_ainda_devolve_algo_para_a_tela(settings_factory):
    r = await turno(settings_factory, [[fim("stop")]])

    assert r.texto() == SEM_RESPOSTA
    (final,) = r.de("messages/complete")[0]
    assert final["content"] == SEM_RESPOSTA


async def test_teto_de_tools_por_rodada(settings_factory):
    muitas = [
        fragmento_de_tool(i, id=f"c{i}", name="list_meals", arguments="{}")
        for i in range(MAX_TOOLS_POR_RODADA + 3)
    ]
    r = await turno(settings_factory, [[*muitas, fim("tool_calls")], [fragmento_de_texto("ok")]])

    assert r.chamadas_ao_mcp("list_meals") == MAX_TOOLS_POR_RODADA


async def test_thread_fria_e_semeada_com_o_historico_antes_da_mensagem(settings_factory):
    r = await turno(
        settings_factory,
        [[fragmento_de_texto("ok")]],
        mensagem="e amanhã?",
        historico=[
            {"role": "user", "content": "o que eu comi ontem?"},
            {"role": "assistant", "content": "Arroz."},
        ],
    )

    enviadas = r.provider.corpos[0]["messages"]
    assert [(m["role"], m["content"]) for m in enviadas[1:]] == [
        ("user", "o que eu comi ontem?"),
        ("assistant", "Arroz."),
        ("user", "e amanhã?"),
    ]


async def test_thread_quente_ignora_o_historico_e_usa_o_estado(settings_factory):
    """Numa thread com estado, o histórico do `apps/api` não entra de novo.

    Reaplicá-lo a cada turno duplicaria a conversa inteira no prompt — e as
    chamadas de tool, que só o estado tem, sumiriam.
    """
    primeiro = await turno(settings_factory, [[fragmento_de_texto("Arroz.")]], mensagem="oi")
    segundo = await turno(
        settings_factory,
        [[fragmento_de_texto("ok")]],
        mensagem="e amanhã?",
        grafo=primeiro.grafo,
        historico=[{"role": "user", "content": "histórico que não pode entrar"}],
    )

    enviadas = segundo.provider.corpos[0]["messages"]
    assert [(m["role"], m["content"]) for m in enviadas[1:]] == [
        ("user", "oi"),
        ("assistant", "Arroz."),
        ("user", "e amanhã?"),
    ]


async def test_a_thread_de_outra_pessoa_nao_se_mistura(settings_factory):
    primeiro = await turno(settings_factory, [[fragmento_de_texto("Arroz.")]], mensagem="segredo")
    outro = await turno(
        settings_factory,
        [[fragmento_de_texto("ok")]],
        mensagem="oi",
        grafo=primeiro.grafo,
        thread="user-2:conversa-1",
    )

    conteudos = [m["content"] for m in outro.provider.corpos[0]["messages"][1:]]
    assert conteudos == ["oi"]


async def test_falha_do_mcp_no_meio_da_conversa_vira_evento_de_erro(settings_factory):
    def handler(request: httpx.Request) -> httpx.Response:
        corpo = json.loads(request.content)
        if corpo["method"] == "tools/list":
            return sse_jsonrpc(resultado_mcp(corpo["id"], {"tools": CATALOGO}))
        return httpx.Response(401)

    r = await turno(
        settings_factory,
        [_com_tool("list_meals"), [fragmento_de_texto("nunca")]],
        mcp_transport=httpx.MockTransport(handler),
    )

    (erro,) = r.de("error")
    assert erro["code"] == "MCP_UNAUTHORIZED"
    assert r.nomes()[-1] == "done"
    assert r.de("done") == [{"status": "error"}]


async def test_provedor_que_cai_no_meio_do_stream_vira_evento_de_erro(settings_factory):
    class ProvedorQueCai:
        async def stream_chat(self, messages, *, tools=()) -> AsyncIterator[TextDelta]:
            from fatia_agent.providers.errors import AIProviderTimeout

            yield TextDelta(text="Você ")
            raise AIProviderTimeout("o gateway demorou")

        async def aclose(self) -> None:
            return None

    fluxo = await _fluxo(ProvedorQueCai(), mensagem="oi")
    eventos = quadros([q async for q in fluxo])

    assert ("error", {"code": "AI_PROVIDER_TIMEOUT", "message": "o gateway demorou"}) in eventos
    assert eventos[-1] == ("done", {"status": "error"})


async def test_defeito_nosso_nao_vira_evento_de_erro_generico(settings_factory):
    """Exceção sem `code` continua subindo: o traceback é a única pista dela."""

    class ProvedorComDefeito:
        def stream_chat(self, messages, *, tools=()) -> Never:
            raise ZeroDivisionError("defeito de programação")

    fluxo = await _fluxo(ProvedorComDefeito(), mensagem="oi")
    with pytest.raises(ZeroDivisionError):
        async for _ in fluxo:
            pass


async def _fluxo(provedor: object, *, mensagem: str) -> AsyncIterator[str]:
    client = McpClient(
        base_url="http://localhost:3000/mcp",
        bearer=TOKEN,
        transport=duplo_do_mcp(catalogo=CATALOGO),
    )
    permitidas = todas_permitidas(await client.list_tools())
    contexto = ContextoDoTurno(
        provider=provedor,  # type: ignore[arg-type]
        client=client,
        permitidas=tuple(permitidas),
        run_id="run-1",
    )
    return stream_chat_events(
        montar_grafo(InMemorySaver()),
        contexto,
        thread_id=THREAD,
        conversation_id=CONVERSA,
        mensagem=mensagem,
    )


# ------------------------------------------------------- o streaming incremental

# Bufferizar não troca a ORDEM de evento nenhum. Os dois casos abaixo são os
# únicos que distinguem "emitiu na hora" de "emitiu no fim", e a propriedade que
# eles seguram é a que a #247 inteira existe para ter.
PORTAO_TIMEOUT_S = 2.0


class ProvedorComPortao:
    """Provedor cujo turno **não termina** até alguém abrir o portão."""

    def __init__(self, *, tool_calls: tuple[ToolCall, ...] = ()) -> None:
        self.portao = asyncio.Event()
        self._tool_calls = tool_calls
        self._chamadas = 0

    async def stream_chat(
        self,
        messages: Sequence[dict[str, object]],
        *,
        tools: Sequence[dict[str, object]] = (),
    ) -> AsyncIterator[TextDelta | TurnEnd]:
        self._chamadas += 1
        if self._chamadas > 1:
            yield TextDelta(text="Pronto.")
            yield TurnEnd()
            return
        yield TextDelta(text="Você ")
        yield TextDelta(text="comeu ")
        await self.portao.wait()
        yield TextDelta(text="arroz.")
        yield TurnEnd(tool_calls=self._tool_calls)


async def _proximo_evento(fluxo: AsyncIterator[str], nome: str) -> object:
    while True:
        (evento,) = quadros([await asyncio.wait_for(anext(fluxo), timeout=PORTAO_TIMEOUT_S)])
        if evento[0] == nome:
            return evento[1]


async def test_o_token_sai_antes_de_o_turno_do_modelo_terminar(settings_factory):
    provedor = ProvedorComPortao()
    fluxo = await _fluxo(provedor, mensagem="o que eu comi?")
    try:
        primeiro = await _proximo_evento(fluxo, "messages")
        assert primeiro[0]["content"] == "Você "  # type: ignore[index]
        segundo = await _proximo_evento(fluxo, "messages")
        assert segundo[0]["content"] == "comeu "  # type: ignore[index]

        provedor.portao.set()
        resto = quadros([q async for q in fluxo])
    finally:
        await fluxo.aclose()  # type: ignore[attr-defined]

    assert resto[-1] == ("done", {"status": "completed"})


async def test_o_pedido_de_tool_sai_antes_de_a_tool_responder(settings_factory):
    """A tela mostra "consultando…" **enquanto** o `/mcp` responde.

    O `/mcp` fica pendurado de propósito: o pedido de tool tem de estar no fio
    com a consulta ainda em curso, senão o rótulo de progresso é sobre algo que
    já acabou.
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
    contexto = ContextoDoTurno(
        provider=provedor,  # type: ignore[arg-type]
        client=client,
        permitidas=tuple(todas_permitidas(await client.list_tools())),
        run_id="run-1",
    )
    fluxo = stream_chat_events(
        montar_grafo(InMemorySaver()),
        contexto,
        thread_id=THREAD,
        conversation_id=CONVERSA,
        mensagem="oi",
    )
    try:
        await _proximo_evento(fluxo, "messages")
        provedor.portao.set()
        pedido = await _proximo_evento(fluxo, "updates")
        assert pedido["agente"]["messages"][0]["tool_calls"][0]["id"] == "c1"  # type: ignore[index]

        mcp_respondendo.set()
        resultado = await _proximo_evento(fluxo, "updates")
        assert resultado["ferramentas"]["messages"][0]["tool_call_id"] == "c1"  # type: ignore[index]
    finally:
        mcp_respondendo.set()
        await fluxo.aclose()
        await client.aclose()


async def test_historico_gigante_e_cortado_e_a_conversa_segue(settings_factory):
    resposta_longa = "a" * (MAX_CARACTERES_POR_MENSAGEM + 2_000)
    r = await turno(
        settings_factory,
        [[fragmento_de_texto("ok")]],
        mensagem="e amanhã?",
        historico=[
            {"role": "user", "content": "monte um plano"},
            {"role": "assistant", "content": resposta_longa},
        ],
    )

    (do_historico,) = [m for m in r.provider.corpos[0]["messages"] if m["role"] == "assistant"]
    assert do_historico["content"].startswith("a" * MAX_CARACTERES_POR_MENSAGEM)
    assert do_historico["content"].endswith("… (mensagem cortada por tamanho)")


async def test_o_uso_sai_como_evento_uma_vez_por_chamada_ao_modelo(settings_factory):
    r = await turno(
        settings_factory,
        [
            [*_com_tool("list_meals"), bloco_de_uso(prompt_tokens=100, completion_tokens=10)],
            [fragmento_de_texto("ok"), bloco_de_uso(prompt_tokens=200, completion_tokens=20)],
        ],
    )

    assert r.de("usage") == [
        {"model": "ornith-1.0-9b", "inputUnits": 100, "outputUnits": 10},
        {"model": "ornith-1.0-9b", "inputUnits": 200, "outputUnits": 20},
    ]


async def test_sem_bloco_de_usage_nenhum_evento_de_uso_sai(settings_factory):
    r = await turno(settings_factory, [[fragmento_de_texto("ok")]])
    assert r.de("usage") == []


async def test_o_fuso_vira_a_data_de_hoje_no_prompt(settings_factory):
    r = await turno(settings_factory, [[fragmento_de_texto("ok")]], timezone="America/Sao_Paulo")
    sistema = r.provider.corpos[0]["messages"][0]
    assert sistema["role"] == "system"
    assert "fuso America/Sao_Paulo" in sistema["content"]


async def test_fuso_desconhecido_responde_sem_a_linha_de_data(settings_factory):
    r = await turno(settings_factory, [[fragmento_de_texto("ok")]], timezone="Marte/Olympus")
    assert "Hoje é" not in r.provider.corpos[0]["messages"][0]["content"]
