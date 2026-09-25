"""O contrato SSE do `/chat` — o vocabulário nativo do LangGraph, mais o nosso.

Três camadas dependem deste fio (agente, `apps/api`, PWA), e divergência entre o
que um lado emite e o que o outro declara já custou caro aqui (#157, e de novo
na #247, quando todo quadro de tool era descartado em silêncio). Por isso o fio
deixou de ser um formato inventado: os três modos que carregam a conversa são os
do próprio LangGraph, que o runtime do assistant-ui (`useLangGraphRuntime`)
consome sem tradutor (ADR 023).

    event: messages
    data: [{"type":"AIMessageChunk","content":"Você registrou ","id":"ai-…"},
           {"langgraph_node":"agente"}]

    event: updates
    data: {"agente": {"messages": [{"type":"ai","content":"","tool_calls":[…]}]}}

    event: updates
    data: {"__interrupt__": [{"id":"…","value":{"kind":"confirm","actions":[…]}}]}

    event: messages/complete
    data: [{"type":"ai","content":"Pronto, registrei o almoço.","id":"ai-…"}]

⚠️ Nos três, o `data` é o do modo de stream, **cru**: em `messages` é uma lista
de dois elementos, e enfiar uma chave ali quebraria a desserialização do
cliente. Quem diz o que é o quadro é a linha `event:`.

Os eventos próprios — o LangGraph não tem equivalente para eles:

    event: start       {"conversationId": "…", "runId": "…"}
    event: catalog     {"tools": {"log_meal": "Registrar refeição", …}}
    event: usage       {"model": "…", "inputUnits": 812, "outputUnits": 96}
    event: plan        {"steps": [{"id": "1", "title": "…", "status": "running"}]}
    event: artifact    {"toolCallId": "c1", "kind": "metric", …}
    event: context     {"estimated": true, "segments": [{"key": "tools", "tokens": 900}]}
    event: validation  {"ok": false, "issues": ["…"]}
    event: error       {"code": "MCP_UNAUTHORIZED", "message": "…"}
    event: done        {"status": "completed" | "interrupted" | "error"}

Não existe evento de chamada nem de resultado de tool: a chamada vive em
`tool_calls` da mensagem do assistente, e o resultado é a própria `ToolMessage`
(`tool_call_id`, `status`). Emitir os dois também como evento próprio faria a
tela desenhar cada tool duas vezes.

Três garantias que o outro lado pode assumir:

1. **`done` é sempre o último evento**, inclusive depois de `error`.
2. **`error` é terminal.** Depois dele só vem `done`, com `status: "error"`.
3. **Nada do que sai daqui contém o Bearer.** Ele vive no `McpClient`, que viaja
   pelo runtime context e não pelo estado — ver `state.py` e
   `tests/chat/test_sem_vazamento.py`.

Erro **antes** do primeiro byte continua sendo envelope JSON com status — ver
`api.py`. Depois que o stream abriu, o 200 já foi, e o erro só cabe aqui dentro,
com o mesmo `code` estável que o envelope carregaria.
"""

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import BaseMessage, ToolMessage

# O resultado de tool que vai para a **tela**. O estado guarda o texto inteiro —
# é o que o modelo lê —, mas a tela mostra um resumo recolhível, e mandar uma
# lista de 90 refeições em JSON a cada turno só pesaria o fio.
MAX_RESULTADO_NO_EVENTO = 500


@dataclass(frozen=True)
class ChatEvent:
    """Um evento próprio. `name` é a linha `event:`, `data` vira o JSON."""

    name: str
    data: dict[str, Any]

    def frame(self) -> str:
        return quadro(self.name, self.data)


@dataclass(frozen=True)
class Fragmento:
    """Um pedaço do texto do modelo, a caminho do modo `messages`.

    Passa pelo `writer` do nó `agente` embrulhado neste tipo, e não como
    `ChatEvent`, porque o formato dele é outro: sai como a tupla
    `[mensagem, metadados]` do LangGraph.
    """

    mensagem: BaseMessage
    no: str


def quadro(nome: str, dados: object) -> str:
    """Um quadro SSE.

    `ensure_ascii=False` porque o conteúdo é português e escapar acento
    triplicaria cada token. `separators` sem espaço pelo mesmo motivo — são
    milhares de quadros por conversa.
    """
    corpo = json.dumps(dados, ensure_ascii=False, separators=(",", ":"), default=str)
    return f"event: {nome}\ndata: {corpo}\n\n"


def serializar(mensagem: BaseMessage) -> dict[str, Any]:
    """A mensagem do LangChain no formato que viaja no fio.

    `model_dump()` já é a forma que o cliente espera — `type`, `tool_calls`,
    `tool_call_id`, `status`. Campos vazios saem: um fragmento de texto puro
    carregaria meia dúzia de chaves nulas em **cada** token.

    O `artifact` da `ToolMessage` nunca sai: é o canal que não entra no contexto
    do modelo, e é por ele que viaja a pergunta de `ask_user`. O que a tela
    precisa dela chega pelo `__interrupt__`.
    """
    bruto = mensagem.model_dump()
    bruto.pop("artifact", None)
    return {chave: valor for chave, valor in bruto.items() if valor not in (None, "", [], {})}


def _para_a_tela(mensagem: BaseMessage) -> dict[str, Any]:
    dados = serializar(mensagem)
    conteudo = dados.get("content")
    if isinstance(mensagem, ToolMessage) and isinstance(conteudo, str):
        dados["content"] = cortar(conteudo, MAX_RESULTADO_NO_EVENTO)
    return dados


def fragmento(mensagem: BaseMessage, no: str) -> str:
    """O modo `messages`: `[mensagem, metadados]`."""
    return quadro("messages", [serializar(mensagem), {"langgraph_node": no}])


def atualizacoes(pacote: Mapping[str, Any]) -> str | None:
    """O modo `updates`, podado ao que a tela usa — ou `None` se nada sobrou.

    🔴 Só passam `messages` e `__interrupt__`. O resto do estado (decisões,
    contadores) é do grafo, e o dicionário inteiro no navegador entregaria de
    graça o que nada na tela precisa.

    O nó `hidratar` nunca passa: ele devolve o histórico com os ids do grafo, e
    o cliente já tem essas mesmas falas com os ids dele. O assistant-ui acrescenta
    toda mensagem de `updates` com id desconhecido — repassar o nó duplicaria a
    conversa na tela a cada envio.
    """
    podado: dict[str, Any] = {}
    for no, conteudo in pacote.items():
        if no == "hidratar":
            continue
        if no == "__interrupt__":
            podado[no] = [
                {"id": getattr(item, "id", None), "value": getattr(item, "value", item)}
                for item in (conteudo or ())
            ]
            continue
        if isinstance(conteudo, dict) and conteudo.get("messages"):
            podado[no] = {
                "messages": [
                    _para_a_tela(m) for m in conteudo["messages"] if isinstance(m, BaseMessage)
                ]
            }
    return quadro("updates", podado) if podado else None


def completas(mensagens: Iterable[BaseMessage]) -> str:
    """O modo `messages/complete`: a resposta final, lida do estado.

    A resposta não pode depender dos fragmentos: um stream que morreu no meio
    deixaria a tela com texto pela metade, e o `apps/api` gravaria essa metade.
    O cliente casa pelo `id` e funde com o que já recebeu.
    """
    return quadro("messages/complete", [serializar(m) for m in mensagens])


def start(conversation_id: str, run_id: str) -> ChatEvent:
    return ChatEvent("start", {"conversationId": conversation_id, "runId": run_id})


def catalog(titulos: Mapping[str, str]) -> ChatEvent:
    """Nome de tool → título em português, como o `/mcp` anuncia.

    É o que deixa a tela rotular **toda** tool sem uma tabela à mão que apodrece
    a cada tool nova — o defeito da `ROTULOS` antiga, que cobria 10 de 35.
    """
    return ChatEvent("catalog", {"tools": dict(titulos)})


def usage(model: str, *, input_units: int | None, output_units: int | None) -> ChatEvent:
    """O que uma chamada ao modelo consumiu, para a cota do `apps/api` (#135).

    Um por chamada, e não um por turno: o grafo chama o modelo a cada volta do
    ciclo de tool, e cada volta custa. Unidade ausente fica **fora** do objeto em
    vez de ir como `0`: o `somarUnidade` do `chat.service.ts` trata `undefined`
    como "total desconhecido" de propósito — um zero aqui viraria custo medido.
    """
    dados: dict[str, Any] = {"model": model}
    if input_units is not None:
        dados["inputUnits"] = input_units
    if output_units is not None:
        dados["outputUnits"] = output_units
    return ChatEvent("usage", dados)


def plan(passos: Iterable[Mapping[str, Any]]) -> ChatEvent:
    """O plano inteiro, a cada mudança de status — ver `planejador.com_status`."""
    return ChatEvent("plan", {"steps": [dict(p) for p in passos]})


def artifact(tool_call_id: str, carga: Mapping[str, Any]) -> ChatEvent:
    """A carga tipada de uma tool, pendurada no cartão dela pelo `toolCallId`.

    Uma volta pode ter várias chamadas da mesma tool ("compare março e abril"),
    e sem o id a tela não saberia a qual cartão pendurar a tabela.
    """
    return ChatEvent("artifact", {"toolCallId": tool_call_id, **carga})


def context(segmentos: Iterable[Mapping[str, Any]]) -> ChatEvent:
    """O que ocupa a janela de contexto, por origem, na primeira volta do turno.

    Só o agente sabe dizer, porque é ele quem junta prompt, memória, histórico e
    o esquema das ferramentas. **Estimativa**, e o campo diz isso.
    """
    return ChatEvent("context", {"estimated": True, "segments": [dict(s) for s in segmentos]})


def validation(ok: bool, problemas: Iterable[str]) -> ChatEvent:
    return ChatEvent("validation", {"ok": ok, "issues": list(problemas)})


def error(code: str, message: str) -> ChatEvent:
    return ChatEvent("error", {"code": code, "message": message})


def done(status: str) -> ChatEvent:
    return ChatEvent("done", {"status": status})


def cortar(texto: str, limite: int) -> str:
    """Corta com reticência visível: texto cortado em silêncio parece completo."""
    if len(texto) <= limite:
        return texto
    return f"{texto[:limite]}… (+{len(texto) - limite})"


__all__ = [
    "MAX_RESULTADO_NO_EVENTO",
    "ChatEvent",
    "Fragmento",
    "artifact",
    "atualizacoes",
    "catalog",
    "completas",
    "context",
    "cortar",
    "done",
    "error",
    "fragmento",
    "plan",
    "quadro",
    "serializar",
    "start",
    "usage",
    "validation",
]
