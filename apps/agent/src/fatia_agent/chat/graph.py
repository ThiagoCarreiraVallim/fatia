"""O grafo LangGraph da conversa: receber → decidir → agir → responder.

## Por que LangGraph aqui, e não na #139

O reconhecimento de foto é uma chamada e uma validação, em linha reta — um grafo
de um nó só seria a dependência e a cerimônia sem o benefício, e está escrito
assim em `recognition/recognize_meal.py`. O chat é o caso oposto: ele **volta**.
O modelo pede tool, a tool responde, o modelo decide de novo, e isso se repete
até ele parar de pedir. É ciclo com condição de parada, que é exatamente o que um
`StateGraph` descreve melhor que um `while` com quatro flags.

## O que **não** entra no grafo

O Bearer do usuário. Ele vive dentro do `McpClient`, que os nós alcançam por
**fecho** — o grafo é montado por conversa e o cliente é capturado na montagem.
Não passa pelo `state` e não passa pelo `config`: os dois são serializados por
checkpointer e por tracing (o `langsmith` entra como dependência transitiva do
LangGraph), e um token no estado seria um token no rastro. É a mesma classe de
defeito da #214, onde o serializador do `pino-http` gravava `authorization` em
texto puro sem ninguém ter pedido.

Pelo mesmo motivo não há checkpointer: a persistência da conversa é do NestJS
(sub-issue 2/3 da #247), e um checkpointer aqui gravaria histórico de saúde num
segundo lugar, fora do banco que a LGPD deste produto descreve.
"""

from collections.abc import AsyncIterator, Sequence
from typing import Any, TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from ..prompts.chat_pt_br import SISTEMA
from ..providers.base import TextDelta, ToolChatCapability, TurnEnd
from ..providers.errors import AIProviderError
from . import events
from .errors import McpError, McpToolRejected
from .mcp_client import McpClient, McpToolInfo
from .tool_policy import argumentos_do_modelo, exigir_permitida, formato_openai

# Rodadas de tool por mensagem do usuário. Quatro cobre "consulta, refina,
# consulta de novo, responde"; acima disso, na prática, é o modelo em laço.
MAX_RODADAS_DE_TOOL = 4

# Tools por rodada. Com o teto acima, dá no máximo 20 chamadas ao `/mcp` por
# mensagem — folgado dentro do limite de 60/min por usuário que o
# `mcp-throttler.guard.ts` aplica, e que é **do usuário**: um agente em laço
# gastaria a cota do Claude dele.
MAX_TOOLS_POR_RODADA = 5

# Mensagens de histórico que entram no prompt. O NestJS é quem persiste
# (sub-issue 2/3) e quem decide o que reenviar; o teto aqui é para que uma
# conversa longa não vire um prompt de megabytes contra o gateway pago.
MAX_HISTORICO = 40

# Caracteres por mensagem. Vale como **recusa** para a mensagem que a pessoa
# acabou de escrever (ela está na tela, e o cliente sabe contar caracteres) e
# como **corte** para o histórico, que vem do que já aconteceu.
#
# A diferença não é estilo. O que entra no histórico inclui a resposta do modelo,
# cujo tamanho ninguém controla: um "monte um plano de 7 dias" que sai com 6 000
# caracteres, persistido pelo NestJS e reenviado no turno seguinte, viraria um
# 422 permanente — a conversa morta por um teto nosso, sem que o PWA ou o NestJS
# tivessem como saber por quê. Cortar degrada o contexto; recusar mata o fio.
MAX_CARACTERES_POR_MENSAGEM = 4_000

# Reticência visível: histórico cortado em silêncio faz o modelo responder sobre
# uma frase que ele acha completa e não está.
AVISO_DE_CORTE = "… (mensagem cortada por tamanho)"


class EstadoDaConversa(TypedDict):
    """O estado do grafo. **Nenhum campo de credencial** — ver o docstring."""

    mensagem: str
    historico: list[dict[str, str]]
    mensagens: list[dict[str, Any]]
    pendentes: list[dict[str, str]]
    rodadas: int
    resposta: str
    motivo: str


GrafoDaConversa = CompiledStateGraph[EstadoDaConversa, None, EstadoDaConversa, EstadoDaConversa]


def _cortado(conteudo: str) -> str:
    """Uma mensagem do histórico no tamanho que entra no prompt."""
    if len(conteudo) <= MAX_CARACTERES_POR_MENSAGEM:
        return conteudo
    return conteudo[:MAX_CARACTERES_POR_MENSAGEM] + AVISO_DE_CORTE


def montar_grafo(
    provider: ToolChatCapability,
    client: McpClient,
    permitidas: Sequence[McpToolInfo],
) -> GrafoDaConversa:
    """Compila o grafo desta conversa, com provedor e cliente presos por fecho.

    Um grafo por conversa, e não um global: é o que mantém o Bearer fora do
    estado. Compilar um `StateGraph` de quatro nós é montar quatro dicionários —
    irrelevante diante de uma chamada de LLM.
    """
    catalogo_openai = formato_openai(permitidas)

    async def receber(state: EstadoDaConversa) -> dict[str, Any]:
        """Monta o prompt: sistema + histórico recortado + a mensagem de agora.

        O recorte do histórico **corta**, e não recusa — nas duas dimensões, a
        quantidade de mensagens e o tamanho de cada uma. Ver
        `MAX_CARACTERES_POR_MENSAGEM`.
        """
        historico = state["historico"][-MAX_HISTORICO:]
        mensagens: list[dict[str, Any]] = [{"role": "system", "content": SISTEMA}]
        mensagens.extend({"role": m["role"], "content": _cortado(m["content"])} for m in historico)
        mensagens.append({"role": "user", "content": state["mensagem"]})
        return {"mensagens": mensagens, "rodadas": 0, "resposta": "", "pendentes": []}

    async def decidir(state: EstadoDaConversa) -> dict[str, Any]:
        """Chama o modelo em streaming: ou ele responde, ou pede tools."""
        writer = get_stream_writer()
        texto: list[str] = []
        pendentes: list[dict[str, str]] = []

        async for pedaco in provider.stream_chat(state["mensagens"], tools=catalogo_openai):
            if isinstance(pedaco, TextDelta):
                texto.append(pedaco.text)
                # Emitido na hora, e não no fim do nó: é isto que faz o chat
                # aparecer token a token em vez de aparecer inteiro no fim.
                writer(events.token(pedaco.text))
            elif isinstance(pedaco, TurnEnd):
                pendentes = [
                    {"id": chamada.id, "name": chamada.name, "arguments": chamada.arguments}
                    for chamada in pedaco.tool_calls[:MAX_TOOLS_POR_RODADA]
                ]

        conteudo = "".join(texto)
        mensagens = [*state["mensagens"]]
        if pendentes:
            mensagens.append(
                {
                    "role": "assistant",
                    "content": conteudo,
                    "tool_calls": [
                        {
                            "id": chamada["id"],
                            "type": "function",
                            "function": {
                                "name": chamada["name"],
                                "arguments": chamada["arguments"],
                            },
                        }
                        for chamada in pendentes
                    ],
                }
            )
        elif conteudo:
            mensagens.append({"role": "assistant", "content": conteudo})

        return {
            "mensagens": mensagens,
            "pendentes": pendentes,
            "resposta": state["resposta"] + conteudo,
        }

    async def agir(state: EstadoDaConversa) -> dict[str, Any]:
        """Executa as tools pedidas, pelo `/mcp`, com o Bearer de quem está falando."""
        writer = get_stream_writer()
        mensagens = [*state["mensagens"]]

        for chamada in state["pendentes"]:
            nome = chamada["name"]
            writer(events.tool_start(nome, chamada["arguments"]))

            try:
                exigir_permitida(nome, permitidas)
                argumentos = argumentos_do_modelo(chamada["arguments"])
                resultado = await client.call_tool(nome, argumentos)
                texto, deu_certo = resultado.text, not resultado.is_error
            except McpToolRejected as exc:
                # Recuperável: o modelo pediu errado. Vira resultado de tool com
                # falha para ele ler e se corrigir — derrubar a conversa aqui
                # trocaria "pedi a tool errada" por "o chat caiu".
                texto, deu_certo = exc.message, False

            writer(events.tool_end(nome, ok=deu_certo, result=texto))
            mensagens.append({"role": "tool", "tool_call_id": chamada["id"], "content": texto})

        return {"mensagens": mensagens, "pendentes": [], "rodadas": state["rodadas"] + 1}

    async def responder(state: EstadoDaConversa) -> dict[str, Any]:
        """Fecha o turno e emite o `done` — o último evento, sempre."""
        writer = get_stream_writer()
        motivo = "step_limit" if state["pendentes"] else "stop"

        if not state["resposta"].strip():
            # Modelo que gasta o teto de rodadas chamando tool e nunca escreve
            # deixaria a tela com um balão vazio, indistinguível de travamento.
            fallback = (
                "Consultei seus dados, mas não consegui fechar uma resposta. "
                "Tente perguntar de outro jeito."
            )
            writer(events.token(fallback))

        writer(events.done(motivo))
        return {"motivo": motivo}

    def rota_apos_decidir(state: EstadoDaConversa) -> str:
        if state["pendentes"] and state["rodadas"] < MAX_RODADAS_DE_TOOL:
            return "agir"
        return "responder"

    grafo = StateGraph(EstadoDaConversa)
    grafo.add_node("receber", receber)
    grafo.add_node("decidir", decidir)
    grafo.add_node("agir", agir)
    grafo.add_node("responder", responder)

    grafo.add_edge(START, "receber")
    grafo.add_edge("receber", "decidir")
    grafo.add_conditional_edges(
        "decidir", rota_apos_decidir, {"agir": "agir", "responder": "responder"}
    )
    grafo.add_edge("agir", "decidir")
    grafo.add_edge("responder", END)

    return grafo.compile()


async def stream_chat_events(
    provider: ToolChatCapability,
    client: McpClient,
    permitidas: Sequence[McpToolInfo],
    *,
    mensagem: str,
    historico: Sequence[dict[str, str]],
) -> AsyncIterator[events.ChatEvent]:
    """Roda o grafo e devolve os eventos do SSE, na ordem em que aconteceram.

    Erro que chega até aqui vira **evento**, não exceção: quando o primeiro token
    saiu, o 200 já foi enviado e não há mais status para mudar. O `code` é o
    mesmo que o envelope JSON carregaria, para o NestJS traduzir do mesmo jeito
    nos dois caminhos.
    """
    grafo = montar_grafo(provider, client, permitidas)
    estado: EstadoDaConversa = {
        "mensagem": mensagem,
        "historico": list(historico),
        "mensagens": [],
        "pendentes": [],
        "rodadas": 0,
        "resposta": "",
        "motivo": "stop",
    }

    try:
        async for emitido in grafo.astream(estado, stream_mode="custom"):
            # O writer só recebe `ChatEvent` (ver os nós): qualquer outra coisa
            # aqui seria um erro de programação, não um dado a tolerar.
            if not isinstance(emitido, events.ChatEvent):
                raise TypeError(f"O grafo emitiu {type(emitido).__name__}, não um ChatEvent.")
            yield emitido
    # Só as duas famílias nomeadas. Exceção sem `code` continua subindo: ela é
    # defeito nosso, e transformá-la num evento `error` genérico esconderia o
    # traceback exatamente onde ele é a única pista.
    except (AIProviderError, McpError) as exc:
        yield events.error(exc.code, exc.message)
        yield events.done("error")


__all__ = [
    "AVISO_DE_CORTE",
    "MAX_CARACTERES_POR_MENSAGEM",
    "MAX_HISTORICO",
    "MAX_RODADAS_DE_TOOL",
    "MAX_TOOLS_POR_RODADA",
    "EstadoDaConversa",
    "montar_grafo",
    "stream_chat_events",
]
