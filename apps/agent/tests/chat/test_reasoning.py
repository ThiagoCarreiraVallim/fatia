"""O raciocínio do modelo: vai para a tela, e só para a tela.

Três destinos diferentes, e é aqui que eles não podem se misturar:

- a tela recebe o raciocínio em blocos `reasoning`, que o assistant-ui desenha
  num painel colapsado;
- o estado, o checkpoint e o modelo na volta seguinte recebem só a resposta —
  rascunho não é resposta, e não vai para um histórico de saúde gravado;
- o `apps/api` grava só o texto (ver `leitor-do-turno.ts`).
"""

from typing import Any

from langgraph.checkpoint.memory import InMemorySaver

from fatia_agent.chat.graph import montar_grafo

from .support import fim, fragmento, fragmento_de_texto, fragmento_de_tool
from .turno import turno

PENSOU = "Preciso somar os itens do almoço."
RESPONDEU = "Você comeu 640 kcal."


def _raciocinio(texto: str) -> dict[str, object]:
    return fragmento(reasoning=texto)


def _blocos(dado: dict[str, Any], tipo: str) -> list[dict[str, Any]]:
    conteudo = dado.get("content")
    if not isinstance(conteudo, list):
        return []
    return [b for b in conteudo if isinstance(b, dict) and b.get("type") == tipo]


async def test_o_raciocinio_vai_para_a_tela_em_blocos_e_nao_como_resposta(settings_factory):
    r = await turno(
        settings_factory,
        [
            [
                _raciocinio("Preciso somar "),
                _raciocinio("os itens do almoço."),
                fragmento_de_texto(RESPONDEU),
                fim(),
            ]
        ],
    )

    pensado = "".join(
        b["reasoning"] for dado in r.data_of("messages") for b in _blocos(dado[0], "reasoning")
    )
    assert pensado == PENSOU
    # O texto da resposta não leva o rascunho junto.
    assert r.text() == RESPONDEU


async def test_a_resposta_final_traz_o_raciocinio_para_a_tela_nao_perder_o_painel(
    settings_factory,
):
    """A mensagem inteira substitui no cliente o que os fragmentos montaram.

    Sem o raciocínio nela, o painel "Pensando" sumia no fim do turno — com o
    texto certo na tela e o rascunho apagado.
    """
    r = await turno(settings_factory, [[_raciocinio(PENSOU), fragmento_de_texto(RESPONDEU), fim()]])

    (completa,) = r.data_of("messages/complete")
    assert [b["reasoning"] for b in _blocos(completa[0], "reasoning")] == [PENSOU]
    assert [b["text"] for b in _blocos(completa[0], "text")] == [RESPONDEU]


async def test_o_pedido_de_tool_que_chega_por_updates_tambem_traz_o_raciocinio(
    settings_factory,
):
    pede = [
        _raciocinio("Vou olhar as refeições."),
        fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"),
        fim("tool_calls"),
    ]
    r = await turno(settings_factory, [pede, [fragmento_de_texto(RESPONDEU), fim()]])

    pedidos = [
        mensagem
        for dado in r.data_of("updates")
        for no, conteudo in dado.items()
        if no == "agente"
        for mensagem in conteudo["messages"]
        if mensagem.get("tool_calls")
    ]
    assert pedidos, "o pedido de tool não saiu em `updates`"
    assert [b["reasoning"] for b in _blocos(pedidos[0], "reasoning")] == ["Vou olhar as refeições."]


async def test_o_raciocinio_nao_entra_no_checkpoint(settings_factory):
    """É o que o Postgres guarda (ADR 023), e o que volta ao modelo no turno seguinte."""
    saver = InMemorySaver()
    # ASCII de propósito: o `repr` dos bytes gravados escaparia acento, e as buscas
    # abaixo deixariam de achar qualquer coisa — o controle passaria por vacuidade.
    pensou, respondeu = "RASCUNHO somar os itens", "RESPOSTA 640 kcal"
    await turno(
        settings_factory,
        [[_raciocinio(pensou), fragmento_de_texto(respondeu), fim()]],
        grafo=montar_grafo(saver),
    )

    gravado = repr(saver.storage) + repr(saver.writes) + repr(saver.blobs)
    # Controle negativo: a resposta está lá, então a busca olha o lugar certo.
    assert respondeu in gravado
    assert pensou not in gravado


async def test_o_primeiro_caractere_conta_do_raciocinio(settings_factory):
    """É o raciocínio que aparece primeiro na tela; o tempo mede o que a pessoa vê."""
    r = await turno(settings_factory, [[_raciocinio(PENSOU), fragmento_de_texto(RESPONDEU), fim()]])
    (done,) = [dado for nome, dado in r.eventos if nome == "done"]
    assert "ttftMs" in done


async def test_quando_o_provedor_manda_as_duas_chaves_vale_uma_so(settings_factory):
    """OpenRouter usa `reasoning`, o LM Studio `reasoning_content`; há quem mande as duas."""
    r = await turno(
        settings_factory,
        [[fragmento(reasoning=PENSOU, reasoning_content=PENSOU), fragmento_de_texto("ok"), fim()]],
    )
    pensado = "".join(
        b["reasoning"] for dado in r.data_of("messages") for b in _blocos(dado[0], "reasoning")
    )
    assert pensado == PENSOU
