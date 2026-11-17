"""`open_in_app`: o "só no app" do chat (#384, prancha IA-Ferramentas).

As ações sem volta (apagar, sair de comunidade, compartilhar dados) são restritas: a IA nunca
as executa (ADR 022). Antes, pedir uma delas dava um parágrafo explicando onde ficava a tela.
Agora a IA chama esta ferramenta, que **não faz nada** além de pôr na tela um cartão com o
botão que abre a tela certa — o caminho de cada uma é declarado na própria tool do `apps/api`
(`appOnly`) e servido em `GET /chat/tool-catalog`; aqui só vai o nome e os ids.

O `enum` é o recorte restrito do catálogo que o `/mcp` anunciou neste turno: um nome fora dele
é recusado, e nada aqui chama o `/mcp`.
"""

from collections.abc import Iterable, Sequence
from typing import Any

from .mcp_client import McpToolInfo

NAME = "open_in_app"

MAX_PARAMS = 4
MAX_PARAM_CHARS = 80

SHOWN = (
    "Mostrei à pessoa o botão que abre a tela do app para isso. A ação NÃO foi feita: diga "
    "que ela faz por lá, sem prometer que você fez."
)


def definition(restricted: Sequence[McpToolInfo]) -> dict[str, Any] | None:
    """A definição da tool, ou `None` quando o catálogo não tem ação restrita."""
    nomes = sorted(tool.name for tool in restricted)
    if not nomes:
        return None
    return {
        "type": "function",
        "function": {
            "name": NAME,
            "description": (
                "Quando a pessoa pede algo que só pode ser feito no app — apagar um registro, "
                "sair ou entrar numa comunidade, compartilhar dados —, use esta ferramenta para "
                "mostrar o botão que abre a tela certa. Ela NÃO faz a ação. Passe a ação e, em "
                "`params`, os ids que você já tem (ex.: o id da refeição)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "tool": {"type": "string", "enum": nomes},
                    "params": {
                        "type": "object",
                        "description": 'Ids que a tela usa, como {"id": "…"}. Opcional.',
                        "additionalProperties": {"type": "string"},
                    },
                },
                "required": ["tool"],
            },
        },
    }


def _params(bruto: object) -> dict[str, str]:
    """Só pares de texto curto: é o que vira pedaço de rota, e nada mais entra."""
    if not isinstance(bruto, dict):
        return {}
    saida: dict[str, str] = {}
    for chave, valor in bruto.items():
        if len(saida) >= MAX_PARAMS:
            break
        if isinstance(valor, bool) or not isinstance(valor, str | int):
            continue
        texto = str(valor).strip()
        if isinstance(chave, str) and texto and len(texto) <= MAX_PARAM_CHARS:
            saida[chave] = texto
    return saida


def card(args: dict[str, Any], restricted: Iterable[McpToolInfo]) -> dict[str, Any] | None:
    """O artefato `app_only` da chamada, ou `None` se a ação não é uma restrita do catálogo."""
    por_nome = {tool.name: tool for tool in restricted}
    nome = args.get("tool")
    tool = por_nome.get(nome) if isinstance(nome, str) else None
    if tool is None:
        return None
    return {
        "kind": "app_only",
        "tool": tool.name,
        "title": tool.title or tool.name,
        "params": _params(args.get("params")),
    }


def refusal(args: dict[str, Any]) -> str:
    return (
        f"'{args.get('tool')}' não é uma ação que só o app faz. Use esta ferramenta só para "
        "as ações do enum."
    )


__all__ = ["NAME", "SHOWN", "card", "definition", "refusal"]
