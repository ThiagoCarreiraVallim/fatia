"""Quais tools do catálogo o agente pode chamar — e por que o critério é este.

**Só as de leitura**: as que o próprio `/mcp` anuncia com
`annotations.readOnlyHint === true`. Quantas são é o que o catálogo disser na
hora — nenhum número mora aqui, e nenhuma edição deste arquivo é necessária para
uma tool nova entrar ou sair do recorte.

## Por que um critério derivado, e não uma lista

Uma lista de nomes à mão apodrece de duas formas, e as duas são silenciosas:
tool renomeada some do recorte sem aviso (o agente perde a capacidade e ninguém
liga o sintoma à lista), e tool nova nasce fora dele (ou dentro, se a lista for
por exclusão — e aí é escrita liberada por esquecimento). O critério aqui é um
campo que o servidor **já serve em toda sessão** e que o `apps/api` já protege:
`tool-catalog.spec.ts` reprova qualquer tool que não declare `readOnlyHint` e
`destructiveHint`, e reprova a que declare `readOnlyHint: true` com nome de
escrita. O recorte do agente herda essa guarda em vez de duplicá-la.

## Por que só leitura

O chat é 1/3 de uma épica cuja tela ainda não existe. Escrever pelo chat sem
tela de confirmação inverteria a propriedade que a #139 estabeleceu e que a
ADR 004 registra: **o que a IA produz é sugestão, quem grava é o caminho manual**
— e é isso que faz a confirmação ser obrigatória por construção, e não por
disciplina. "Apaga minha refeição de ontem" dita para um modelo pequeno, sem
tela, é um `delete_meal` a uma alucinação de distância.

Ler é reversível; gravar não. Quando houver tela de confirmação, o recorte muda
**aqui**, com ADR, e não por uma tool nova nascer com a anotação errada.

## Falha fechada

Tool sem `annotations`, ou com `readOnlyHint` que não é o booleano `true`, fica
**de fora**. `readOnlyHint: "true"` (string) e `readOnlyHint: 1` não passam: em
Python `1 == True`, e um `if anotacoes.get("readOnlyHint")` deixaria os dois
entrarem. A checagem é por identidade com `True`.
"""

import json
from collections.abc import Iterable
from typing import Any

from .errors import McpToolArgumentsInvalid, McpToolNotAllowed
from .mcp_client import McpToolInfo


def somente_leitura(catalogo: Iterable[McpToolInfo]) -> list[McpToolInfo]:
    """O recorte: as tools que o `/mcp` anuncia como somente-leitura."""
    return [tool for tool in catalogo if tool.annotations.get("readOnlyHint") is True]


def formato_openai(catalogo: Iterable[McpToolInfo]) -> list[dict[str, Any]]:
    """Catálogo MCP → o formato `tools` que o endpoint de chat espera.

    O `inputSchema` do MCP **já é** JSON Schema, que é o que vai em `parameters`.
    Não há tradução de schema aqui, e é de propósito: um tradutor entre dois
    formatos que já são o mesmo é onde nasce o dublê que aceita payload que a
    realidade não tem.
    """
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema,
            },
        }
        for tool in catalogo
    ]


def exigir_permitida(nome: str, permitidas: Iterable[McpToolInfo]) -> None:
    """Recusa antes de chamar, quando o modelo pede uma tool fora do recorte.

    Segunda barreira, e não redundância: a primeira é não oferecer a tool ao
    modelo, e modelo pequeno **inventa** nome de função com frequência. Um nome
    inventado que por acaso exista no catálogo de escrita (`delete_meal` é curto
    e óbvio) viraria escrita sem nunca ter sido oferecida.
    """
    nomes = {tool.name for tool in permitidas}
    if nome in nomes:
        return
    raise McpToolNotAllowed(
        f"O modelo pediu a tool '{nome}', que não está no recorte permitido ao agente. "
        "O chat hospedado só chama tools de leitura (ADR 021) — o que grava continua "
        "sendo o caminho manual do app, com confirmação na tela."
    )


def argumentos_do_modelo(bruto: str) -> dict[str, Any]:
    """Texto de `function.arguments` → objeto, ou erro nomeado.

    Vazio vira `{}`: tool sem parâmetro obrigatório é chamada assim por vários
    modelos, e recusar seria transformar o caso mais comum em falha.
    """
    texto = bruto.strip()
    if not texto:
        return {}
    try:
        carregado: object = json.loads(texto)
    except ValueError as exc:
        raise McpToolArgumentsInvalid(
            f"O modelo mandou argumentos que não são JSON: {texto[:120]!r} ({exc})."
        ) from exc
    if not isinstance(carregado, dict):
        raise McpToolArgumentsInvalid(
            f"Os argumentos da tool precisam ser um objeto, veio {type(carregado).__name__}."
        )
    return carregado


__all__ = [
    "argumentos_do_modelo",
    "exigir_permitida",
    "formato_openai",
    "somente_leitura",
]
