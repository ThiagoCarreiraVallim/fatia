"""O contrato SSE do `/chat` — fixado aqui porque três camadas dependem dele.

A épica #247 constrói PWA, NestJS e agente **em paralelo**, e divergência entre
o que um lado emite e o que o outro declara já custou caro neste repositório
(#157). Este módulo é o lado que emite; o NestJS repassa sem bufferizar e o PWA
renderiza. Nomes de evento e chaves de payload em inglês, como o resto do fio
(`{"error": {"code", "message"}}`, `RecognizedMeal`).

    event: token
    data: {"text": "Você registrou "}

    event: tool
    data: {"name": "list_meals", "phase": "start", "arguments": "{\"date\":\"2026-08-05\"}"}

    event: tool
    data: {"name": "list_meals", "phase": "end", "ok": true, "result": "[{...}]"}

    event: error
    data: {"code": "MCP_UNAUTHORIZED", "message": "..."}

    event: done
    data: {"reason": "stop"}

Três garantias que o outro lado pode assumir:

1. **`done` é sempre o último evento**, inclusive depois de `error`. Um cliente
   que só sabe fechar no `done` não fica pendurado por causa de uma falha.
2. **`error` é terminal.** Depois dele só vem `done`, com `reason: "error"`.
3. **Nada do que sai daqui contém o Bearer.** Ele não entra no estado do grafo,
   não é ecoado em evento nenhum e não aparece em mensagem de erro — ver o
   docstring de `mcp_client.py` e `tests/chat/test_sem_vazamento.py`.

Por que status HTTP não serve para o erro: quando o primeiro token sai, o 200 já
foi enviado. Erro depois disso só cabe **dentro** do fluxo, e por isso ele
carrega o mesmo `code` estável que o envelope JSON carregaria. Erro **antes** do
primeiro byte continua sendo envelope JSON com status, em **todos** os caminhos
— inclusive a credencial do agente e a validação do corpo, que saíam como
`{"detail": ...}` até a revisão da #248. Ver `api.py`.

E os tokens saem **na hora**, um a um, com o modelo ainda escrevendo. Essa é a
propriedade que a #247 inteira existe para ter, e a que nenhum teste de ordem
consegue segurar: bufferizar não troca a ordem relativa de evento nenhum. Quem a
segura é `tests/chat/test_graph.py::test_o_token_sai_antes_de_o_turno_do_modelo_terminar`.
"""

import json
from dataclasses import dataclass
from typing import Any

# O resultado da tool vai no evento para a UI poder mostrar o que foi consultado.
# Truncado porque ele já viaja inteiro no prompt do modelo: mandar o dump de
# `list_meals` duas vezes pelo fio pagaria o dobro pela mesma informação, e a
# tela não mostra um JSON de 8 kB.
MAX_RESULTADO_NO_EVENTO = 500

# Mesmo raciocínio para os argumentos, que são bem menores.
MAX_ARGUMENTOS_NO_EVENTO = 300


@dataclass(frozen=True)
class ChatEvent:
    """Um evento do fluxo. `name` é o `event:` do SSE, `data` vira o JSON."""

    name: str
    data: dict[str, Any]

    def frame(self) -> str:
        """O evento já no formato do fio.

        `ensure_ascii=False` porque o conteúdo é português e escapar acento
        triplicaria o tamanho de cada token. `separators` sem espaço pelo mesmo
        motivo — são milhares de eventos por conversa.
        """
        corpo = json.dumps(self.data, ensure_ascii=False, separators=(",", ":"))
        return f"event: {self.name}\ndata: {corpo}\n\n"


def token(text: str) -> ChatEvent:
    return ChatEvent("token", {"text": text})


def tool_start(name: str, arguments: str) -> ChatEvent:
    return ChatEvent(
        "tool",
        {"name": name, "phase": "start", "arguments": _cortar(arguments, MAX_ARGUMENTOS_NO_EVENTO)},
    )


def tool_end(name: str, *, ok: bool, result: str) -> ChatEvent:
    return ChatEvent(
        "tool",
        {
            "name": name,
            "phase": "end",
            "ok": ok,
            "result": _cortar(result, MAX_RESULTADO_NO_EVENTO),
        },
    )


def error(code: str, message: str) -> ChatEvent:
    return ChatEvent("error", {"code": code, "message": message})


def done(reason: str) -> ChatEvent:
    return ChatEvent("done", {"reason": reason})


def _cortar(texto: str, limite: int) -> str:
    """Corta com reticência visível: texto cortado em silêncio vira JSON quebrado
    na mão de quem tentar fazer `parse` do evento sem saber que houve corte."""
    if len(texto) <= limite:
        return texto
    return f"{texto[:limite]}… (+{len(texto) - limite})"


__all__ = [
    "MAX_ARGUMENTOS_NO_EVENTO",
    "MAX_RESULTADO_NO_EVENTO",
    "ChatEvent",
    "done",
    "error",
    "token",
    "tool_end",
    "tool_start",
]
