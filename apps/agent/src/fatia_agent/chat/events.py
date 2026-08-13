"""O contrato SSE do `/chat` — fixado aqui porque três camadas dependem dele.

A épica #247 constrói PWA, NestJS e agente **em paralelo**, e divergência entre
o que um lado emite e o que o outro declara já custou caro neste repositório
(#157). Este módulo é o lado que emite; o NestJS repassa sem bufferizar e o PWA
renderiza. Nomes de evento e chaves de payload em inglês, como o resto do fio
(`{"error": {"code", "message"}}`, `RecognizedMeal`).

    event: token
    data: {"text": "Você registrou "}

    event: tool
    data: {"id": "c1", "name": "list_meals", "state": "input-available",
           "input": "{\"date\":\"2026-08-05\"}"}

    event: tool
    data: {"id": "c1", "name": "list_meals", "state": "output-available", "output": "[{...}]"}

    event: proposal
    data: {"id": "c2", "name": "log_meal", "arguments": "{\"items\":[...]}"}

    event: usage
    data: {"model": "ornith-1.0-9b", "inputUnits": 812, "outputUnits": 96}

    event: error
    data: {"code": "MCP_UNAUTHORIZED", "message": "..."}

    event: done
    data: {"reason": "stop"}

## O handshake de confirmação: dois turnos HTTP, não uma pausa

Tool CONFIRMABLE (ADR 022) **não executa** no turno em que o modelo a pede. O
agente emite `proposal` e fecha o turno com `reason: "awaiting_confirmation"`. Se
a pessoa aprovar na tela, o PWA abre um turno novo com a proposta em `approved`,
e o agente executa aquilo direto — sem passar pelo modelo de novo.

Dois turnos, e não um `interrupt()` do LangGraph, porque pausar de verdade exige
checkpointer, e não há: a persistência é do NestJS (ADR 015), e um checkpointer
aqui gravaria histórico de saúde num segundo lugar. Ver `graph.py`.

Executar direto no segundo turno, e não pedir ao modelo que chame a tool de novo,
porque "de novo" não é garantido: o modelo pode reformular os argumentos entre um
turno e outro, e o que a pessoa aprovou na tela deixaria de ser o que roda. O que
ela viu é o que executa.

Por isso os `arguments` de `proposal` vão inteiros — eles voltam na aprovação e
são o que de fato executa. O PWA os devolve como recebeu; ele não é a autoridade
sobre eles, mas também não precisa ser: a tool roda com o Bearer da própria
pessoa contra os dados dela, e `exigir_permitida` continua valendo. Argumento
adulterado não alcança nada que o app já não permitisse pela tela.

## Por que `id`/`state`, e não `phase`/`ok`

Este vocabulário é o dos elementos de IA do shadcn, que é o que a tela da #250
renderiza — `input-available` → `output-available` | `output-error`. O agente
emitiu `phase`/`ok` até esta correção, e o `parseChatEvent` do
`@fatia/api-client` exige `id` e `state`: **todo quadro de tool era descartado
em silêncio** e nenhuma tool aparecia na tela. As três camadas da #247 foram
construídas em paralelo, e o contrato divergiu exatamente onde ninguém tinha
teste dos dois lados.

O `id` é o da tool call do modelo, e é o que faz o segundo quadro **substituir**
o primeiro em vez de duplicá-lo. Sem ele, cada tool apareceria duas vezes.

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


def tool_start(id: str, name: str, arguments: str) -> ChatEvent:
    return ChatEvent(
        "tool",
        {
            "id": id,
            "name": name,
            "state": "input-available",
            "input": _cortar(arguments, MAX_ARGUMENTOS_NO_EVENTO),
        },
    )


def tool_end(id: str, name: str, *, ok: bool, result: str) -> ChatEvent:
    """O fim da mesma chamada, casado pelo `id` com o quadro de início.

    Sucesso e falha são **estados diferentes**, e não um booleano: é o que o
    `ToolOutput` da tela usa para escolher entre mostrar o resultado e mostrar o
    erro. O texto vai em `output` ou em `errorText`, nunca nos dois.
    """
    texto = _cortar(result, MAX_RESULTADO_NO_EVENTO)
    if ok:
        return ChatEvent(
            "tool", {"id": id, "name": name, "state": "output-available", "output": texto}
        )
    return ChatEvent("tool", {"id": id, "name": name, "state": "output-error", "errorText": texto})


def usage(model: str, *, input_units: int | None, output_units: int | None) -> ChatEvent:
    """O que o turno consumiu, para a cota do `apps/api` (#135).

    Chaves em camelCase porque é o que o `chat.service.ts` lê. Unidade ausente
    fica **fora** do objeto em vez de ir como `0`: o `somarUnidade` de lá trata
    `undefined` como "total desconhecido" e contamina a soma de propósito — um
    zero aqui viraria custo medido e a cota fecharia tarde.
    """
    dados: dict[str, Any] = {"model": model}
    if input_units is not None:
        dados["inputUnits"] = input_units
    if output_units is not None:
        dados["outputUnits"] = output_units
    return ChatEvent("usage", dados)


def error(code: str, message: str) -> ChatEvent:
    return ChatEvent("error", {"code": code, "message": message})


def done(reason: str) -> ChatEvent:
    return ChatEvent("done", {"reason": reason})


def proposal(id: str, name: str, arguments: str) -> ChatEvent:
    """Uma tool CONFIRMABLE que o modelo pediu e que **não** foi executada.

    O turno termina aqui, com `done` e `reason: "awaiting_confirmation"`. Quem
    decide é a pessoa, na tela; se ela aprovar, o PWA manda **outro** turno
    carregando esta proposta em `approved`, e aí o agente executa. Ver o
    handshake no topo deste módulo.

    Os `arguments` viajam **inteiros**, ao contrário dos de `tool_start`: eles
    voltam na aprovação e são o que de fato executa. Cortar aqui mandaria JSON
    pela metade de volta — a tool falharia, ou pior, gravaria o pedaço que
    sobrou. Quem passa do teto é recusado em `agir`, não truncado aqui.
    """
    return ChatEvent("proposal", {"id": id, "name": name, "arguments": arguments})


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
    "proposal",
    "token",
    "tool_end",
    "tool_start",
    "usage",
]
