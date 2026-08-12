"""Quais tools do catálogo o agente pode chamar — e por que o critério é este.

**Três camadas, derivadas das anotações que o `/mcp` anuncia em toda sessão**:
* `readOnlyHint is True`      → READ_ONLY (executa direto no chat)
* `confirmableHint is True`   → CONFIRMABLE (pausa pra confirmação visual)
* tudo o mais                 → RESTRICTED (nunca oferecida ao modelo)

Nenhum número mora aqui, e nenhuma edição deste arquivo é necessária para uma
tool nova entrar ou sair de um recorte: a classificação é um campo que o
servidor já serve em toda sessão.

## Por que três camadas, e não leitura vs escrita

Ler é reversível; gravar não. Quando houver tela de confirmação, o recorte muda
**aqui**, com ADR 021, e não por uma tool nova nascer com a anotação errada.
Sem tela, só há leitura — é isso que faz a confirmação ser obrigatória por
construção, e não por disciplina. "Apaga minha refeição de ontem" dita para um
modelo pequeno, sem tela, é um `delete_meal` a uma alucinação de distância.

## Por que um critério derivado, e não uma lista

Uma lista de nomes à mão apodrece de duas formas, e as duas são silenciosas:
tool renomeada some do recorte sem aviso (o agente perde a capacidade e ninguém
liga o sintoma à lista), e tool nova nasce fora dele (ou dentro, se a lista for
por exclusão — e aí é escrita liberada por esquecimento). O critério aqui é um
campo que o servidor **já serve em toda sessão** e que o `apps/api` já protege:
`tool-catalog.spec.ts` reprova qualquer tool que não declare `readOnlyHint`,
`destructiveHint` e `confirmableHint`.

## Falha fechada

Tool sem nenhuma anotação clara, ou com `readOnlyHint`/`confirmableHint` que
não é o booleano `True`, entra em **RESTRICTED** (de fora). Em Python
`1 == True`, e um `if anotacoes.get("confirmableHint")` deixaria `"true"` e
`1` entrarem como confirmáveis. As checagens são por identidade com `True`.

Tool com nome de deletora (`delete_...`) é RESTRICTED, independente das
anotações: operações irreversíveis não entram no chat, nem mesmo para
confirmação visual.
"""

import json
from collections.abc import Iterable
from typing import Any

from .errors import McpToolArgumentsInvalid, McpToolNotAllowed
from .mcp_client import McpToolInfo


def camada_read_only(catalogo: Iterable[McpToolInfo]) -> list[McpToolInfo]:
    """Camada READ_ONLY: ferramentas de leitura pura."""
    return [tool for tool in catalogo if tool.annotations.get("readOnlyHint") is True]


def camada_confirmavel(catalogo: Iterable[McpToolInfo]) -> list[McpToolInfo]:
    """Camada CONFIRMABLE: ferramentas reversíveis/idempotentes com tela de confirmação."""
    return [tool for tool in catalogo if tool.annotations.get("confirmableHint") is True]


def camada_restrita(catalogo: Iterable[McpToolInfo]) -> list[McpToolInfo]:
    """Camada RESTRICTED: tudo que não é leitura e não é confirmável.

    Inclui deletoras irreversíveis (prefixo `delete_...`) e qualquer tool sem
    anotação clara, por falha fechada.
    """
    permitidas = []
    for tool in catalogo:
        if tool.annotations.get("readOnlyHint") is True:
            continue  # READ_ONLY
        if tool.annotations.get("confirmableHint") is True:
            continue  # CONFIRMABLE
        if tool.name.startswith("delete_"):
            permitidas.append(tool)  # deletora → RESTRICTED (nunca oferecida)
    return permitidas


def todas_permitidas(catalogo: Iterable[McpToolInfo]) -> list[McpToolInfo]:
    """União de READ_ONLY e CONFIRMABLE — o que entra no prompt do modelo."""
    return camada_read_only(catalogo) + camada_confirmavel(catalogo)


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


def classificar_tools(catalogo: Iterable[McpToolInfo]) -> dict[str, list[McpToolInfo]]:
    """Devolve a classificação completa das tools em cada camada.

    Útil para o prompt do sistema e para logging — mostra ao agente quais são
    as ferramentas confirmáveis pendentes que precisam de OK na tela.
    """
    return {
        "read_only": camada_read_only(catalogo),
        "confirmable": camada_confirmavel(catalogo),
        "restricted": camada_restrita(catalogo),
    }


__all__ = [
    "argumentos_do_modelo",
    "camada_confirmavel",
    "camada_read_only",
    "camada_restrita",
    "classificar_tools",
    "exigir_permitida",
    "formato_openai",
    "somente_leitura",
    "todas_permitidas",
]
