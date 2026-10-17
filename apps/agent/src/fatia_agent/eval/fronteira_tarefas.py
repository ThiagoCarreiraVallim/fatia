"""O conjunto de tarefas do eval da fronteira de tools, lido e conferido.

O desenho está em `docs/eval-fronteira-de-tools.md`; o contrato de cada tarefa,
em `apps/agent/eval/tarefas-fronteira.jsonl`. Quem confere o conjunto contra o
catálogo real é o `eval-tarefas.spec.ts` do `apps/api` — aqui só se lê, e se
recusa o que o runner não saberia medir.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Literal

Braco = Literal["A", "B"]
Split = Literal["dev", "eval"]

#: `parents[3]` sai de `src/fatia_agent/eval/` até `apps/agent/`.
TAREFAS_PADRAO = Path(__file__).resolve().parents[3] / "eval" / "tarefas-fronteira.jsonl"

_CAMPOS = {
    "id",
    "familia",
    "persona",
    "split",
    "estado",
    "pedido",
    "gabarito_a",
    "gabarito_b",
    "passos_min_a",
    "passos_min_b",
    "argumentos",
    "argumentos_b",
    "armadilha",
    "nota",
}


class ConjuntoInvalido(Exception):
    """O `.jsonl` tem algo que o runner não saberia medir."""


@dataclass(frozen=True)
class Argumentos:
    tool: str
    contem: dict[str, Any]


@dataclass(frozen=True)
class Tarefa:
    id: str
    familia: str
    persona: str
    split: Split
    pedido: str
    gabarito_a: tuple[tuple[str, ...], ...]
    gabarito_b: tuple[tuple[str, ...], ...]
    passos_min_a: int
    passos_min_b: int
    estado: tuple[str, ...] = ()
    argumentos: Argumentos | None = None
    argumentos_b: Argumentos | None = None
    armadilha: str | None = None
    nota: str | None = field(default=None, compare=False)

    def gabarito(self, braco: Braco) -> tuple[tuple[str, ...], ...]:
        return self.gabarito_a if braco == "A" else self.gabarito_b

    def piso(self, braco: Braco) -> int:
        return self.passos_min_a if braco == "A" else self.passos_min_b

    def argumentos_do(self, braco: Braco) -> Argumentos | None:
        return self.argumentos if braco == "A" else self.argumentos_b


def _argumentos(bruto: object) -> Argumentos | None:
    if bruto is None:
        return None
    if not isinstance(bruto, dict) or set(bruto) != {"tool", "contem"}:
        raise ConjuntoInvalido(f"argumentos fora do formato {{tool, contem}}: {bruto!r}")
    return Argumentos(tool=str(bruto["tool"]), contem=dict(bruto["contem"]))


def carregar(caminho: Path = TAREFAS_PADRAO) -> list[Tarefa]:
    tarefas: list[Tarefa] = []
    for numero, linha in enumerate(caminho.read_text(encoding="utf-8").splitlines(), start=1):
        if not linha.strip():
            continue
        bruto: dict[str, Any] = json.loads(linha)
        desconhecidos = set(bruto) - _CAMPOS
        if desconhecidos:
            # Campo escrito errado vira erro agora, e não um gabarito ignorado em silêncio.
            raise ConjuntoInvalido(f"linha {numero}: campo desconhecido {sorted(desconhecidos)}")
        tarefas.append(
            Tarefa(
                id=bruto["id"],
                familia=bruto["familia"],
                persona=bruto["persona"],
                split=bruto["split"],
                pedido=bruto["pedido"],
                gabarito_a=tuple(tuple(v) for v in bruto["gabarito_a"]),
                gabarito_b=tuple(tuple(v) for v in bruto["gabarito_b"]),
                passos_min_a=int(bruto["passos_min_a"]),
                passos_min_b=int(bruto["passos_min_b"]),
                estado=tuple(bruto.get("estado") or ()),
                argumentos=_argumentos(bruto.get("argumentos")),
                argumentos_b=_argumentos(bruto.get("argumentos_b")),
                armadilha=bruto.get("armadilha"),
                nota=bruto.get("nota"),
            )
        )
    return tarefas


def impressao_digital(caminho: Path, split: Split) -> str:
    """`sha256` das linhas do split, na ordem do arquivo, cada uma terminada em `\\n`.

    É a impressão digital registrada no §Congelamento do doc. Do split, e não do
    arquivo: mexer no `dev` não muda o que o `eval` mediu.
    """
    linhas = [
        linha + "\n"
        for linha in caminho.read_text(encoding="utf-8").splitlines()
        if linha.strip() and json.loads(linha)["split"] == split
    ]
    return hashlib.sha256("".join(linhas).encode("utf-8")).hexdigest()


# --- placeholders de data -------------------------------------------------

_LITERAIS_DO_BRACO_B = {"<hoje>": "today", "<ontem>": "yesterday", "<terca>": "tuesday"}


def valores_aceitos(placeholder: str, hoje: date, braco: Braco) -> set[str]:
    """O que conta como acerto para um placeholder, no dia `hoje` do fuso da conta.

    `<terca>` é a terça mais recente antes de hoje; rodando numa terça, hoje
    também vale — "o que almocei na terça" dito numa terça é ambíguo, e o
    comparador não pune a leitura razoável. No braço B, que resolve data no
    servidor, o literal (`yesterday`) vale tanto quanto a data.
    """
    if placeholder == "<hoje>":
        datas = {hoje}
    elif placeholder == "<ontem>":
        datas = {hoje - timedelta(days=1)}
    elif placeholder == "<terca>":
        recuo = (hoje.weekday() - 1) % 7 or 7
        datas = {hoje - timedelta(days=recuo)}
        if hoje.weekday() == 1:
            datas.add(hoje)
    else:
        raise ConjuntoInvalido(f"placeholder desconhecido: {placeholder}")

    aceitos = {d.isoformat() for d in datas}
    if braco == "B":
        aceitos.add(_LITERAIS_DO_BRACO_B[placeholder])
    return aceitos


def e_placeholder(valor: object) -> bool:
    return isinstance(valor, str) and valor in _LITERAIS_DO_BRACO_B


__all__ = [
    "TAREFAS_PADRAO",
    "Argumentos",
    "Braco",
    "ConjuntoInvalido",
    "Split",
    "Tarefa",
    "carregar",
    "e_placeholder",
    "impressao_digital",
    "valores_aceitos",
]
