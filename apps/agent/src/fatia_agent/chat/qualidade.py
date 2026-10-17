"""Cercas, validação da resposta, reflexão e o resumo do orçamento — sem chamar modelo.

Tudo aqui é regra, e não um segundo LLM julgando o primeiro: o custo de cada
volta extra é da Fatia (ADR 018), e as falhas que valem uma volta extra são
poucas e reconhecíveis por texto.
"""

import re
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from ..prompts.chat_pt_br import cercar

# Duas falhas seguidas da mesma tool: na terceira, o modelo está insistindo no
# mesmo argumento errado, e a volta seguinte é dinheiro e tempo de quem espera.
LIMIAR_DE_FALHAS = 2

# Uma volta de correção por turno. Duas viram pingue-pongue entre validar e
# reescrever — e a pessoa lendo três versões da mesma resposta.
MAX_REVALIDACOES = 1

# As reflexões que ficam no prompt. Elas corrigem a volta seguinte; as antigas só
# ocupam janela.
MAX_REFLEXOES = 2

_FORA_DO_PAPEL = re.compile(
    r"\bcomo (?:uma? )?(?:ia|intelig[êe]ncia artificial|modelo de linguagem)\b", re.IGNORECASE
)
_UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)


def validar_resposta(texto: str, nomes_de_tools: Iterable[str] = ()) -> dict[str, Any]:
    """O que reprova uma resposta final, com o motivo que vira reflexão.

    - vazia: a tela ficaria com um balão em branco;
    - fora do papel ("como uma IA, não posso…"): o assistente da Fatia não se
      apresenta como modelo genérico;
    - identificador interno cru (UUID): vem do resultado de uma tool, e para quem
      lê é ruído que parece erro;
    - nome interno de ferramenta (`log_meal`): quem conversa não é técnico, e o
      nome só diz algo a quem escreveu a tool.
    """
    problemas: list[str] = []
    if not texto.strip():
        problemas.append("a resposta saiu vazia")
    if _FORA_DO_PAPEL.search(texto):
        problemas.append("a resposta falou de si como uma IA genérica")
    if _UUID.search(texto):
        problemas.append("a resposta mostrou um identificador interno (UUID)")
    citadas = sorted(
        nome for nome in set(nomes_de_tools) if re.search(rf"\b{re.escape(nome)}\b", texto)
    )
    if citadas:
        problemas.append(
            f"a resposta citou o nome interno de uma ferramenta ({', '.join(citadas)}); "
            "diga o que foi feito, como 'registrei o almoço'"
        )
    return {"ok": not problemas, "issues": problemas}


def reflexao_da_validacao(problemas: Iterable[str]) -> str:
    return (
        "A sua última resposta precisa ser refeita: "
        + "; ".join(problemas)
        + ". Reescreva a resposta para a pessoa, em português, sem se apresentar como IA e "
        "sem mostrar identificadores internos — use nomes, datas e números."
    )


def tool_em_falha(falhas: Mapping[str, int]) -> str | None:
    return next((nome for nome, total in falhas.items() if total >= LIMIAR_DE_FALHAS), None)


def reflexao_da_falha(nome: str, titulo: str) -> str:
    return (
        f"A ferramenta {titulo or nome} ({nome}) falhou {LIMIAR_DE_FALHAS} vezes seguidas. Não "
        "a chame de novo com os mesmos argumentos: leia a mensagem de erro e corrija os "
        "argumentos, use outra ferramenta, ou explique à pessoa o que não deu certo."
    )


def resumo_do_trabalho(titulos: Sequence[str]) -> str:
    """O que já foi feito, para a pessoa decidir se continua sem adivinhar."""
    if not titulos:
        return "Ainda não consultei nada."
    unicos = list(dict.fromkeys(titulos))
    return "Até aqui: " + ", ".join(unicos) + "."


def afirmativo(resposta: object) -> bool:
    """A resposta ao "quer que eu continue?". **O default é não**: gastar mais
    precisa de um sim explícito, e não da ausência de um não."""
    if isinstance(resposta, bool):
        return resposta
    if isinstance(resposta, dict):
        return afirmativo(resposta.get("value", resposta.get("continue")))
    return str(resposta or "").strip().lower() in {"sim", "s", "yes", "continuar", "continue"}


__all__ = [
    "LIMIAR_DE_FALHAS",
    "MAX_REFLEXOES",
    "MAX_REVALIDACOES",
    "afirmativo",
    "cercar",
    "reflexao_da_falha",
    "reflexao_da_validacao",
    "resumo_do_trabalho",
    "tool_em_falha",
    "validar_resposta",
]
