"""O handshake de confirmação de tool CONFIRMABLE (ADR 022), pelos dois turnos.

O que estes testes seguram é a propriedade que a ADR 022 existe para ter: **uma
tool que escreve não roda sem aprovação**. Não basta afirmar que o `proposal`
sai — o defeito que já esteve aqui era o oposto, o evento saindo e a tool nunca
executando. Por isso cada teste olha o `/mcp`: `transporte.rpcs` diz o que de
fato foi chamado, e é a única testemunha que não depende de o grafo se
autodeclarar correto.
"""

from collections.abc import AsyncIterator

import httpx
import pytest

from fatia_agent.chat.errors import McpToolNotAllowed, McpUnreachable
from fatia_agent.chat.graph import MAX_ARGUMENTOS_APROVADOS, stream_chat_events
from fatia_agent.chat.mcp_client import McpClient, McpToolInfo
from fatia_agent.chat.tool_policy import exigir_aprovada, todas_permitidas
from fatia_agent.providers import build_provider

from .support import (
    ProviderRecordingTransport,
    duplo_do_mcp,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
    tool_do_catalogo,
)

pytestmark = pytest.mark.anyio

TOKEN = "tok-do-usuario"

CATALOGO = [
    tool_do_catalogo("list_meals", read_only=True),
    tool_do_catalogo("log_meal", read_only=False, confirmable=True),
    tool_do_catalogo("delete_meal", read_only=False),
]

ARGUMENTOS = '{"items":[{"food":"frango","grams":200}]}'


async def rodar(
    settings_factory,
    turnos,
    *,
    mensagem: str = "comi 200g de frango",
    aprovadas=(),
):
    """Roda o grafo e devolve (eventos, transporte do mcp)."""
    provider = build_provider(settings_factory(), transport=ProviderRecordingTransport(turnos))
    transporte_mcp = duplo_do_mcp(
        catalogo=CATALOGO,
        resultados={"log_meal": {"content": [{"type": "text", "text": '{"id":"refeicao-1"}'}]}},
    )
    client = McpClient(base_url="http://localhost:3000/mcp", bearer=TOKEN, transport=transporte_mcp)

    permitidas = todas_permitidas(await client.list_tools())
    eventos = [
        evento
        async for evento in stream_chat_events(
            provider,
            client,
            permitidas,
            mensagem=mensagem,
            historico=(),
            aprovadas=aprovadas,
        )
    ]

    await client.aclose()
    await provider.aclose()
    return eventos, transporte_mcp


def _tools_chamadas(transporte) -> list[str]:
    """Os nomes que chegaram ao `/mcp` em `tools/call`, na ordem."""
    nomes = []
    for corpo in transporte.rpcs:
        if corpo.get("method") != "tools/call":
            continue
        params = corpo.get("params")
        if isinstance(params, dict):
            nomes.append(params.get("name"))
    return nomes


def _turno_que_pede_log_meal(texto: str = "") -> list[dict[str, object]]:
    fragmentos = [fragmento_de_texto(texto)] if texto else []
    return [
        *fragmentos,
        fragmento_de_tool(0, id="c1", name="log_meal", arguments=ARGUMENTOS),
        fim("tool_calls"),
    ]


# ------------------------------------------------------------------ turno 1


async def test_tool_confirmavel_e_proposta_e_nao_executa(settings_factory):
    """O coração da ADR 022: o modelo pediu, saiu proposta, **nada foi gravado**."""
    eventos, transporte = await rodar(settings_factory, [_turno_que_pede_log_meal()])

    propostas = [e for e in eventos if e.name == "proposal"]
    assert [e.data for e in propostas] == [
        {"id": "c1", "name": "log_meal", "arguments": ARGUMENTOS}
    ]
    assert _tools_chamadas(transporte) == []
    assert eventos[-1].data == {"reason": "awaiting_confirmation"}


async def test_a_proposta_nao_emite_quadro_de_tool(settings_factory):
    """`tool` é o vocabulário de execução. A proposta não executou nada.

    Se ela saísse como `tool`/`input-available`, a tela mostraria uma chamada em
    andamento que nunca fecha — e o `ToolCall` ficaria girando para sempre.
    """
    eventos, _ = await rodar(settings_factory, [_turno_que_pede_log_meal()])

    assert [e.name for e in eventos if e.name == "tool"] == []


async def test_o_texto_antes_da_proposta_ainda_sai(settings_factory):
    """O modelo que explica antes de propor não perde a explicação."""
    eventos, _ = await rodar(settings_factory, [_turno_que_pede_log_meal("Vou registrar: ")])

    assert [e.data["text"] for e in eventos if e.name == "token"] == ["Vou registrar: "]


async def test_sem_resposta_e_com_proposta_nao_entra_o_fallback(settings_factory):
    """O retorno da tela é o modal; um "não consegui" ao lado dele mentiria."""
    eventos, _ = await rodar(settings_factory, [_turno_que_pede_log_meal()])

    assert [e for e in eventos if e.name == "token"] == []


async def test_leitura_e_escrita_na_mesma_rodada_nao_esperam_uma_a_outra(settings_factory):
    """A consulta roda; a escrita fica proposta. Ver o nó `confirmar`."""
    eventos, transporte = await rodar(
        settings_factory,
        [
            [
                fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"),
                fragmento_de_tool(1, id="c2", name="log_meal", arguments=ARGUMENTOS),
                fim("tool_calls"),
            ],
            [fragmento_de_texto("Hoje você comeu arroz."), fim()],
        ],
        mensagem="o que eu comi hoje? e registra 200g de frango",
    )

    assert _tools_chamadas(transporte) == ["list_meals"]
    assert [e.data["name"] for e in eventos if e.name == "proposal"] == ["log_meal"]


# ------------------------------------------------------------------ turno 2


async def test_proposta_aprovada_executa_sem_passar_pelo_modelo_antes(settings_factory):
    """O segundo turno grava, e o modelo só é chamado **depois** — para narrar.

    Um único turno no dublê do provedor: se o grafo consultasse o modelo antes de
    executar, faltaria fragmento e o teste estouraria em vez de passar torto.
    """
    eventos, transporte = await rodar(
        settings_factory,
        [[fragmento_de_texto("Registrei 200 g de frango."), fim()]],
        mensagem="confirmar",
        aprovadas=[{"name": "log_meal", "arguments": ARGUMENTOS}],
    )

    assert _tools_chamadas(transporte) == ["log_meal"]
    assert [e.data["text"] for e in eventos if e.name == "token"] == ["Registrei 200 g de frango."]
    assert eventos[-1].data == {"reason": "stop"}


async def test_a_execucao_aprovada_emite_os_dois_quadros_de_tool(settings_factory):
    """Agora sim é execução, e a tela mostra começo e fim como em qualquer tool."""
    eventos, _ = await rodar(
        settings_factory,
        [[fragmento_de_texto("Pronto."), fim()]],
        mensagem="confirmar",
        aprovadas=[{"name": "log_meal", "arguments": ARGUMENTOS}],
    )

    quadros = [e.data for e in eventos if e.name == "tool"]
    assert [q["state"] for q in quadros] == ["input-available", "output-available"]
    assert {q["id"] for q in quadros} == {quadros[0]["id"]}


async def test_aprovar_uma_coisa_nao_autoriza_outra(settings_factory):
    """Argumento diferente do aprovado **não** executa — nem parecido.

    É o defeito que faria "registra 200 g" aprovado na tela virar 2 kg gravado no
    banco, e nenhum outro teste daqui o pega: o nome bate, o recorte permite, e a
    única coisa que difere é o número que a pessoa leu antes de clicar.
    """
    adulterado = ARGUMENTOS.replace('"grams":200', '"grams":2000')
    eventos, transporte = await rodar(
        settings_factory,
        [
            [
                fragmento_de_tool(0, id="c1", name="log_meal", arguments=adulterado),
                fim("tool_calls"),
            ],
            [fragmento_de_texto("Não deu."), fim()],
        ],
        mensagem="confirmar",
        aprovadas=[{"name": "log_meal", "arguments": ARGUMENTOS}],
    )

    # A aprovação vale para o que ela aprovou: aquilo executa...
    assert _tools_chamadas(transporte) == ["log_meal"]
    chamada = next(c for c in transporte.rpcs if c.get("method") == "tools/call")
    assert chamada["params"]["arguments"] == {"items": [{"food": "frango", "grams": 200}]}
    # ...e o que o modelo pediu por cima volta como proposta, não como escrita.
    assert [e.data["arguments"] for e in eventos if e.name == "proposal"] == [adulterado]


async def test_argumentos_acima_do_teto_falham_sem_gravar(settings_factory):
    """Teto é recusa, não corte: JSON pela metade gravaria o pedaço que sobrou."""
    gigante = '{"nota":"' + "x" * (MAX_ARGUMENTOS_APROVADOS + 10) + '"}'
    eventos, transporte = await rodar(
        settings_factory,
        [[fragmento_de_texto("Não deu."), fim()]],
        mensagem="confirmar",
        aprovadas=[{"name": "log_meal", "arguments": gigante}],
    )

    assert _tools_chamadas(transporte) == []
    erros = [e.data for e in eventos if e.name == "tool" and e.data["state"] == "output-error"]
    assert len(erros) == 1
    assert "teto" in erros[0]["errorText"]


async def test_a_tool_restrita_continua_fora_mesmo_aprovada(settings_factory):
    """Aprovação não promove camada: `delete_meal` não é confirmável, é restrita.

    Sem esta guarda, um cliente que inventasse uma aprovação executaria o que
    nunca foi oferecido ao modelo — a ADR 022 furada pelo corpo da requisição.
    """
    eventos, transporte = await rodar(
        settings_factory,
        [[fragmento_de_texto("Não deu."), fim()]],
        mensagem="confirmar",
        aprovadas=[{"name": "delete_meal", "arguments": '{"id":"refeicao-1"}'}],
    )

    assert _tools_chamadas(transporte) == []
    erros = [e.data for e in eventos if e.name == "tool" and e.data["state"] == "output-error"]
    assert len(erros) == 1


async def test_o_catalogo_do_prompt_inclui_a_confirmavel_e_exclui_a_restrita(settings_factory):
    """Sem isto o modelo não tem como propor: ele não vê a tool."""
    transporte_mcp = duplo_do_mcp(catalogo=CATALOGO)
    client = McpClient(base_url="http://localhost:3000/mcp", bearer=TOKEN, transport=transporte_mcp)
    permitidas = todas_permitidas(await client.list_tools())
    await client.aclose()

    assert sorted(tool.name for tool in permitidas) == ["list_meals", "log_meal"]


async def test_proposta_nao_vaza_o_bearer(settings_factory):
    """A garantia 3 do contrato SSE vale para o evento novo também."""
    eventos, _ = await rodar(settings_factory, [_turno_que_pede_log_meal()])

    assert TOKEN not in "".join(e.frame() for e in eventos)


async def test_duas_confirmaveis_na_mesma_rodada_saem_como_duas_propostas(settings_factory):
    """Uma proposta por chamada, casada por `id` — a tela precisa das duas."""
    outra = '{"items":[{"food":"arroz","grams":100}]}'
    eventos, transporte = await rodar(
        settings_factory,
        [
            [
                fragmento_de_tool(0, id="c1", name="log_meal", arguments=ARGUMENTOS),
                fragmento_de_tool(1, id="c2", name="log_meal", arguments=outra),
                fim("tool_calls"),
            ]
        ],
        mensagem="registra frango e arroz",
    )

    propostas = [e.data for e in eventos if e.name == "proposal"]
    assert [p["id"] for p in propostas] == ["c1", "c2"]
    assert [p["arguments"] for p in propostas] == [ARGUMENTOS, outra]
    assert _tools_chamadas(transporte) == []


async def test_transporte_do_mcp_nao_e_tocado_quando_so_ha_proposta(settings_factory):
    """Nenhuma chamada além do `tools/list` da montagem — nem uma sondagem."""
    _, transporte = await rodar(settings_factory, [_turno_que_pede_log_meal()])

    metodos = [corpo.get("method") for corpo in transporte.rpcs]
    assert metodos == ["tools/list"]


async def test_httpx_nao_e_chamado_direto_pelo_grafo() -> None:
    """Sanidade do próprio dublê: sem transporte, um vazamento de rede apareceria."""
    with pytest.raises((httpx.ConnectError, httpx.UnsupportedProtocol, ValueError)):
        async with httpx.AsyncClient(base_url="http://127.0.0.1:1") as cliente:
            await cliente.get("/")


# ------------------------------------------------- a segunda barreira, direto
#
# `exigir_aprovada` é defesa em profundidade: com o roteamento intacto, nenhuma
# confirmável chega a `agir` sem aprovação, e por isso **nenhum teste de grafo
# fica vermelho quando ela é removida** — verificado. Testá-la pelo grafo exigiria
# quebrar o roteamento primeiro, e um teste que precisa de dois defeitos para
# falhar não segura nem um. Aqui ela é exercitada como unidade, que é o que a
# mantém viva quando alguém mexer nas arestas amanhã.


CONFIRMAVEIS = [
    McpToolInfo(
        name="log_meal",
        description="registra uma refeição",
        input_schema={"type": "object", "properties": {}},
        annotations={"readOnlyHint": False, "destructiveHint": False, "confirmableHint": True},
    )
]


def test_exigir_aprovada_deixa_passar_o_que_foi_aprovado() -> None:
    exigir_aprovada("log_meal", ARGUMENTOS, CONFIRMAVEIS, [("log_meal", ARGUMENTOS)])


def test_exigir_aprovada_recusa_sem_nenhuma_aprovacao() -> None:
    with pytest.raises(McpToolNotAllowed, match="aprovar na tela"):
        exigir_aprovada("log_meal", ARGUMENTOS, CONFIRMAVEIS, [])


def test_exigir_aprovada_recusa_argumento_diferente() -> None:
    """Aprovar 200 g não aprova 2 kg. É o ponto inteiro da função."""
    with pytest.raises(McpToolNotAllowed):
        exigir_aprovada(
            "log_meal",
            ARGUMENTOS.replace("200", "2000"),
            CONFIRMAVEIS,
            [("log_meal", ARGUMENTOS)],
        )


def test_exigir_aprovada_recusa_aprovacao_de_outra_tool() -> None:
    """Aprovar `log_meal` não autoriza `log_weight` com os mesmos argumentos."""
    with pytest.raises(McpToolNotAllowed):
        exigir_aprovada("log_meal", ARGUMENTOS, CONFIRMAVEIS, [("log_weight", ARGUMENTOS)])


def test_exigir_aprovada_ignora_tool_que_nao_e_confirmavel() -> None:
    """Leitura não precisa de aprovação, e exigir uma travaria todo o chat."""
    exigir_aprovada("list_meals", "{}", CONFIRMAVEIS, [])


async def test_erro_do_turno_vai_para_o_log(settings_factory, caplog):
    """O `code` chega à tela; a mensagem tem de chegar ao **log**.

    Sem isto o turno respondia 200, o erro viajava dentro do SSE, e o log do
    agente mostrava só o `200 OK` — "olhe os logs" não tinha o que mostrar
    exatamente no caso em que o log é a única pista. Aconteceu de verdade.
    """
    import logging

    transporte = duplo_do_mcp(catalogo=CATALOGO)

    async def explode(*_a: object, **_k: object) -> AsyncIterator[object]:
        raise McpUnreachable("o /mcp não respondeu em POST tools/call")
        yield  # pragma: no cover - torna a função um gerador assíncrono

    provider = build_provider(settings_factory(), transport=ProviderRecordingTransport([[]]))
    provider.stream_chat = explode  # type: ignore[method-assign]
    client = McpClient(base_url="http://x/mcp", bearer=TOKEN, transport=transporte)
    permitidas = todas_permitidas(await client.list_tools())

    with caplog.at_level(logging.WARNING):
        eventos = [
            e
            async for e in stream_chat_events(
                provider, client, permitidas, mensagem="oi", historico=()
            )
        ]

    await client.aclose()
    await provider.aclose()

    assert [e.name for e in eventos] == ["error", "done"]
    assert "MCP_UNREACHABLE" in caplog.text
    assert "não respondeu" in caplog.text
    # A garantia 3 do contrato vale para o log também.
    assert TOKEN not in caplog.text
