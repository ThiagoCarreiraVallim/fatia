"""O grafo LangGraph da conversa: receber → decidir → [confirmar] → agir → responder.

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

## A confirmação de tool CONFIRMABLE não é uma pausa

Tool que escreve só roda depois de a pessoa aprovar na tela (ADR 022), e a
implementação disso **não** é um `interrupt()`: pausar de verdade exige o
checkpointer que o parágrafo acima descarta. São dois turnos HTTP.

    turno 1:  receber → decidir → confirmar → responder
              o modelo pede `log_meal`; o agente emite `proposal` e fecha com
              `reason: "awaiting_confirmation"`. Nada foi gravado.

    turno 2:  receber → agir → decidir → responder
              o PWA manda a proposta aprovada em `approved`; `receber` a
              transforma em pendência e o grafo entra direto em `agir`.

O segundo turno **não passa pelo modelo antes de executar**. Pedir a ele que
chame a tool de novo seria trocar uma garantia por uma probabilidade: ele pode
reformular os argumentos, e o que rodaria deixaria de ser o que a pessoa viu no
modal. Depois de executar, aí sim volta a `decidir` — para o modelo narrar o
resultado, que é o que fecha a conversa.

Um turno pode ter as duas coisas: o modelo que pede `list_meals` e `log_meal` na
mesma rodada tem a leitura executada e a escrita proposta. Ver `confirmar`.
"""

import logging
from collections.abc import AsyncIterator, Sequence
from typing import Any, TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from ..prompts.chat_pt_br import sistema_com_data
from ..providers.base import TextDelta, ToolChatCapability, TurnEnd
from ..providers.errors import AIProviderError
from . import events
from .errors import McpError, McpToolArgumentsInvalid, McpToolRejected
from .mcp_client import McpClient, McpToolInfo
from .tool_policy import (
    argumentos_do_modelo,
    camada_confirmavel,
    exigir_aprovada,
    exigir_permitida,
    formato_openai,
)

# Handler é do uvicorn: o agente não configura logging, e por isso o que sai aqui
# cai no mesmo lugar que o resto (`.agent-dev.log` em dev). **Nada de Bearer nem
# de conteúdo de conversa passa por aqui** — só `code` e a mensagem do erro, que
# `errors.py` já escreve para ser lida por quem opera. O
# `tests/chat/test_sem_vazamento.py` varre a saída de log junto do resto.
logger = logging.getLogger(__name__)

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


# Argumentos de uma proposta aprovada, em caracteres. Recusa, e não corte: estes
# argumentos vão **executar**, e JSON cortado ao meio ou falha na tool ou grava o
# pedaço que sobrou. Folgado para qualquer chamada real — uma refeição de 30 itens
# não passa de uns 2 kB — e serve como teto contra um cliente que devolva lixo.
MAX_ARGUMENTOS_APROVADOS = 8_000


class EstadoDaConversa(TypedDict):
    """O estado do grafo. **Nenhum campo de credencial** — ver o docstring.

    `pendentes` são as tools que o modelo pediu e que ainda não rodaram, no turno
    de agora. `propostas` são as confirmáveis que foram oferecidas à pessoa e
    **não** rodaram — elas existem no estado só para `responder` saber que o
    turno fecha em `awaiting_confirmation` e não em `stop`.

    `aprovadas` é o que veio do PWA neste turno: as propostas que a pessoa
    aprovou na tela, cada uma com nome e os argumentos exatos que ela viu. Não é
    memória do agente — o agente não tem memória entre turnos (ver o docstring
    do módulo); é entrada da requisição, como `mensagem` e `historico`.
    """

    mensagem: str
    historico: list[dict[str, str]]
    mensagens: list[dict[str, Any]]
    pendentes: list[dict[str, str]]
    propostas: list[dict[str, str]]
    aprovadas: list[dict[str, str]]
    rodadas: int
    resposta: str
    motivo: str


GrafoDaConversa = CompiledStateGraph[EstadoDaConversa, None, EstadoDaConversa, EstadoDaConversa]


def _cortado(conteudo: str) -> str:
    """Uma mensagem do histórico no tamanho que entra no prompt."""
    if len(conteudo) <= MAX_CARACTERES_POR_MENSAGEM:
        return conteudo
    return conteudo[:MAX_CARACTERES_POR_MENSAGEM] + AVISO_DE_CORTE


def _exigir_argumentos_no_teto(nome: str, argumentos: str) -> None:
    """Recusa argumentos acima de `MAX_ARGUMENTOS_APROVADOS`, sem cortar.

    Família `McpToolRejected` e não exceção de servidor: vira resultado de tool
    com falha, o modelo lê e pode tentar de novo menor. Ver o `except` em `agir`.
    """
    if len(argumentos) <= MAX_ARGUMENTOS_APROVADOS:
        return
    raise McpToolArgumentsInvalid(
        f"Os argumentos de '{nome}' têm {len(argumentos)} caracteres, acima do teto de "
        f"{MAX_ARGUMENTOS_APROVADOS}. Divida em chamadas menores."
    )


def montar_grafo(
    provider: ToolChatCapability,
    client: McpClient,
    permitidas: Sequence[McpToolInfo],
    *,
    timezone: str | None = None,
) -> GrafoDaConversa:
    """Compila o grafo desta conversa, com provedor e cliente presos por fecho.

    Um grafo por conversa, e não um global: é o que mantém o Bearer fora do
    estado. Compilar um `StateGraph` de quatro nós é montar quatro dicionários —
    irrelevante diante de uma chamada de LLM.

    `timezone` é o fuso de quem está conversando, que o `apps/api` já conhece do
    perfil. Ele entra no prompt como a data de hoje — sem isso o modelo não tem
    como resolver "ontem" numa chamada de tool, e chuta uma data.
    """
    catalogo_openai = formato_openai(permitidas)
    confirmaveis = camada_confirmavel(permitidas)
    nomes_confirmaveis = {tool.name for tool in confirmaveis}

    async def receber(state: EstadoDaConversa) -> dict[str, Any]:
        """Monta o prompt: sistema + histórico recortado + a mensagem de agora.

        O recorte do histórico **corta**, e não recusa — nas duas dimensões, a
        quantidade de mensagens e o tamanho de cada uma. Ver
        `MAX_CARACTERES_POR_MENSAGEM`.

        Quando o turno traz proposta aprovada, ela vira pendência aqui e o grafo
        vai direto para `agir` — ver `rota_apos_receber`. A mensagem sintética de
        `assistant` com `tool_calls` existe porque o formato da OpenAI exige que
        todo `role: "tool"` responda a uma chamada declarada antes; sem ela, a
        volta a `decidir` mandaria um histórico que o endpoint recusa.
        """
        historico = state["historico"][-MAX_HISTORICO:]
        mensagens: list[dict[str, Any]] = [
            {"role": "system", "content": sistema_com_data(timezone)}
        ]
        mensagens.extend({"role": m["role"], "content": _cortado(m["content"])} for m in historico)
        mensagens.append({"role": "user", "content": state["mensagem"]})

        # Id nosso, e não o do turno anterior: o id de tool call vale dentro de um
        # turno do modelo, e o daquele turno já morreu. O que amarra a aprovação à
        # proposta é nome + argumentos, não o id — ver `exigir_aprovada`.
        aprovadas = [
            {"id": f"aprovada-{indice}", "name": item["name"], "arguments": item["arguments"]}
            for indice, item in enumerate(state.get("aprovadas") or [])
        ]
        if aprovadas:
            mensagens.append(
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": chamada["id"],
                            "type": "function",
                            "function": {
                                "name": chamada["name"],
                                "arguments": chamada["arguments"],
                            },
                        }
                        for chamada in aprovadas
                    ],
                }
            )

        return {
            "mensagens": mensagens,
            "rodadas": 0,
            "resposta": "",
            "pendentes": aprovadas,
            "propostas": [],
        }

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
                if pedaco.usage is not None:
                    # Um por rodada, e não um por turno: o grafo chama o modelo
                    # de novo a cada volta do ciclo de tool, e cada volta custa.
                    # O `apps/api` soma por modelo — ver `chat.service.ts`.
                    writer(
                        events.usage(
                            pedaco.usage.model,
                            input_units=pedaco.usage.input_units,
                            output_units=pedaco.usage.output_units,
                        )
                    )

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

    async def confirmar(state: EstadoDaConversa) -> dict[str, Any]:
        """Separa o que roda agora do que precisa de aprovação na tela.

        Uma rodada pode ter as duas coisas — "o que eu comi hoje? e registra mais
        um ovo" faz o modelo pedir `list_meals` e `add_meal_item` juntos. A
        leitura segue para `agir` na mesma rodada; a escrita sai como `proposal` e
        fica para o turno seguinte. Bloquear a leitura junto faria a pessoa
        esperar uma confirmação para ver o que ela só perguntou.

        A confirmável que **já** veio aprovada não passa por aqui: ela entrou como
        pendência em `receber` e o grafo nem visita este nó. Aqui só chega o que o
        modelo pediu neste turno.
        """
        writer = get_stream_writer()
        executar: list[dict[str, str]] = []
        propostas: list[dict[str, str]] = []

        for chamada in state["pendentes"]:
            if chamada["name"] in nomes_confirmaveis:
                propostas.append(chamada)
            else:
                executar.append(chamada)

        for chamada in propostas:
            writer(events.proposal(chamada["id"], chamada["name"], chamada["arguments"]))

        return {"pendentes": executar, "propostas": propostas}

    async def agir(state: EstadoDaConversa) -> dict[str, Any]:
        """Executa as tools pedidas, pelo `/mcp`, com o Bearer de quem está falando."""
        writer = get_stream_writer()
        mensagens = [*state["mensagens"]]
        aprovadas = [(item["name"], item["arguments"]) for item in (state.get("aprovadas") or [])]

        for chamada in state["pendentes"]:
            nome, identificador = chamada["name"], chamada["id"]
            writer(events.tool_start(identificador, nome, chamada["arguments"]))

            try:
                exigir_permitida(nome, permitidas)
                exigir_aprovada(nome, chamada["arguments"], confirmaveis, aprovadas)
                _exigir_argumentos_no_teto(nome, chamada["arguments"])
                argumentos = argumentos_do_modelo(chamada["arguments"])
                resultado = await client.call_tool(nome, argumentos)
                texto, deu_certo = resultado.text, not resultado.is_error
            except McpToolRejected as exc:
                # Recuperável: o modelo pediu errado. Vira resultado de tool com
                # falha para ele ler e se corrigir — derrubar a conversa aqui
                # trocaria "pedi a tool errada" por "o chat caiu".
                texto, deu_certo = exc.message, False

            writer(events.tool_end(identificador, nome, ok=deu_certo, result=texto))
            mensagens.append({"role": "tool", "tool_call_id": identificador, "content": texto})

        return {"mensagens": mensagens, "pendentes": [], "rodadas": state["rodadas"] + 1}

    async def responder(state: EstadoDaConversa) -> dict[str, Any]:
        """Fecha o turno e emite o `done` — o último evento, sempre."""
        writer = get_stream_writer()
        propostas = state.get("propostas") or []

        if propostas:
            motivo = "awaiting_confirmation"
        elif state["pendentes"]:
            motivo = "step_limit"
        else:
            motivo = "stop"

        # Sem fallback quando há proposta na mesa: o retorno da tela é o modal, e
        # um "não consegui fechar uma resposta" ao lado dele diria que falhou algo
        # que está exatamente onde deveria estar. O texto que o modelo escreveu
        # antes de pedir a tool, se escreveu, já saiu em `token`.
        if not state["resposta"].strip() and not propostas:
            # Modelo que gasta o teto de rodadas chamando tool e nunca escreve
            # deixaria a tela com um balão vazio, indistinguível de travamento.
            fallback = (
                "Consultei seus dados, mas não consegui fechar uma resposta. "
                "Tente perguntar de outro jeito."
            )
            writer(events.token(fallback))

        writer(events.done(motivo))
        return {"motivo": motivo}

    def rota_apos_receber(state: EstadoDaConversa) -> str:
        """Proposta aprovada executa antes de o modelo falar. Ver o docstring."""
        return "agir" if state["pendentes"] else "decidir"

    def rota_apos_decidir(state: EstadoDaConversa) -> str:
        if state["pendentes"] and state["rodadas"] < MAX_RODADAS_DE_TOOL:
            return "confirmar"
        return "responder"

    def rota_apos_confirmar(state: EstadoDaConversa) -> str:
        """Sem leitura para executar, o turno fecha — a bola está com a pessoa."""
        return "agir" if state["pendentes"] else "responder"

    grafo = StateGraph(EstadoDaConversa)
    grafo.add_node("receber", receber)
    grafo.add_node("decidir", decidir)
    grafo.add_node("confirmar", confirmar)
    grafo.add_node("agir", agir)
    grafo.add_node("responder", responder)

    grafo.add_edge(START, "receber")
    grafo.add_conditional_edges(
        "receber", rota_apos_receber, {"agir": "agir", "decidir": "decidir"}
    )
    grafo.add_conditional_edges(
        "decidir", rota_apos_decidir, {"confirmar": "confirmar", "responder": "responder"}
    )
    grafo.add_conditional_edges(
        "confirmar", rota_apos_confirmar, {"agir": "agir", "responder": "responder"}
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
    timezone: str | None = None,
    aprovadas: Sequence[dict[str, str]] = (),
) -> AsyncIterator[events.ChatEvent]:
    """Roda o grafo e devolve os eventos do SSE, na ordem em que aconteceram.

    Erro que chega até aqui vira **evento**, não exceção: quando o primeiro token
    saiu, o 200 já foi enviado e não há mais status para mudar. O `code` é o
    mesmo que o envelope JSON carregaria, para o NestJS traduzir do mesmo jeito
    nos dois caminhos.

    `aprovadas` são as propostas que a pessoa aprovou na tela, cada uma com
    `name` e `arguments` como o `proposal` os mandou. Vazio no caso comum — ver o
    handshake no docstring do módulo.
    """
    grafo = montar_grafo(provider, client, permitidas, timezone=timezone)
    estado: EstadoDaConversa = {
        "mensagem": mensagem,
        "historico": list(historico),
        "mensagens": [],
        "pendentes": [],
        "propostas": [],
        "aprovadas": list(aprovadas),
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
        # **Logado, e não só emitido.** O evento leva o `code` até a tela, mas a
        # `message` é para quem lê o log — e sem esta linha ela não chegava a log
        # nenhum: o turno respondia 200, o erro viajava dentro do SSE, e
        # `.agent-dev.log` mostrava só o 200. "Olhe os logs" não tinha o que
        # mostrar justamente no caso em que ele é a única pista.
        #
        # `warning` e não `error`: quase tudo aqui é o provedor ou o `/mcp`
        # respondendo mal, não defeito nosso. Defeito nosso é exceção sem `code`,
        # que este `except` de propósito não pega — ela sobe com traceback.
        logger.warning("Turno de chat terminou em %s: %s", exc.code, exc.message)
        yield events.error(exc.code, exc.message)
        yield events.done("error")


__all__ = [
    "AVISO_DE_CORTE",
    "MAX_ARGUMENTOS_APROVADOS",
    "MAX_CARACTERES_POR_MENSAGEM",
    "MAX_HISTORICO",
    "MAX_RODADAS_DE_TOOL",
    "MAX_TOOLS_POR_RODADA",
    "EstadoDaConversa",
    "montar_grafo",
    "stream_chat_events",
]
