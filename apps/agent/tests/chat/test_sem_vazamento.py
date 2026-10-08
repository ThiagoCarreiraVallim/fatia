"""O Bearer não entra em log, span, estado nem checkpoint — e o texto da pessoa não entra em log.

O `apps/api` já corrigiu esta classe de defeito uma vez (#214): o serializador do
`pino-http` gravava `authorization` em texto puro a cada requisição, e nada no
repositório reclamava. O agente é o **segundo** lugar por onde o token do usuário
passa (ADR 021), então a mesma verificação precisa existir do lado Python — e
precisa exercitar o caminho inteiro, não só o cliente HTTP.

Com o checkpointer (ADR 023), o estado da conversa passou a ser **gravado**. O
caso que olha o checkpoint é o que segura a linha entre `EstadoDaConversa` (vai
para o banco) e `ContextoDoTurno` (onde mora o cliente com o Bearer).

Uma conversa de chat carrega, além do token, o que a pessoa escreveu. Num
rastreador de nutrição isso é dado de saúde (`docs/DATA_RETENTION.md`), e "o log
não tem o token" não é o bastante se tiver a frase.
"""

import logging

import pytest
from langgraph.checkpoint.memory import InMemorySaver

from fatia_agent.chat.graph import montar_grafo
from fatia_agent.chat.mcp_client import McpClient

from .support import (
    duplo_do_mcp,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
    tool_do_catalogo,
)
from .turno import Resultado, turno

TOKEN = "tok-secreto-do-usuario-nao-pode-vazar"
CONFIDENCIA = "engordei porque estou tomando corticoide"

CATALOGO = [
    tool_do_catalogo("list_meals", read_only=True),
    tool_do_catalogo("log_meal", read_only=False, confirmable=True),
]

TURNOS = [
    [fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"), fim("tool_calls")],
    [fragmento_de_texto("Entendi.")],
]


async def conversar(settings_factory, **extra: object) -> Resultado:
    return await turno(
        settings_factory,
        extra.pop("turnos", TURNOS),  # type: ignore[arg-type]
        mensagem=CONFIDENCIA,
        catalogo=CATALOGO,
        token=TOKEN,
        **extra,
    )


@pytest.fixture
def caplog_tudo(caplog: pytest.LogCaptureFixture) -> pytest.LogCaptureFixture:
    """Captura de TODO logger, no nível mais baixo.

    Sem o `set_level` na raiz, uma biblioteca que loga em DEBUG não apareceria — e
    o caso passaria verde exatamente sobre o log que ninguém esperava existir.
    """
    caplog.set_level(logging.DEBUG)
    return caplog


def _registrado(caplog: pytest.LogCaptureFixture) -> str:
    return "\n".join(
        [record.getMessage() for record in caplog.records]
        + [str(record.args) for record in caplog.records]
    )


async def test_a_conversa_inteira_nao_loga_nem_imprime_o_bearer_nem_o_que_a_pessoa_escreveu(
    settings_factory, caplog_tudo, capsys
):
    """Log **e** saída padrão — o uvicorn manda os dois para o stdout do container."""
    await conversar(settings_factory)

    saida = capsys.readouterr()
    varrido = "\n".join([_registrado(caplog_tudo), saida.out, saida.err])
    assert TOKEN not in varrido
    assert CONFIDENCIA not in varrido


def test_a_varredura_pegaria_o_vazamento_se_ele_existisse(caplog_tudo, capsys):
    """Controle negativo dos dois canais varridos pelo caso acima.

    Sem ele, "não vazou" e "não olhei" são a mesma saída verde — e o caso
    continuaria verde no dia em que `caplog` parasse de capturar a raiz ou o
    `capsys` deixasse de ver o stdout de dentro do `async`.
    """
    logging.getLogger("fatia_agent.controle").debug("Authorization: Bearer %s", TOKEN)
    print(CONFIDENCIA)  # o vazamento que o caso acima procura

    saida = capsys.readouterr()
    assert TOKEN in _registrado(caplog_tudo)
    assert CONFIDENCIA in saida.out


async def test_nenhum_quadro_do_fluxo_carrega_o_bearer(settings_factory):
    """O fluxo atravessa NestJS e PWA. O token não pode ir junto em lugar nenhum."""
    r = await conversar(settings_factory)
    assert TOKEN not in "".join(r.brutos)


async def test_o_checkpoint_gravado_nao_tem_o_token(settings_factory):
    """É o que o Postgres guarda (ADR 023). Olha o saver inteiro, e não só os campos
    que o teste conhece — inclusive as escritas pendentes de uma pausa."""
    saver = InMemorySaver()
    await conversar(
        settings_factory,
        grafo=montar_grafo(saver),
        turnos=[
            [
                fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"),
                fragmento_de_tool(1, id="c2", name="log_meal", arguments="{}"),
                fim("tool_calls"),
            ]
        ],
    )

    gravado = repr(saver.storage) + repr(saver.writes) + repr(saver.blobs)
    assert TOKEN not in gravado
    # Controle negativo: sem a conversa dentro, a afirmação acima seria
    # verdadeira por vacuidade. As duas frases são ASCII de propósito — o `repr`
    # de bytes escaparia acento, e o controle passaria a não achar nada.
    assert CONFIDENCIA in gravado


def test_o_repr_do_cliente_nao_entrega_o_header(settings_factory):
    """`repr` de objeto acaba em mensagem de exceção e em relatório de teste."""
    client = McpClient(
        base_url="http://localhost:3000/mcp",
        bearer=TOKEN,
        transport=duplo_do_mcp(catalogo=CATALOGO),
    )

    assert TOKEN not in repr(client)
    assert TOKEN not in repr(client._client.headers)


async def test_o_bearer_nao_vaza_para_o_provedor_de_ia(settings_factory):
    """Duas dependências, duas credenciais — e nenhuma atravessa para a outra."""
    r = await conversar(settings_factory)

    for request in r.provider.requests:
        assert TOKEN not in str(request.headers)
        assert TOKEN not in request.content.decode("utf-8")
