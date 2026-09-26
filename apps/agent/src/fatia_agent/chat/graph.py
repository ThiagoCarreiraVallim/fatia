"""O grafo da conversa, com estado no checkpointer (ADR 023).

    START → hidratar → [planejar] → agente ⇄ ferramentas ⇄ portao
                                agente ├─ tool falhou ──→ refletir → agente
                                       ├─ passou do teto → orcamento → agente | ferramentas
                                       ├─ sem tool ─────→ validar → agente | fechar → END
                                       └─ volta de fechamento ──→ fechar

- **hidratar**: zera o que é do turno e, numa thread fria, semeia a conversa com
  o histórico que o `apps/api` tem gravado.
- **planejar**: só com `AGENT_CHAT_PLANNER` — divide o pedido em passos (`plan`).
- **agente**: o modelo, em streaming — ou responde, ou pede tools. Com foto no
  turno, vai ao modelo de visão (`FotoDoTurno`).
- **ferramentas**: executa pelo `/mcp`, com o Bearer de quem está falando, o que
  pode rodar agora: toda READ_ONLY e toda CONFIRMABLE que a pessoa **já**
  decidiu. A CONFIRMABLE sem decisão fica sem resultado, e é isso que leva ao
  portão.
- **portao**: junta numa pausa só as escritas à espera de aprovação e as
  perguntas de `ask_user`.
- **orcamento**: passou do teto de voltas de tool — pausa perguntando se segue
  (`continue`). Com o `portao`, são os dois únicos nós que interrompem, e nenhum
  dos dois tem efeito colateral antes do `interrupt()`.
- **refletir** / **validar**: a segunda chance sem chamada extra ao modelo — ver
  `qualidade.py`.
- **fechar**: garante que o turno termina com texto na tela.

## Por que LangGraph aqui

O chat **volta**: o modelo pede tool, a tool responde, o modelo decide de novo.
É ciclo com condição de parada, que é o que um `StateGraph` descreve melhor que
um `while` com quatro flags. E agora ele também **pausa** — o que só existe com
checkpointer.

## O que não entra no estado

O Bearer. Ele vive dentro do `McpClient`, que os nós alcançam pelo runtime
context (`ContextoDoTurno`), e o context não é serializado pelo checkpointer.
Ver `state.py` e a ADR 023.

## Por que o portão é um nó separado das ferramentas

O LangGraph **reexecuta** o nó interrompido quando a pausa é retomada. Se a
interrupção acontecesse dentro de `ferramentas`, a retomada rodaria de novo toda
tool daquele lote — com um `log_meal` no meio, a refeição seria gravada duas
vezes. O portão só lê o estado, então reexecutá-lo não custa nada.

## A confirmação executa o que está no checkpoint

Tool CONFIRMABLE (ADR 022) não roda na volta em que o modelo a pede. Ela fica sem
resultado, o portão mostra à pessoa exatamente aquela chamada, e a retomada traz
só "sim" ou "não" por `tool_call_id`. O que executa depois é o `tool_call`
guardado — o cliente nunca mais carrega argumento de escrita. A leitura pedida na
mesma volta roda antes da pausa: bloqueá-la faria a pessoa aprovar algo para ver
o que só perguntou.
"""

import json
import logging
import uuid
from collections.abc import AsyncIterator, Sequence
from typing import Any

from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    AnyMessage,
    BaseMessage,
    HumanMessage,
    RemoveMessage,
    ToolMessage,
)
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from langgraph.graph.state import CompiledStateGraph
from langgraph.runtime import Runtime
from langgraph.types import Command, interrupt

from ..prompts.chat_pt_br import cercar, sistema_do_turno
from ..providers.base import TextDelta, TurnEnd
from ..providers.errors import AIProviderError
from . import events, human
from .artefatos import artefato
from .errors import McpError, McpToolArgumentsInvalid, McpToolRejected
from .planejador import com_status, planejar
from .qualidade import (
    MAX_REFLEXOES,
    MAX_REVALIDACOES,
    afirmativo,
    reflexao_da_falha,
    reflexao_da_validacao,
    resumo_do_trabalho,
    tool_em_falha,
    validar_resposta,
)
from .state import ContextoDoTurno, EstadoDaConversa, FotoDoTurno, estado_vazio
from .tool_policy import (
    argumentos_do_modelo,
    camada_confirmavel,
    exigir_permitida,
    formato_openai,
)

# Handler é do uvicorn. **Nada de Bearer nem de conteúdo de conversa passa por
# aqui** — só `code` e a mensagem do erro, que `errors.py` escreve para quem
# opera. O `tests/chat/test_sem_vazamento.py` varre a saída de log.
logger = logging.getLogger(__name__)

# Voltas do modelo que pedem tool, por mensagem da pessoa. Quatro cobre
# "consulta, refina, consulta de novo, responde"; acima disso é laço.
MAX_RODADAS_DE_TOOL = 4

# Tools por volta. Com o teto acima, no máximo 20 chamadas ao `/mcp` por
# mensagem — dentro do limite de 60/min por usuário do `mcp-throttler.guard.ts`,
# que é **do usuário**: um agente em laço gastaria a cota do Claude dele.
MAX_TOOLS_POR_RODADA = 5

# Mensagens do estado que entram no prompt. O checkpoint guarda a conversa
# inteira; o teto é para que uma conversa longa não vire um prompt de megabytes
# contra o gateway pago.
MAX_HISTORICO = 40

# Caracteres por fala de turnos anteriores, no prompt. **Corte**, e não recusa:
# o que está no histórico inclui a resposta do modelo, cujo tamanho ninguém
# controla, e recusar mataria a conversa por algo que ninguém pode consertar. A
# mensagem que a pessoa acabou de escrever é recusada acima disto em `api.py`.
MAX_CARACTERES_POR_MENSAGEM = 4_000

AVISO_DE_CORTE = "… (mensagem cortada por tamanho)"

# Argumentos de uma escrita, em caracteres. Recusa, e não corte: estes
# argumentos **executam**, e JSON cortado ao meio ou falha ou grava o pedaço.
MAX_ARGUMENTOS_APROVADOS = 8_000

RECUSADA = "A pessoa recusou esta alteração na tela. Nada foi gravado."

NAO_EXECUTADA = "Não executada: a conversa seguiu antes de esta chamada rodar."

SEM_RESPOSTA = (
    "Consultei seus dados, mas não consegui fechar uma resposta. Tente perguntar de outro jeito."
)

LIMITE_DE_PASSOS = (
    "Precisei de mais passos do que consigo dar numa mensagem só. "
    "Me diga por onde quer começar, ou divida o pedido em partes menores."
)

GrafoDaConversa = CompiledStateGraph[EstadoDaConversa, ContextoDoTurno, Any, Any]


def _cortado(conteudo: str) -> str:
    if len(conteudo) <= MAX_CARACTERES_POR_MENSAGEM:
        return conteudo
    return conteudo[:MAX_CARACTERES_POR_MENSAGEM] + AVISO_DE_CORTE


def _texto(mensagem: BaseMessage) -> str:
    conteudo = mensagem.content
    if isinstance(conteudo, str):
        return conteudo
    return "".join(
        str(bloco.get("text") or "") if isinstance(bloco, dict) else str(bloco)
        for bloco in conteudo
    )


def _ultima_do_assistente(mensagens: Sequence[AnyMessage]) -> tuple[int, AIMessage] | None:
    for indice in range(len(mensagens) - 1, -1, -1):
        mensagem = mensagens[indice]
        if isinstance(mensagem, AIMessage):
            return indice, mensagem
    return None


def _chamadas(mensagem: AIMessage) -> list[dict[str, Any]]:
    """As chamadas da mensagem — as válidas e as de JSON torto — na ordem pedida.

    As inválidas ficam em `invalid_tool_calls`, com `args` em texto. Elas também
    precisam de resultado: são chamadas que o modelo fez, e o provedor recusa uma
    conversa com chamada sem resposta.
    """
    validas = [
        {"id": c["id"], "name": c["name"], "args": c["args"], "erro": None}
        for c in mensagem.tool_calls
        if c.get("id")
    ]
    invalidas = [
        {
            "id": c["id"],
            "name": c.get("name") or "",
            "args": c.get("args") or "",
            "erro": c.get("error") or "Argumentos inválidos.",
        }
        for c in mensagem.invalid_tool_calls
        if c.get("id")
    ]
    return [*validas, *invalidas]


def _respondidas(mensagens: Sequence[AnyMessage], desde: int) -> dict[str, ToolMessage]:
    return {
        m.tool_call_id: m
        for m in mensagens[desde + 1 :]
        if isinstance(m, ToolMessage) and m.tool_call_id
    }


def _janela(mensagens: Sequence[AnyMessage]) -> list[AnyMessage]:
    """As últimas `MAX_HISTORICO` mensagens, começando numa fala da pessoa.

    Cortar no meio de um ciclo de tool deixaria um `role: "tool"` sem a chamada
    que ele responde, e o provedor recusa o histórico inteiro com 400.
    """
    if len(mensagens) <= MAX_HISTORICO:
        return list(mensagens)
    inicio = len(mensagens) - MAX_HISTORICO
    for indice in range(inicio, len(mensagens)):
        if isinstance(mensagens[indice], HumanMessage):
            return list(mensagens[indice:])
    return list(mensagens[inicio:])


MARCA_DE_FOTO = "[📷 {n} foto(s) enviada(s) com esta mensagem — a imagem não fica guardada]"


def _com_fotos(
    conversa: Sequence[dict[str, Any]], fotos: Sequence[FotoDoTurno]
) -> list[dict[str, Any]]:
    """A última fala da pessoa com as fotos do turno, só na ida ao modelo.

    É aqui, e não no estado, que a foto entra: o que o grafo grava no checkpoint
    é a mensagem com a `MARCA_DE_FOTO`, e os bytes nunca passam pelo reducer.
    """
    saida = list(conversa)
    if not fotos:
        return saida
    for indice in range(len(saida) - 1, -1, -1):
        if saida[indice]["role"] == "user":
            saida[indice] = {
                "role": "user",
                "content": [
                    {"type": "text", "text": saida[indice]["content"]},
                    *({"type": "image_url", "image_url": {"url": f.data_uri()}} for f in fotos),
                ],
            }
            break
    return saida


def _para_o_provedor(mensagens: Sequence[AnyMessage]) -> list[dict[str, Any]]:
    """O estado no formato de mensagens da OpenAI, com as chamadas órfãs reparadas.

    🔴 Todo provedor OpenAI-compatível recusa com 400 um `assistant` com
    `tool_calls` sem o `tool` correspondente. Isso nasce em caminho legítimo: a
    pessoa escreveu outra coisa em vez de responder à pausa, ou o turno parou no
    limite de passos. Sem reparo, a conversa ficaria quebrada para sempre. O
    reparo é só na ida ao modelo — o estado guarda o que aconteceu de verdade.
    """
    saida: list[dict[str, Any]] = []
    faltando: list[dict[str, Any]] = []
    for mensagem in _janela(mensagens):
        if faltando and not isinstance(mensagem, ToolMessage):
            saida.extend(faltando)
            faltando = []

        if isinstance(mensagem, HumanMessage):
            saida.append({"role": "user", "content": _cortado(_texto(mensagem))})
        elif isinstance(mensagem, AIMessage):
            chamadas = _chamadas(mensagem)
            item: dict[str, Any] = {"role": "assistant", "content": _cortado(_texto(mensagem))}
            if chamadas:
                item["tool_calls"] = [
                    {
                        "id": chamada["id"],
                        "type": "function",
                        "function": {
                            "name": chamada["name"],
                            "arguments": chamada["args"]
                            if isinstance(chamada["args"], str)
                            else json.dumps(chamada["args"], ensure_ascii=False),
                        },
                    }
                    for chamada in chamadas
                ]
                faltando = [
                    {"role": "tool", "tool_call_id": chamada["id"], "content": NAO_EXECUTADA}
                    for chamada in chamadas
                ]
            saida.append(item)
        elif isinstance(mensagem, ToolMessage):
            faltando = [f for f in faltando if f["tool_call_id"] != mensagem.tool_call_id]
            conteudo = _texto(mensagem)
            saida.append(
                {
                    "role": "tool",
                    "tool_call_id": mensagem.tool_call_id,
                    # A resposta da pessoa a `ask_user` vai crua: é ela falando,
                    # e não conteúdo de terceiro.
                    "content": conteudo
                    if mensagem.name == human.NOME
                    else cercar(f"RESULTADO DE {mensagem.name or 'FERRAMENTA'}", conteudo),
                }
            )
    saida.extend(faltando)
    return saida


def _exigir_argumentos_no_teto(nome: str, argumentos: dict[str, Any]) -> None:
    tamanho = len(json.dumps(argumentos, ensure_ascii=False))
    if tamanho <= MAX_ARGUMENTOS_APROVADOS:
        return
    raise McpToolArgumentsInvalid(
        f"Os argumentos de '{nome}' têm {tamanho} caracteres, acima do teto de "
        f"{MAX_ARGUMENTOS_APROVADOS}. Divida em chamadas menores."
    )


def _pergunta_pendente(mensagem: AnyMessage) -> dict[str, Any] | None:
    """A pergunta que um resultado sentinela de `ask_user` carrega, se carrega."""
    if not isinstance(mensagem, ToolMessage):
        return None
    artefato = mensagem.artifact
    pergunta = artefato.get("ask") if isinstance(artefato, dict) else None
    return pergunta if isinstance(pergunta, dict) else None


def _aprovou(resposta: object, tool_call_id: str) -> bool:
    """A decisão da pessoa sobre uma escrita.

    **O default é não.** Gravar precisa de um sim explícito, e não da ausência
    de um não: uma retomada malformada, um campo que faltou, um texto
    inesperado — tudo isso recusa.
    """
    if isinstance(resposta, dict):
        aprovacoes = resposta.get("approvals")
        if isinstance(aprovacoes, dict):
            return aprovacoes.get(tool_call_id) is True
        return resposta.get("approved") is True
    return resposta is True


def _resposta_da_pergunta(resposta: object, tool_call_id: str) -> object:
    if isinstance(resposta, dict):
        respostas = resposta.get("answers")
        if isinstance(respostas, dict) and tool_call_id in respostas:
            return respostas[tool_call_id]
    return resposta


def _do_turno(mensagens: Sequence[AnyMessage]) -> list[AnyMessage]:
    """As mensagens desde a última fala da pessoa."""
    for indice in range(len(mensagens) - 1, -1, -1):
        if isinstance(mensagens[indice], HumanMessage):
            return list(mensagens[indice + 1 :])
    return list(mensagens)


def _tokens(texto: str) -> int:
    """Estimativa, e o evento diz isso: ~4 caracteres por token em português.

    A pergunta que o evento responde é de proporção ("o que ocupa a janela"), não
    de precisão; a conta que cobra vem do `usage` do provedor.
    """
    return (len(texto) + 3) // 4 if texto else 0


def _composicao_do_contexto(
    sistema: str,
    contexto: ContextoDoTurno,
    conversa: Sequence[dict[str, Any]],
    catalogo: Sequence[dict[str, Any]],
) -> events.ChatEvent:
    memoria = "\n".join(m["content"] for m in contexto.memorias)
    historico = "".join(str(m.get("content") or "") for m in conversa)
    segmentos: list[dict[str, Any]] = [
        {"key": "system", "tokens": _tokens(sistema) - _tokens(memoria)},
        {"key": "memory", "tokens": _tokens(memoria)},
        {"key": "history", "tokens": _tokens(historico)},
        {"key": "tools", "tokens": _tokens(json.dumps(list(catalogo), ensure_ascii=False))},
    ]
    return events.context([seg for seg in segmentos if seg["tokens"] > 0])


def montar_grafo(checkpointer: BaseCheckpointSaver[str] | None) -> GrafoDaConversa:
    """Compila o grafo. Uma vez por processo — o que varia por turno vem no context."""

    async def hidratar(
        state: EstadoDaConversa, runtime: Runtime[ContextoDoTurno]
    ) -> dict[str, Any]:
        """Começo de um turno novo. A retomada de uma pausa não passa por aqui.

        Numa thread fria, a conversa gravada pelo `apps/api` entra **antes** da
        mensagem de agora. O `RemoveMessage(REMOVE_ALL_MESSAGES)` é o que faz a
        ordem sair certa: o `add_messages` acrescenta id novo no fim, e sem a
        remoção o histórico viria depois da pergunta que acabou de chegar.
        """
        atualizacao: dict[str, Any] = estado_vazio()
        if state.get("hidratada"):
            return atualizacao

        atualizacao["hidratada"] = True
        atuais = state.get("messages") or []
        historico = runtime.context.historico
        if historico and len(atuais) <= 1:
            semente: list[AnyMessage] = [
                HumanMessage(content=fala["content"], id=f"hist-{indice}")
                if fala["role"] == "user"
                else AIMessage(content=fala["content"], id=f"hist-{indice}")
                for indice, fala in enumerate(historico)
            ]
            atualizacao["messages"] = [RemoveMessage(id=REMOVE_ALL_MESSAGES), *semente, *atuais]
        return atualizacao

    async def agente(state: EstadoDaConversa, runtime: Runtime[ContextoDoTurno]) -> dict[str, Any]:
        """Chama o modelo em streaming. Cada token sai na hora, pelo `writer`."""
        contexto = runtime.context
        writer = get_stream_writer()
        encerrar = bool(state.get("encerrar"))
        catalogo = [] if encerrar else [*formato_openai(contexto.permitidas), human.DEFINICAO]
        plano = state.get("plano") or []
        sistema = sistema_do_turno(
            contexto.timezone,
            memorias=contexto.memorias,
            plano=plano,
            reflexoes=state.get("reflexoes") or [],
            encerrar=encerrar,
        )
        conversa = _para_o_provedor(state.get("messages") or [])
        prompt = [{"role": "system", "content": sistema}, *_com_fotos(conversa, contexto.fotos)]
        atualizacao: dict[str, Any] = {}

        if not state.get("contexto_informado"):
            writer(_composicao_do_contexto(sistema, contexto, conversa, catalogo))
            atualizacao["contexto_informado"] = True

        # O passo que o modelo está prestes a atacar entra em andamento ANTES da
        # chamada, que é a parte demorada. Marcar só depois deixaria o plano
        # parado em "pendente" exatamente durante a espera.
        iniciando = next((p for p in plano if p["status"] == "pending"), None)
        if iniciando is not None and not any(p["status"] == "running" for p in plano):
            plano = com_status(plano, iniciando["id"], "running")
            atualizacao["plano"] = plano
            writer(events.plan(plano))

        identificador = f"ai-{uuid.uuid4().hex}"
        texto: list[str] = []
        fim: TurnEnd | None = None
        async for pedaco in contexto.provider.stream_chat(
            prompt, tools=catalogo, capacidade="vision" if contexto.fotos else "text"
        ):
            if isinstance(pedaco, TextDelta):
                texto.append(pedaco.text)
                writer(
                    events.Fragmento(
                        AIMessageChunk(content=pedaco.text, id=identificador), "agente"
                    )
                )
            elif isinstance(pedaco, TurnEnd):
                fim = pedaco
                if pedaco.usage is not None:
                    writer(
                        events.usage(
                            pedaco.usage.model,
                            input_units=pedaco.usage.input_units,
                            output_units=pedaco.usage.output_units,
                        )
                    )

        validas: list[dict[str, Any]] = []
        invalidas: list[dict[str, Any]] = []
        for chamada in (fim.tool_calls if fim is not None else ())[:MAX_TOOLS_POR_RODADA]:
            try:
                validas.append(
                    {
                        "id": chamada.id,
                        "name": chamada.name,
                        "args": argumentos_do_modelo(chamada.arguments),
                        "type": "tool_call",
                    }
                )
            except McpToolArgumentsInvalid as exc:
                invalidas.append(
                    {
                        "id": chamada.id,
                        "name": chamada.name,
                        "args": chamada.arguments,
                        "error": exc.message,
                        "type": "invalid_tool_call",
                    }
                )

        resposta = AIMessage(
            content="".join(texto),
            id=identificador,
            tool_calls=validas,
            invalid_tool_calls=invalidas,
        )
        atualizacao["messages"] = [resposta]
        if validas or invalidas:
            atualizacao["rodadas"] = (state.get("rodadas") or 0) + 1
        return atualizacao

    async def ferramentas(
        state: EstadoDaConversa, runtime: Runtime[ContextoDoTurno]
    ) -> dict[str, Any]:
        """Executa o que pode rodar agora. Nada aqui interrompe — ver o docstring."""
        contexto = runtime.context
        mensagens = state.get("messages") or []
        encontrada = _ultima_do_assistente(mensagens)
        if encontrada is None:
            return {}
        indice, pedido = encontrada
        respondidas = _respondidas(mensagens, indice)
        confirmaveis = {tool.name for tool in camada_confirmavel(contexto.permitidas)}
        decisoes = state.get("decisoes") or {}
        novas: list[ToolMessage] = []

        for chamada in _chamadas(pedido):
            identificador, nome = chamada["id"], chamada["name"]
            if identificador in respondidas:
                continue

            def resultado(
                conteudo: str,
                *,
                erro: bool = False,
                artefato: dict[str, Any] | None = None,
                identificador: str = identificador,
                nome: str = nome,
            ) -> ToolMessage:
                return ToolMessage(
                    content=conteudo,
                    tool_call_id=identificador,
                    name=nome,
                    id=f"tool-{identificador}",
                    status="error" if erro else "success",
                    artifact=artefato,
                )

            if chamada["erro"] is not None:
                novas.append(resultado(str(chamada["erro"]), erro=True))
                continue

            if nome == human.NOME:
                pergunta = human.pergunta_dos_argumentos(chamada["args"])
                novas.append(resultado(human.sentinela(pergunta), artefato={"ask": pergunta}))
                continue

            if nome in confirmaveis:
                decisao = decisoes.get(identificador)
                if decisao is None:
                    continue
                if decisao is False:
                    novas.append(resultado(RECUSADA, erro=True))
                    continue

            try:
                exigir_permitida(nome, contexto.permitidas)
                if nome in confirmaveis:
                    _exigir_argumentos_no_teto(nome, chamada["args"])
                saida = await contexto.client.call_tool(nome, chamada["args"])
                novas.append(
                    resultado(
                        saida.text,
                        erro=saida.is_error,
                        artefato={"structured": saida.structured} if saida.structured else None,
                    )
                )
            except McpToolRejected as exc:
                # Recuperável: o modelo pediu errado. Vira resultado com falha
                # para ele ler e se corrigir — derrubar a conversa trocaria "pedi
                # a tool errada" por "o chat caiu".
                novas.append(resultado(exc.message, erro=True))

        if not novas:
            return {}

        writer = get_stream_writer()
        falhas = dict(state.get("falhas") or {})
        for mensagem in novas:
            nome = mensagem.name or ""
            # A recusa da pessoa não é falha da tool: não pode empurrar o modelo
            # para "tente de outro jeito" algo que ela acabou de dizer que não quer.
            if mensagem.status == "error" and mensagem.content != RECUSADA:
                falhas[nome] = falhas.get(nome, 0) + 1
            else:
                falhas.pop(nome, None)
            bruto = mensagem.artifact
            normalizado = artefato(bruto.get("structured") if isinstance(bruto, dict) else None)
            if normalizado is not None:
                writer(events.artifact(mensagem.tool_call_id, normalizado))

        atualizacao: dict[str, Any] = {"messages": novas, "falhas": falhas}
        # Um passo do plano fecha quando a primeira tool dele responde. É
        # grosseiro, e é o que faz o plano virar progresso sem pedir ao modelo
        # que gerencie status.
        plano = state.get("plano") or []
        andamento = next((p for p in plano if p["status"] == "running"), None)
        if andamento is not None:
            plano = com_status(plano, andamento["id"], "done")
            atualizacao["plano"] = plano
            writer(events.plan(plano))
        return atualizacao

    async def portao(state: EstadoDaConversa, runtime: Runtime[ContextoDoTurno]) -> dict[str, Any]:
        """Para e fala com a pessoa. O ÚNICO nó que interrompe.

        ⚠️ Um `interrupt()` só, carregando a lista inteira de `actions`. Um por
        item faria a tela ver só o primeiro, e os outros ficariam sem decisão.
        """
        contexto = runtime.context
        itens = _paradas(state, contexto)
        if not itens:
            return {}

        resposta = interrupt(
            {"kind": itens[0]["kind"], "prompt": itens[0]["prompt"], "actions": itens}
        )

        decisoes = dict(state.get("decisoes") or {})
        reescritas: list[ToolMessage] = []
        for item in itens:
            if item["kind"] == "confirm":
                decisoes[item["toolCallId"]] = _aprovou(resposta, item["toolCallId"])
            else:
                # Substituição pelo `id` da mensagem, e não acréscimo: não existe
                # segundo resultado para o mesmo `tool_call_id`, e o sentinela
                # no histórico faria o modelo perguntar de novo.
                reescritas.append(
                    ToolMessage(
                        content=human.resposta_em_texto(
                            _resposta_da_pergunta(resposta, item["toolCallId"])
                        ),
                        tool_call_id=item["toolCallId"],
                        name=human.NOME,
                        id=item["messageId"],
                    )
                )
        atualizacao: dict[str, Any] = {"decisoes": decisoes}
        if reescritas:
            atualizacao["messages"] = reescritas
        return atualizacao

    async def planejar_no(
        state: EstadoDaConversa, runtime: Runtime[ContextoDoTurno]
    ) -> dict[str, Any]:
        """O plano do pedido, quando o planejador está ligado. Ver `planejador.py`."""
        writer = get_stream_writer()
        conversa = _para_o_provedor(state.get("messages") or [])[-6:]
        try:
            plano = await planejar(runtime.context.provider, conversa)
        except AIProviderError as exc:
            # Sem plano a conversa segue igual; o erro de verdade, se houver,
            # aparece na chamada seguinte, que é a que importa.
            logger.warning("Plano não gerado: %s", exc.code)
            return {}
        if plano.usage is not None:
            writer(
                events.usage(
                    plano.usage.model,
                    input_units=plano.usage.input_units,
                    output_units=plano.usage.output_units,
                )
            )
        if plano.passos:
            writer(events.plan(plano.passos))
        return {"plano": plano.passos}

    async def orcamento(
        state: EstadoDaConversa, runtime: Runtime[ContextoDoTurno]
    ) -> dict[str, Any]:
        """O teto de voltas acabou: pergunta se continua, em vez de parar calado.

        Sem efeito colateral antes do `interrupt()` — o LangGraph reexecuta este
        nó na retomada, como o portão.
        """
        titulos = {tool.name: tool.title for tool in runtime.context.permitidas}
        feitas = [
            titulos.get(m.name or "") or (m.name or "")
            for m in _do_turno(state.get("messages") or [])
            if isinstance(m, ToolMessage) and m.name != human.NOME
        ]
        resposta = interrupt(
            {
                "kind": "continue",
                "prompt": "Esta tarefa está mais longa que o previsto. Quer que eu continue?",
                "summary": resumo_do_trabalho(feitas),
                "actions": [],
            }
        )
        if afirmativo(resposta):
            return {"concedidas": (state.get("concedidas") or 0) + MAX_RODADAS_DE_TOOL}
        return {"encerrar": True}

    async def refletir(
        state: EstadoDaConversa, runtime: Runtime[ContextoDoTurno]
    ) -> dict[str, Any]:
        """A mesma tool falhou de novo: troca de abordagem, sem chamar modelo nenhum."""
        nome = tool_em_falha(state.get("falhas") or {}) or ""
        titulos = {tool.name: tool.title for tool in runtime.context.permitidas}
        reflexao = reflexao_da_falha(nome, titulos.get(nome, ""))
        reflexoes = [*(state.get("reflexoes") or []), reflexao]
        # Zera para a nova abordagem ter chance limpa.
        return {"reflexoes": reflexoes[-MAX_REFLEXOES:], "falhas": {}}

    async def validar(state: EstadoDaConversa, runtime: Runtime[ContextoDoTurno]) -> dict[str, Any]:
        """Confere a resposta final por regra. Reprovada, volta **uma** vez ao modelo."""
        writer = get_stream_writer()
        encontrada = _ultima_do_assistente(state.get("messages") or [])
        texto = _texto(encontrada[1]) if encontrada is not None else ""
        relatorio = validar_resposta(
            texto, [tool.name for tool in runtime.context.permitidas] + [human.NOME]
        )
        writer(events.validation(relatorio["ok"], relatorio["issues"]))
        revalidacoes = state.get("revalidacoes") or 0
        # Resposta vazia não volta ao modelo: o `fechar` já põe um texto na tela,
        # e uma segunda volta vazia só atrasaria o mesmo aviso.
        vazia = not texto.strip()
        if relatorio["ok"] or vazia or revalidacoes >= MAX_REVALIDACOES:
            return {"refazer": False}
        reflexoes = [*(state.get("reflexoes") or []), reflexao_da_validacao(relatorio["issues"])]
        return {
            "reflexoes": reflexoes[-MAX_REFLEXOES:],
            "revalidacoes": revalidacoes + 1,
            "refazer": True,
        }

    async def fechar(state: EstadoDaConversa) -> dict[str, Any]:
        """Garante texto no fim do turno.

        Dois jeitos de um turno acabar sem nada para ler: o modelo gastou o teto
        de voltas pedindo tool, ou devolveu uma resposta vazia. Nos dois, a tela
        ficaria com um balão vazio, indistinguível de travamento.
        """
        writer = get_stream_writer()
        mensagens = state.get("messages") or []
        encontrada = _ultima_do_assistente(mensagens)
        if encontrada is None:
            return {}
        indice, ultima = encontrada
        chamadas = _chamadas(ultima)
        pendentes = [c for c in chamadas if c["id"] not in _respondidas(mensagens, indice)]

        if pendentes:
            aviso = AIMessage(content=LIMITE_DE_PASSOS, id=f"ai-{uuid.uuid4().hex}")
            writer(
                events.Fragmento(AIMessageChunk(content=LIMITE_DE_PASSOS, id=aviso.id), "fechar")
            )
            return {
                "messages": [
                    *(
                        ToolMessage(
                            content=NAO_EXECUTADA,
                            tool_call_id=c["id"],
                            name=c["name"],
                            id=f"tool-{c['id']}",
                            status="error",
                        )
                        for c in pendentes
                    ),
                    aviso,
                ]
            }

        if not chamadas and not _texto(ultima).strip():
            writer(events.Fragmento(AIMessageChunk(content=SEM_RESPOSTA, id=ultima.id), "fechar"))
            return {"messages": [AIMessage(content=SEM_RESPOSTA, id=ultima.id)]}
        return {}

    def rota_apos_hidratar(_state: EstadoDaConversa, runtime: Runtime[ContextoDoTurno]) -> str:
        return "planejar" if runtime.context.planejar else "agente"

    def rota_apos_agente(state: EstadoDaConversa) -> str:
        encontrada = _ultima_do_assistente(state.get("messages") or [])
        if encontrada is None or not _chamadas(encontrada[1]):
            return "validar"
        # Na volta de fechamento o modelo não recebe ferramenta; se pedir mesmo
        # assim, o pedido é ignorado e o `fechar` responde por ele.
        if state.get("encerrar"):
            return "fechar"
        if tool_em_falha(state.get("falhas") or {}):
            return "refletir"
        teto = MAX_RODADAS_DE_TOOL + (state.get("concedidas") or 0)
        if (state.get("rodadas") or 0) > teto:
            return "orcamento"
        return "ferramentas"

    def rota_apos_orcamento(state: EstadoDaConversa) -> str:
        """Depois de perguntar, ou volta a trabalhar ou volta a escrever — sempre
        pelo modelo, nunca direto para o fim com tool pendente."""
        return "agente" if state.get("encerrar") else "ferramentas"

    def rota_apos_validar(state: EstadoDaConversa) -> str:
        return "agente" if state.get("refazer") else "fechar"

    def rota_apos_ferramentas(state: EstadoDaConversa, runtime: Runtime[ContextoDoTurno]) -> str:
        return "portao" if _paradas(state, runtime.context) else "agente"

    grafo = StateGraph(EstadoDaConversa, context_schema=ContextoDoTurno)
    grafo.add_node("hidratar", hidratar)
    grafo.add_node("planejar", planejar_no)
    grafo.add_node("agente", agente)
    grafo.add_node("ferramentas", ferramentas)
    grafo.add_node("portao", portao)
    grafo.add_node("orcamento", orcamento)
    grafo.add_node("refletir", refletir)
    grafo.add_node("validar", validar)
    grafo.add_node("fechar", fechar)

    grafo.add_edge(START, "hidratar")
    grafo.add_conditional_edges("hidratar", rota_apos_hidratar, ["planejar", "agente"])
    grafo.add_edge("planejar", "agente")
    grafo.add_conditional_edges(
        "agente",
        rota_apos_agente,
        ["ferramentas", "validar", "refletir", "orcamento", "fechar"],
    )
    grafo.add_conditional_edges("ferramentas", rota_apos_ferramentas, ["portao", "agente"])
    grafo.add_edge("portao", "ferramentas")
    grafo.add_conditional_edges("orcamento", rota_apos_orcamento, ["agente", "ferramentas"])
    grafo.add_edge("refletir", "agente")
    grafo.add_conditional_edges("validar", rota_apos_validar, ["agente", "fechar"])
    grafo.add_edge("fechar", END)

    return grafo.compile(checkpointer=checkpointer)


def _paradas(state: EstadoDaConversa, contexto: ContextoDoTurno) -> list[dict[str, Any]]:
    """O que a volta atual espera da pessoa: escritas sem decisão e perguntas.

    Os argumentos da escrita vão **inteiros** na parada: é o que a pessoa lê
    para decidir, e é exatamente o que vai executar se ela aprovar.
    """
    mensagens = state.get("messages") or []
    encontrada = _ultima_do_assistente(mensagens)
    if encontrada is None:
        return []
    indice, pedido = encontrada
    respondidas = _respondidas(mensagens, indice)
    decisoes = state.get("decisoes") or {}
    titulos = {tool.name: tool.title for tool in contexto.permitidas}
    confirmaveis = {tool.name for tool in camada_confirmavel(contexto.permitidas)}

    itens: list[dict[str, Any]] = []
    for chamada in _chamadas(pedido):
        identificador, nome = chamada["id"], chamada["name"]
        respondida = respondidas.get(identificador)
        if respondida is not None:
            pergunta = _pergunta_pendente(respondida)
            if pergunta is not None:
                itens.append(
                    {
                        "kind": "question",
                        "toolCallId": identificador,
                        "messageId": respondida.id,
                        "prompt": pergunta["prompt"],
                        "fields": pergunta["fields"],
                    }
                )
            continue
        if chamada["erro"] is None and nome in confirmaveis and identificador not in decisoes:
            itens.append(
                {
                    "kind": "confirm",
                    "toolCallId": identificador,
                    "tool": nome,
                    "title": titulos.get(nome) or nome,
                    "prompt": titulos.get(nome) or nome,
                    "arguments": chamada["args"],
                }
            )
    return itens


async def interrupcao_pendente(grafo: GrafoDaConversa, thread_id: str) -> str | None:
    """O id da pausa que a thread está esperando, ou `None` se não há nenhuma."""
    estado = await grafo.aget_state({"configurable": {"thread_id": thread_id}})
    for item in estado.interrupts:
        if item.id:
            return str(item.id)
    return None


async def stream_chat_events(
    grafo: GrafoDaConversa,
    contexto: ContextoDoTurno,
    *,
    thread_id: str,
    conversation_id: str,
    mensagem: str | None = None,
    retomada: object = None,
) -> AsyncIterator[str]:
    """Roda um turno (ou retoma uma pausa) e devolve os quadros SSE, na ordem.

    Erro que chega até aqui vira **evento**, não exceção: quando o primeiro
    quadro saiu, o 200 já foi enviado. O `code` é o mesmo do envelope JSON, para
    o `apps/api` traduzir do mesmo jeito nos dois caminhos.
    """
    config: RunnableConfig = {"configurable": {"thread_id": thread_id}}
    # `Command(resume=None)` é lido pelo LangGraph como "sem retomada" e estoura;
    # a resposta vazia é "", que o portão já trata como não.
    entrada: Any = (
        Command(resume=retomada if retomada is not None else "")
        if mensagem is None
        else {
            "messages": [
                HumanMessage(
                    content=f"{mensagem}\n\n{MARCA_DE_FOTO.format(n=len(contexto.fotos))}"
                    if contexto.fotos
                    else mensagem,
                    id=f"human-{uuid.uuid4().hex}",
                )
            ]
        }
    )

    yield events.start(conversation_id, contexto.run_id).frame()
    yield events.catalog(
        {tool.name: tool.title for tool in contexto.permitidas if tool.title}
    ).frame()

    interrompido = False
    try:
        async for modo, pacote in grafo.astream(
            entrada,
            config=config,
            context=contexto,
            stream_mode=["custom", "updates"],
        ):
            if modo == "custom":
                if isinstance(pacote, events.Fragmento):
                    yield events.fragmento(pacote.mensagem, pacote.no)
                elif isinstance(pacote, events.ChatEvent):
                    yield pacote.frame()
                else:
                    raise TypeError(f"O grafo emitiu {type(pacote).__name__} no canal custom.")
            elif modo == "updates" and isinstance(pacote, dict):
                interrompido = interrompido or bool(pacote.get("__interrupt__"))
                quadro = events.atualizacoes(pacote)
                if quadro is not None:
                    yield quadro
    # Só as duas famílias nomeadas. Exceção sem `code` sobe com traceback: ela é
    # defeito nosso, e um evento genérico esconderia a única pista.
    except (AIProviderError, McpError) as exc:
        logger.warning("Turno de chat terminou em %s: %s", exc.code, exc.message)
        yield events.error(exc.code, exc.message).frame()
        yield events.done("error").frame()
        return

    if interrompido:
        yield events.done("interrupted").frame()
        return

    estado = await grafo.aget_state(config)
    encontrada = _ultima_do_assistente(estado.values.get("messages") or [])
    if encontrada is not None:
        yield events.completas([encontrada[1]])
    yield events.done("completed").frame()


__all__ = [
    "AVISO_DE_CORTE",
    "LIMITE_DE_PASSOS",
    "MAX_ARGUMENTOS_APROVADOS",
    "MAX_CARACTERES_POR_MENSAGEM",
    "MAX_HISTORICO",
    "MAX_RODADAS_DE_TOOL",
    "MAX_TOOLS_POR_RODADA",
    "NAO_EXECUTADA",
    "RECUSADA",
    "SEM_RESPOSTA",
    "GrafoDaConversa",
    "interrupcao_pendente",
    "montar_grafo",
    "stream_chat_events",
]
