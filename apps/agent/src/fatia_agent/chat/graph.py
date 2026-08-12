"""O grafo LangGraph da conversa: receber -> decidir -> [confirmar] -> agir -> responder.

## Por que LangGraph aqui, e não na #139

O reconhecimento de foto é uma chamada e uma validação, em linha reta - um grafo
de um no so seria a dependencia e a cerimonia sem o beneficio, e esta escrito
assim em `recognition/recognize_meal.py`. O chat e o caso oposto: ele volta.
O modelo pede tool, a tool responde, o modelo decide de novo, e isso se repete
te ele parar de pedir. E ciclo com condi de parada, que e exatamente o que um
`StateGraph` descreve melhor que um `while` com quatro flags.

## O que nao entra no grafo

O Bearer do usuario. Ele vive dentro do `McpClient`, que os nos alcan am por
fecho - o grafo e montado por conversa e o cliente e capturado na montagem.
Nao passa pelo `state` e nao passa pelo `config`: os dois s serializados por
checkpointer e por tracing (o `langsmith` entra como dependencia transitiva do
LangGraph), e um token no estado seria um token no rastro. E a mesma classe de
defeito da #214, onde o serializador do `pino-http` gravava `authorization` em
texto puro sem ninguem ter pedido.

Pelo mesmo motivo nao ha checkpointer: a persistencia da conversa e do NestJS
(sub-issue 2/3 da #247), e um checkpointer aqui gravaria historico de saude num
segundo lugar, fora do banco que a LGPD deste produto descreve.

## Pausa para confirma o CONFIRMABLE (ADR 021)

Quando o modelo pede uma tool CONFIRMABLE (`confirmableHint is True`), o grafo
pausa em um estado intermediario `proposta_confirmavel`. O no `confirmar`
emite evento SSE de tipo `proposta` com os detalhes da opera pendente.
O NestJS repassa esse evento sem bufferizar; o PWA renderiza um modal usando
design system swervable. A aprova fecha a pausa e volta para executar; o recuo
cancela a proposta, mas o turno continua.

A confirma o e por texto/emoji na conversa; o modal popup so no PWA Web
(nao mobile/Expo - ver escopo da #208).

"""

from collections.abc import AsyncIterator, Sequence
from typing import Any, TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from ..providers.base import TextDelta, ToolChatCapability, TurnEnd
from ..providers.errors import AIProviderError
from .errors import McpError, McpToolRejected
from .mcp_client import McpClient, McpToolInfo
from .tool_policy import (
    camada_confirmavel,
    argumentos_do_modelo,
    exigir_permitida,
    formato_openai,
)

# Rodadas de tool por mensagem do usuario. Quatro cobre "consulta, refina,
# consulta de novo, responde"; acima disso, na pratica, e o modelo em la o.
MAX_RODADAS_DE_TOOL = 4

# Tools por rodada. Com o teto acima, da no maximo 20 chamadas ao `/mcp` por
# mensagem - folgado dentro do limite de 60/min por usuario que o
# `mcp-throttler.guard.ts` aplica, e que e **do usuario**: um agente em la o
# gastaria a cota do Claude dele.
MAX_TOOLS_POR_RODADA = 5

# Mensagens de historico que entram no prompt. O NestJS e quem persiste
# (sub-issue 2/3) e quem decide o que reenviar; o teto aqui e para que uma
# conversa longa nao vira um prompt de megabytes contra o gateway pago.
MAX_HISTORICO = 40

# Caracteres por mensagem. Vale como **recusa** para a mensagem que a pessoa
# acabou de escrever (ela esta na tela, e o cliente sabe contar caracteres) e
# como **corte** para o historico, que vem do que ja aconteceu.
#
# A diferen a n e estilo. O que entra no historico inclui a resposta do modelo,
# cujo tamanho ninguem controla: um "monte um plano de 7 dias" que sai com 6 000
# caracteres, persistido pelo NestJS e reenviado no turno seguinte, viraria um
# 422 permanente - a conversa morta por um teto nosso, sem que o PWA ou o NestJS
# tivessem como saber por que. Cortar degrada o contexto; recusar mata o fio.
MAX_CARACTERES_POR_MENSAGEM = 4_000

# Reticencia visivel: historico cortado em silencio faz o modelo responder sobre
# uma frase que ele acha completa e nao esta.
AVISO_DE_CORTE = "… (mensagem cortada por tamanho)"


class EstadoDaConversa(TypedDict):
    """O estado do grafo. Sem campo de credencial - ver o docstring.

    `pendentes` e a lista de ferramentas confirmaveis que ainda precisam de
    aprova vis ual no PWA. Cada item carrega id, nome e argumentos, para o modal
    do NestJS renderizar um resumo do que esta pendente de confirma o.

    Quando ha itens em `pendentes`, o grafo pausa neste estado ate a aprova o.

    `aprovadas` e o conjunto de ids das tools confirmaveis ja aprovadas pelo
    usuario. O grafo usa isso para saber se pode ir direto pra ac ao ou precisa
    pausar novamente no no confirmar.
    """

    mensagem: str
    historico: list[dict[str, str]]
    mensagens: list[dict[str, Any]]
    pendentes: list[dict[str, str]]
    rodadas: int
    resposta: str
    motivo: str
    aprovadas: set[str]


GrafoDaConversa = CompiledStateGraph[EstadoDaConversa, None, EstadoDaConversa, EstadoDaConversa]


def _cortado(conteudo: str) -> str:
    """Uma mensagem do historico no tamanho que entra no prompt."""
    if len(conteudo) <= MAX_CARACTERES_POR_MENSAGEM:
        return conteudo
    return conteudo[:MAX_CARACTERES_POR_MENSAGEM] + AVISO_DE_CORTE


def montar_grafo(
    provider: ToolChatCapability,
    client: McpClient,
    permitidas: Sequence[McpToolInfo],
    *,
    timezone: str | None = None,
) -> GrafoDaConversa:
    """Compila o grafo desta conversa, com provedor e cliente presos por fecho.

    Um grafo por conversa, e n ao um global: e o que mantem o Bearer fora do
    estado. Compilar um `StateGraph` de quatro nos e montar quatro dicionarios -
    irrelevante diante de uma chamada de LLM.

    `timezone` e o fuso de quem esta conversando, que o `apps/api` ja conhece do
    perfil. Ele entra no prompt como a data de hoje - sem isso o modelo nao tem
    como resolver "ontem" numa chamada de tool, e chuta uma data.
    """
    catalogo_openai = formato_openai(permitidas)

    async def receber(state: EstadoDaConversa) -> dict[str, Any]:
        """Monta o prompt: sistema + historico recortado + a mensagem de agora."""
        historico = state["historico"][-MAX_HISTORICO:]
        aprovadas: set[str] = set(state.get("aprovadas", []))
        mensagens: list[dict[str, Any]] = [
            {"role": "system", "content": sistema_com_data(timezone)}
        ]
        mensagens.extend({"role": m["role"], "content": _cortado(m["content"])} for m in historico)
        mensagens.append({"role": "user", "content": state["mensagem"]})
        return {
            "mensagens": mensagens,
            "pendentes": [],
            "aprovadas": aprovadas,
            "rodadas": 0,
            "resposta": "",
        }

    async def decidir(state: EstadoDaConversa) -> dict[str, Any]:
        """Chama o modelo em streaming: ou ele responde, ou pede tools."""
        writer = get_stream_writer()
        texto: list[str] = []
        pendentes: list[dict[str, str]] = []

        async for pedaco in provider.stream_chat(state["mensagens"], tools=catalogo_openai):
            if isinstance(pedaco, TextDelta):
                texto.append(pedaco.text)
                writer(events.token(pedaco.text))
            elif isinstance(pedaco, TurnEnd):
                pendentes = [
                    {"id": chamada.id, "name": chamada.name, "arguments": chamada.arguments}
                    for chamada in pedaco.tool_calls[:MAX_TOOLS_POR_RODADA]
                ]
                if pedaco.usage is not None:
                    writer(
                        events.usage(
                            pedaco.usage.model,
                            input_units=pedaco.usage.input_units,
                            output_units=pedaco.usage.output_units,
                        )
                    )

        conteudo = "".join(texto)
        mensagens = [*state["mensagens"]]

        # Separa as tools confirmaveis das de leitura
        ids_aprovados: set[str] = set(state.get("aprovadas", []))

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
            "aprovadas": ids_aprovados,
            "resposta": state["resposta"] + conteudo,
        }

    async def confirmar(state: EstadoDaConversa) -> dict[str, Any]:
        """Pausa pra confirma o visual de tools CONFIRMABLE.

        Emite evento SSE de tipo `proposta` com os detalhes da opera pendente,
        para o NestJS repassar ao PWA e renderizar o modal de confirma o. A
        aprova fecha a pausa; o recuo cancela, mas o turno continua.

        Para cada tool confirmavel pendente: se ja aprovada (id em `aprovadas`),
        pula; senao, emite proposta e remove da lista pendentes. Apes emitir,
        retorna com pendentes limpos - a ac ao sera executada no no seguinte.
        """
        writer = get_stream_writer()
        ids_aprovados = set(state.get("aprovadas", []))

        pending_confirmable: list[dict[str, str]] = [
            {k: v for k, v in c.items() if isinstance(c, dict) and c.get("name")}
            for c in state["pendentes"]
            if isinstance(c, dict) and c.get("name") not in ids_aprovados
        ]

        if not pending_confirmable:
            return {"pendentes": [], "aprovadas": ids_aprovados, "rodadas": state["rodadas"]}

        # Emite proposta por cada tool confirmavel pendente
        for c in pending_confirmable:
            motivo = (
                f"{c.get('name', '?')} com argumentos: {str(c.get('arguments', '{}')).strip()[:300]}"
            )
            writer(proposta(c["name"], str(c["arguments"]), motivo))

        return {
            "pendentes": [],
            "aprovadas": ids_aprovados,
            "rodadas": state["rodadas"],
        }

    async def agir(state: EstadoDaConversa) -> dict[str, Any]:
        """Executa as tools pedidas, pelo `/mcp`, com o Bearer de quem esta falando."""
        writer = get_stream_writer()
        mensagens = [*state["mensagens"]]

        for chamada in state["pendentes"]:
            nome, identificador = chamada["name"], chamada["id"]
            writer(events.tool_start(identificador, nome, chamada["arguments"]))

            try:
                exigir_permitida(nome, permitidas)
                argumentos = argumentos_do_modelo(chamada["arguments"])
                resultado = await client.call_tool(nome, argumentos)
                texto, deu_certo = resultado.text, not resultado.is_error
            except McpToolRejected as exc:
                # Recuperavel: o modelo pediu errado. Vira resultado de tool com
                # falha para ele ler e se corrigir - derrubar a conversa aqui
                # trocaria "pedi a tool errada" por "o chat caiu".
                texto, deu_certo = exc.message, False

            writer(events.tool_end(identificador, nome, ok=deu_certo, result=texto))
            mensagens.append({"role": "tool", "tool_call_id": identificador, "content": texto})

        return {"mensagens": mensagens, "pendentes": [], "rodadas": state["rodadas"] + 1}

    async def responder(state: EstadoDaConversa) -> dict[str, Any]:
        """Fecha o turno e emite o `done` - o ultimo evento, sempre."""
        writer = get_stream_writer()
        motivo = "step_limit" if state["pendentes"] else "stop"

        if not state["resposta"].strip():
            # Modelo que gasta o teto de rodadas chamando tool e nunca escreve
            # deixaria a tela com um balao vazio, indistinguivel de travamento.
            fallback = (
                "Consultei seus dados, mas nao consegui fechar uma resposta. "
                "Tente perguntar de outro jeito."
            )
            writer(events.token(fallback))

        writer(events.done(motivo))
        return {"motivo": motivo}

    def rota_apos_decidir(state: EstadoDaConversa) -> str:
        """Decide se o modelo deve pedir mais tools ou responder.

        Quando ha pendencias confirmaveis, o grafo pausa no no `confirmar` -
        emite evento SSE de tipo `proposta` pra tela do PWA mostrar o modal de
        confirma o. Sem pendencias, vai direto para ac ao (ou resposta se esgotado).
        """
        if state["pendentes"] and state["rodadas"] < MAX_RODADAS_DE_TOOL:
            return "confirmar"
        if state["rodadas"] >= MAX_RODADAS_DE_TOOL:
            return "responder"
        return "agir"

    grafo = StateGraph(EstadoDaConversa)
    grafo.add_node("receber", receber)
    grafo.add_node("decidir", decidir)
    grafo.add_node("confirmar", confirmar)
    grafo.add_node("agir", agir)
    grafo.add_node("responder", responder)

    # Confirma o -> ac ao (apesar de aprova na tela)
    grafo.add_edge("confirmar", "agir")

    # Decisao: com pendencias confirmaveis, pausa no confirmar;
    # sem pendencias, vai direto pra ac ao ou resposta.
    grafo.add_conditional_edges(
        "decidir",
        rota_apos_decidir,
        {
            "confirmar": "confirmar",
            "agir": "agir",
            "responder": "responder",
        },
    )
    grafo.add_edge("receber", "decidir")
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
    timezone: str | None = None,
) -> AsyncIterator[events.ChatEvent]:
    """Roda o grafo e devolve os eventos do SSE, na ordem em que aconteceram.

    Erro que chega at ai vira **evento**, n ao exce o: quando o primeiro token
    saiu, o 200 ja foi enviado e nao ha mais status para mudar. O `code` e o
    mesmo que o envelope JSON carregaria, para o NestJS traduzir do mesmo jeito
    nos dois caminhos.
    """
    grafo = montar_grafo(provider, client, permitidas, timezone=timezone)
    estado: EstadoDaConversa = {
        "mensagem": mensagem,
        "historico": list(historico),
        "mensagens": [],
        "pendentes": [],
        "aprovadas": set(),
        "rodadas": 0,
        "resposta": "",
        "motivo": "stop",
    }

    try:
        async for emitido in grafo.astream(estado, stream_mode="custom"):
            # O writer so recebe `ChatEvent` (ver os nos): qualquer outra coisa
            # aqui seria um erro de programação, n ao um dado a tolerar.
            if not isinstance(emitido, events.ChatEvent):
                raise TypeError(f"O grafo emitiu {type(emitido).__name__}, n ao um ChatEvent.")
            yield emitido
    # So as duas familias nomeadas. Exce o sem `code` continua subindo: ela e
    # defeito nosso, e transforma-la num evento `error` generico escondia o
    # traceback exatamente onde ele e a unica pista.
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
