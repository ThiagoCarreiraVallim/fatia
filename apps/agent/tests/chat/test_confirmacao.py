"""As pausas: escrita confirmável (ADR 022) e pergunta à pessoa, retomadas pelo checkpoint.

A propriedade que estes casos seguram é a da ADR 023: **o que executa é o que a
pessoa viu**, e só depois de um sim explícito — e a retomada nunca reexecuta o
que já rodou.
"""

import json
import logging

from fatia_agent.chat.graph import MAX_ARGUMENTOS_APROVADOS, NAO_EXECUTADA, RECUSADA

from .support import duplo_do_mcp, fim, fragmento_de_texto, fragmento_de_tool
from .turno import CATALOGO, TOKEN, Resultado, turno

REFEICAO = {"mealType": "lunch", "items": [{"foodId": "f1", "grams": 200}]}


def _pede(*chamadas: tuple[str, str, object]) -> list[dict[str, object]]:
    return [
        *(
            fragmento_de_tool(
                indice,
                id=identificador,
                name=nome,
                arguments=argumentos if isinstance(argumentos, str) else json.dumps(argumentos),
            )
            for indice, (identificador, nome, argumentos) in enumerate(chamadas)
        ),
        fim("tool_calls"),
    ]


async def _pausado(
    settings_factory, *chamadas: tuple[str, str, object], texto_antes: str = ""
) -> Resultado:
    antes = [fragmento_de_texto(texto_antes)] if texto_antes else []
    return await turno(
        settings_factory, [[*antes, *_pede(*chamadas)]], mensagem="registra o almoço"
    )


async def test_tool_confirmavel_pausa_e_nao_executa(settings_factory):
    r = await _pausado(settings_factory, ("c1", "log_meal", REFEICAO))

    assert r.de("done") == [{"status": "interrupted"}]
    assert r.chamadas_ao_mcp("log_meal") == 0
    assert "messages/complete" not in r.nomes()

    pausa = r.interrupcao()
    assert pausa["id"]
    assert pausa["value"]["kind"] == "confirm"
    (acao,) = pausa["value"]["actions"]
    # Os argumentos vão inteiros: é o que a pessoa lê para decidir, e é o que
    # vai executar se ela aprovar.
    assert acao == {
        "kind": "confirm",
        "toolCallId": "c1",
        "tool": "log_meal",
        "title": "Log Meal",
        "prompt": "Log Meal",
        "arguments": REFEICAO,
    }


async def test_o_texto_antes_do_pedido_ainda_sai(settings_factory):
    r = await _pausado(settings_factory, ("c1", "log_meal", REFEICAO), texto_antes="Vou registrar.")
    assert r.texto() == "Vou registrar."


async def test_leitura_na_mesma_volta_roda_antes_da_pausa(settings_factory):
    """Bloquear a leitura faria a pessoa aprovar algo para ver o que só perguntou."""
    r = await _pausado(settings_factory, ("c1", "list_meals", {}), ("c2", "log_meal", REFEICAO))

    assert r.chamadas_ao_mcp("list_meals") == 1
    assert r.chamadas_ao_mcp("log_meal") == 0
    assert [a["toolCallId"] for a in r.interrupcao()["value"]["actions"]] == ["c2"]


async def test_aprovada_executa_o_que_esta_no_checkpoint_antes_do_modelo(settings_factory):
    pausado = await _pausado(settings_factory, ("c1", "log_meal", REFEICAO))
    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("Registrei o almoço.")]],
        mensagem=None,
        retomada={"approvals": {"c1": True}},
        grafo=pausado.grafo,
    )

    assert retomado.chamadas_ao_mcp("log_meal") == 1
    chamada = next(
        json.loads(r.content)
        for r in retomado.mcp.requests  # type: ignore[attr-defined]
        if json.loads(r.content).get("method") == "tools/call"
    )
    assert chamada["params"] == {"name": "log_meal", "arguments": REFEICAO}
    # Executou antes de falar com o modelo: a única chamada ao provedor já vê o
    # resultado da tool.
    (unica,) = retomado.provider.corpos
    assert unica["messages"][-1]["role"] == "tool"
    assert retomado.texto() == "Registrei o almoço."
    assert retomado.de("done") == [{"status": "completed"}]


async def test_recusada_nao_grava_e_o_modelo_sabe_por_que(settings_factory):
    pausado = await _pausado(settings_factory, ("c1", "log_meal", REFEICAO))
    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("Tudo bem, não registrei.")]],
        mensagem=None,
        retomada={"approvals": {"c1": False}},
        grafo=pausado.grafo,
    )

    assert retomado.chamadas_ao_mcp("log_meal") == 0
    (resultado,) = retomado.mensagens_de_tool()
    assert (resultado["status"], resultado["content"]) == ("error", RECUSADA)
    assert retomado.provider.corpos[0]["messages"][-1]["content"] == RECUSADA


async def test_o_default_e_nao(settings_factory):
    """Gravar precisa de um sim explícito — não da ausência de um não."""
    for resposta in ("talvez", {"approvals": {}}, {"approvals": {"c1": "true"}}, None, 1):
        pausado = await _pausado(settings_factory, ("c1", "log_meal", REFEICAO))
        retomado = await turno(
            settings_factory,
            [[fragmento_de_texto("ok")]],
            mensagem=None,
            retomada=resposta,
            grafo=pausado.grafo,
        )
        assert retomado.chamadas_ao_mcp("log_meal") == 0, resposta


async def test_duas_escritas_numa_pausa_so_decididas_uma_a_uma(settings_factory):
    pausado = await _pausado(
        settings_factory, ("c1", "log_meal", REFEICAO), ("c2", "log_weight", {"kg": 80})
    )
    assert [a["toolCallId"] for a in pausado.interrupcao()["value"]["actions"]] == ["c1", "c2"]

    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("ok")]],
        mensagem=None,
        retomada={"approvals": {"c1": False, "c2": True}},
        grafo=pausado.grafo,
    )
    assert retomado.chamadas_ao_mcp("log_meal") == 0
    assert retomado.chamadas_ao_mcp("log_weight") == 1


async def test_retomar_nao_reexecuta_a_leitura_que_ja_rodou(settings_factory):
    """O LangGraph reexecuta o nó interrompido. Por isso quem para é o portão."""
    pausado = await _pausado(
        settings_factory, ("c1", "list_meals", {}), ("c2", "log_meal", REFEICAO)
    )
    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("ok")]],
        mensagem=None,
        retomada={"approvals": {"c2": True}},
        grafo=pausado.grafo,
    )
    assert retomado.chamadas_ao_mcp("list_meals") == 0
    assert retomado.chamadas_ao_mcp("log_meal") == 1


async def test_argumentos_acima_do_teto_falham_sem_gravar(settings_factory):
    enorme = {"notes": "x" * (MAX_ARGUMENTOS_APROVADOS + 1)}
    pausado = await _pausado(settings_factory, ("c1", "log_meal", enorme))
    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("ok")]],
        mensagem=None,
        retomada=True,
        grafo=pausado.grafo,
    )

    assert retomado.chamadas_ao_mcp("log_meal") == 0
    (resultado,) = retomado.mensagens_de_tool()
    assert resultado["status"] == "error"
    assert "acima do teto" in resultado["content"]


async def test_a_restrita_nao_pausa_e_nao_executa(settings_factory):
    r = await _pausado(settings_factory, ("c1", "delete_meal", {"id": "m1"}))

    assert r.de("done") != [{"status": "interrupted"}]
    assert r.chamadas_ao_mcp("delete_meal") == 0


async def test_mensagem_nova_no_lugar_da_resposta_nao_quebra_a_conversa(settings_factory):
    """A pessoa ignorou o card e escreveu outra coisa.

    A chamada pendente fica sem resultado no estado, e o provedor recusaria a
    conversa inteira com 400 — por isso o reparo na ida ao modelo.
    """
    pausado = await _pausado(settings_factory, ("c1", "log_meal", REFEICAO))
    seguinte = await turno(
        settings_factory,
        [[fragmento_de_texto("Certo, esqueci o almoço.")]],
        mensagem="deixa pra lá",
        grafo=pausado.grafo,
    )

    assert seguinte.chamadas_ao_mcp("log_meal") == 0
    enviadas = seguinte.provider.corpos[0]["messages"]
    orfa = next(m for m in enviadas if m.get("role") == "tool")
    assert (orfa["tool_call_id"], orfa["content"]) == ("c1", NAO_EXECUTADA)
    assert enviadas[-1] == {"role": "user", "content": "deixa pra lá"}
    assert seguinte.de("done") == [{"status": "completed"}]


# ------------------------------------------------------------------ ask_user


async def test_ask_user_pausa_com_o_formulario(settings_factory):
    pergunta = {
        "prompt": "Quantas gramas?",
        "fields": [{"name": "gramas", "label": "Gramas", "type": "number", "required": True}],
    }
    r = await _pausado(settings_factory, ("q1", "ask_user", pergunta))

    assert r.de("done") == [{"status": "interrupted"}]
    valor = r.interrupcao()["value"]
    assert (valor["kind"], valor["prompt"]) == ("question", "Quantas gramas?")
    (acao,) = valor["actions"]
    assert acao["toolCallId"] == "q1"
    assert acao["fields"] == pergunta["fields"]
    # Não é tool do `/mcp`: a pergunta não sai do agente.
    assert r.chamadas_ao_mcp("ask_user") == 0


async def test_a_resposta_da_pergunta_volta_como_resultado_da_tool(settings_factory):
    pausado = await _pausado(settings_factory, ("q1", "ask_user", {"prompt": "Quantas gramas?"}))
    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("Anotado.")]],
        mensagem=None,
        retomada={"gramas": 150},
        grafo=pausado.grafo,
    )

    resposta = retomado.provider.corpos[0]["messages"][-1]
    assert resposta == {"role": "tool", "tool_call_id": "q1", "content": "gramas: 150"}
    assert retomado.texto() == "Anotado."


async def test_pergunta_e_escrita_na_mesma_volta_saem_numa_pausa_so(settings_factory):
    pausado = await _pausado(
        settings_factory,
        ("q1", "ask_user", {"prompt": "Que horas?"}),
        ("c1", "log_weight", {"kg": 80}),
    )
    kinds = [a["kind"] for a in pausado.interrupcao()["value"]["actions"]]
    assert kinds == ["question", "confirm"]

    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("ok")]],
        mensagem=None,
        retomada={"answers": {"q1": "8h"}, "approvals": {"c1": True}},
        grafo=pausado.grafo,
    )
    assert retomado.chamadas_ao_mcp("log_weight") == 1
    enviadas = retomado.provider.corpos[0]["messages"]
    assert {"role": "tool", "tool_call_id": "q1", "content": "8h"} in enviadas


# ------------------------------------------------------------------ segurança


async def test_a_pausa_nao_carrega_o_bearer(settings_factory):
    r = await _pausado(settings_factory, ("c1", "log_meal", REFEICAO))
    assert TOKEN not in "".join(r.brutos)


async def test_o_catalogo_do_prompt_inclui_a_confirmavel_e_exclui_a_restrita(settings_factory):
    r = await _pausado(settings_factory, ("c1", "log_meal", REFEICAO))
    nomes = {tool["function"]["name"] for tool in r.provider.corpos[0]["tools"]}
    assert "log_meal" in nomes
    assert "delete_meal" not in nomes


async def test_erro_do_turno_vai_para_o_log(settings_factory, caplog):
    import httpx

    def handler(request: httpx.Request) -> httpx.Response:
        corpo = json.loads(request.content)
        if corpo["method"] == "tools/list":
            return duplo_do_mcp(catalogo=CATALOGO).handle_request(request)
        return httpx.Response(503)

    caplog.set_level(logging.WARNING)
    await turno(
        settings_factory,
        [_pede(("c1", "list_meals", {}))],
        mcp_transport=httpx.MockTransport(handler),
    )
    assert any("Turno de chat terminou em" in record.getMessage() for record in caplog.records)
