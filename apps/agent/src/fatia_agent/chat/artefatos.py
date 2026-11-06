"""A carga tipada de uma tool, a caminho da tela (evento `artifact`).

Vem do `structuredContent` do MCP — o canal que **não** entra no contexto do
modelo: é o que faz o número chegar inteiro à tela sem passar pelos olhos de
quem poderia transcrevê-lo errado, e sem queimar janela nos turnos seguintes.

Os formatos são uma lista fechada. Um `kind` que a tela não conhece não vira um
cartão vazio: vira `report`, que qualquer carga com colunas e linhas preenche. E
cada formato se reconhece por um campo obrigatório **diferente** — uma checagem
única por `columns` descartaria em silêncio tudo que não fosse tabela.
"""

from typing import Any

CAMPO_OBRIGATORIO = {
    "report": "columns",
    "metric": "value",
    "timeline": "events",
    "comparison": "items",
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
    if tipo not in CAMPO_OBRIGATORIO:
        tipo = "report"
    if CAMPO_OBRIGATORIO[tipo] not in estruturado:
        return None
    return {**estruturado, "kind": tipo}


__all__ = ["CAMPO_OBRIGATORIO", "artefato"]
