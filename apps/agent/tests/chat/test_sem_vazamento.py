"""O Bearer não entra em log, span nem histórico — e o texto da pessoa também não.

O `apps/api` já corrigiu esta classe de defeito uma vez (#214): o serializador do
`pino-http` gravava `authorization` em texto puro a cada requisição, e nada no
repositório reclamava. O agente é o **segundo** lugar por onde o token do usuário
passa (ADR 021), então a mesma verificação precisa existir do lado Python — e
precisa exercitar o caminho inteiro, não só o cliente HTTP.

Uma conversa de chat carrega, além do token, o que a pessoa escreveu. Num
rastreador de nutrição isso é dado de saúde (`docs/DATA_RETENTION.md`), e "o log
não tem o token" não é o bastante se tiver a frase.
"""

import logging

import pytest

from fatia_agent.chat.graph import montar_grafo, stream_chat_events
from fatia_agent.chat.mcp_client import McpClient
from fatia_agent.chat.tool_policy import somente_leitura
from fatia_agent.providers import build_provider

from .support import (
    ProviderRecordingTransport,
    duplo_do_mcp,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
    tool_do_catalogo,
)

TOKEN = "tok-secreto-do-usuario-nao-pode-vazar"
CONFIDENCIA = "engordei porque estou tomando corticoide"

CATALOGO = [tool_do_catalogo("list_meals", read_only=True)]

TURNOS = [
    [fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"), fim("tool_calls")],
    [fragmento_de_texto("Entendi.")],
]


def montar(settings_factory):
    provider = build_provider(settings_factory(), transport=ProviderRecordingTransport(TURNOS))
    client = McpClient(
        base_url="http://localhost:3000/mcp",
        bearer=TOKEN,
        transport=duplo_do_mcp(catalogo=CATALOGO),
    )
    return provider, client


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
    """Log **e** saída padrão.

    O agente não tem logger nenhum hoje (`grep -rn "logging" src/` não devolve
    linha), então a varredura de `caplog` sozinha era uma afirmação sobre um
    canal vazio. `print` é o canal que existe de fato — é como se depura Python
    às pressas, o uvicorn manda tudo para o stdout do container, e um
    `print(mensagem)` esquecido põe a frase da pessoa no log da máquina sem que
    uma linha de `logging` apareça no repositório.
    """
    provider, client = montar(settings_factory)
    permitidas = somente_leitura(await client.list_tools())

    async for _ in stream_chat_events(
        provider, client, permitidas, mensagem=CONFIDENCIA, historico=[]
    ):
        pass

    await client.aclose()
    await provider.aclose()

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


async def test_nenhum_evento_do_fluxo_carrega_o_bearer(settings_factory):
    """O fluxo atravessa NestJS e PWA. O token não pode ir junto em lugar nenhum."""
    provider, client = montar(settings_factory)
    permitidas = somente_leitura(await client.list_tools())

    fluxo = ""
    async for evento in stream_chat_events(
        provider, client, permitidas, mensagem=CONFIDENCIA, historico=[]
    ):
        fluxo += evento.frame()

    await client.aclose()
    await provider.aclose()

    assert TOKEN not in fluxo


async def test_o_estado_final_do_grafo_nao_tem_o_token(settings_factory):
    """É o estado que um checkpointer gravaria e que o tracing serializaria.

    O `langsmith` entra como dependência transitiva do LangGraph: basta uma
    variável de ambiente para o estado começar a ser exportado. Por isso o cliente
    é alcançado por **fecho**, e não pelo `state` nem pelo `config` — e por isso
    este caso olha o estado inteiro, e não só os campos que ele conhece.
    """
    provider, client = montar(settings_factory)
    permitidas = somente_leitura(await client.list_tools())
    grafo = montar_grafo(provider, client, permitidas)

    final = await grafo.ainvoke(
        {
            "mensagem": CONFIDENCIA,
            "historico": [],
            "mensagens": [],
            "pendentes": [],
            "rodadas": 0,
            "resposta": "",
            "motivo": "stop",
        }
    )

    await client.aclose()
    await provider.aclose()

    assert TOKEN not in repr(final)
    # Controle negativo: se o estado não tivesse a conversa dentro, a afirmação
    # acima seria verdadeira por vacuidade — e continuaria verdadeira no dia em
    # que o token entrasse junto com um estado que ninguém mais inspeciona.
    assert CONFIDENCIA in repr(final)


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
    """Duas dependências, duas credenciais — e nenhuma atravessa para a outra.

    O gateway de IA recebe `AI_API_KEY`; o `/mcp` recebe o Bearer do usuário.
    Misturar as duas mandaria o token de acesso de cada pessoa para um terceiro,
    que é a forma mais cara possível de errar.
    """
    provider_transport = ProviderRecordingTransport(TURNOS)
    provider = build_provider(settings_factory(ai_api_key=""), transport=provider_transport)
    client = McpClient(
        base_url="http://localhost:3000/mcp",
        bearer=TOKEN,
        transport=duplo_do_mcp(catalogo=CATALOGO),
    )
    permitidas = somente_leitura(await client.list_tools())

    async for _ in stream_chat_events(
        provider, client, permitidas, mensagem=CONFIDENCIA, historico=[]
    ):
        pass

    await client.aclose()
    await provider.aclose()

    for request in provider_transport.requests:
        assert TOKEN not in str(request.headers)
        assert TOKEN not in request.content.decode("utf-8")
