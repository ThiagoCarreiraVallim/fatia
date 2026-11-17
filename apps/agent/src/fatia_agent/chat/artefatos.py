"""A carga tipada de uma tool, a caminho da tela (evento `artifact`).

Vem do `structuredContent` do MCP — o canal que **não** entra no contexto do
modelo: é o que faz o número chegar inteiro à tela sem passar pelos olhos de
quem poderia transcrevê-lo errado, e sem queimar janela nos turnos seguintes.

Os formatos são uma lista fechada, e **não há formato padrão** (#384): toda tool declara o
seu no `apps/api`. Um `kind` que a tela não conhece é descartado — virar Tabela esconderia
o defeito de quem o produziu atrás de um cartão torto. Cada formato se reconhece por um
campo obrigatório **diferente** — uma checagem única por `columns` descartaria em silêncio
tudo que não fosse tabela.
"""

from typing import Any

CAMPO_OBRIGATORIO = {
    "report": "columns",
    "metric": "value",
    "timeline": "events",
    "comparison": "items",
    # Os formatos da prancha IA-Cartoes (#384). Cada `card` declarado numa tool do
    # `apps/api` tem de estar aqui, senão o artefato vira Tabela sem `columns` e some.
    "bars": "bars",
    "list": "items",
    "range": "rows",
    "progress": "items",
    "scoreboard": "entries",
    "badges": "badges",
    "instructions": "steps",
    "file": "url",
    # Os dois que nascem no agente: as fontes da busca e o botão do "só no app".
    "sources": "sources",
    "app_only": "tool",
}


def artefato(estruturado: dict[str, Any] | None) -> dict[str, Any] | None:
    """O artefato normalizado, ou `None` quando a carga não é um dos formatos.

    ⚠️ **Presença** da chave, e não verdade do conteúdo: "nenhuma refeição no
    período" é um relatório legítimo, e uma métrica de valor zero também. Exigir
    conteúdo transformaria os dois em cartão que não aparece, sem erro nenhum.
    """
    if not isinstance(estruturado, dict) or not estruturado:
        return None
    tipo = estruturado.get("kind")
    if not isinstance(tipo, str) or tipo not in CAMPO_OBRIGATORIO:
        return None
    if CAMPO_OBRIGATORIO[tipo] not in estruturado:
        return None
    return {**estruturado, "kind": tipo}


__all__ = ["CAMPO_OBRIGATORIO", "artefato"]
