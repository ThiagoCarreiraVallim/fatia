"""Casos de rótulo no benchmark de reconhecimento (#375, resto da #333).

O benchmark do prato (#138) mede gramas e kcal contra a balança. O rótulo é
outra pergunta — **o modelo copiou a tabela certo?** — e a resposta certa está
impressa na embalagem. Cada caso traz os valores do rótulo (a coluna por 100 g,
como o produto grava) e o `sha256` da foto, que fica fora do git pelo mesmo
motivo das fotos de prato (`manifest.py`).

A régua: um campo **acerta** quando fica a até 5 % do impresso, ou a até uma
unidade quando o impresso é pequeno (0,4 g de gordura lido como 0 é acerto; 4 g
lido como 0 não). **Campo não lido é erro, nunca acerto por omissão** — e campo
inventado onde o rótulo não tem (fibra num refrigerante) também conta, porque é
exatamente o zero falso que a leitura existe para evitar.

Uso: `python -m fatia_agent.eval.label_cases --manifest <jsonl> --images <dir>
--base-url <url> --model <modelo>`.
"""

import argparse
import asyncio
import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from ..providers.base import VisionCapability
from ..recognition.read_label import read_label
from ..schemas.label_reading import LabelReading
from .manifest import EXTENSOES, ErroDeManifesto

CAMPOS: tuple[str, ...] = ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg")
TOLERANCIA_RELATIVA = 0.05
TOLERANCIA_ABSOLUTA = 1.0


class ValoresDoRotulo(BaseModel):
    """O que está impresso, por 100 g. `None` = o rótulo não traz o campo."""

    model_config = {"extra": "forbid"}

    kcal: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    fiber_g: float | None = Field(default=None, ge=0)
    sodium_mg: float | None = Field(default=None, ge=0)


class CasoDeRotulo(BaseModel):
    model_config = {"extra": "forbid"}

    id: str = Field(min_length=1, max_length=80)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    split: Literal["dev", "eval"]
    condicao: str = Field(min_length=1, max_length=200)
    rotulo: ValoresDoRotulo


@dataclass(frozen=True)
class NotaDoRotulo:
    id: str
    acertos: int
    campos: int
    erros: tuple[str, ...]


def acertou(impresso: float | None, lido: float | None) -> bool:
    """Um campo: ausente nos dois é acerto; ausente em um só é erro."""
    if impresso is None or lido is None:
        return impresso is None and lido is None
    return abs(lido - impresso) <= max(TOLERANCIA_ABSOLUTA, impresso * TOLERANCIA_RELATIVA)


def score_label(caso: CasoDeRotulo, lido: LabelReading) -> NotaDoRotulo:
    """A nota de um caso. Leitura por porção não é convertida aqui: o caso pede 100 g."""
    erros: list[str] = []
    for campo in CAMPOS:
        impresso = getattr(caso.rotulo, campo)
        valor = getattr(lido, campo) if lido.per == "100g" else None
        if not acertou(impresso, valor):
            erros.append(campo)
    return NotaDoRotulo(
        id=caso.id, acertos=len(CAMPOS) - len(erros), campos=len(CAMPOS), erros=tuple(erros)
    )


def carregar_casos(caminho: Path) -> list[CasoDeRotulo]:
    casos: list[CasoDeRotulo] = []
    for numero, linha in enumerate(caminho.read_text(encoding="utf-8").splitlines(), start=1):
        if not linha.strip():
            continue
        try:
            casos.append(CasoDeRotulo.model_validate(json.loads(linha)))
        except ValueError as exc:
            raise ErroDeManifesto(f"{caminho}:{numero}: caso de rótulo inválido") from exc
    return casos


def _foto(caso: CasoDeRotulo, imagens: Path) -> tuple[bytes, str]:
    for extensao, media_type in EXTENSOES.items():
        arquivo = imagens / f"{caso.id}{extensao}"
        if arquivo.is_file():
            conteudo = arquivo.read_bytes()
            if hashlib.sha256(conteudo).hexdigest() != caso.sha256:
                raise ErroDeManifesto(f"{caso.id}: a foto não confere com o sha256 do caso")
            return conteudo, media_type
    raise ErroDeManifesto(f"{caso.id}: foto ausente em {imagens}")


async def run_label_cases(
    provider: VisionCapability, casos: list[CasoDeRotulo], imagens: Path
) -> list[NotaDoRotulo]:
    notas: list[NotaDoRotulo] = []
    for caso in casos:
        conteudo, media_type = _foto(caso, imagens)
        medido = await read_label(provider, conteudo, media_type=media_type)
        notas.append(score_label(caso, medido.label))
    return notas


def resumo(notas: list[NotaDoRotulo]) -> str:
    total = sum(n.campos for n in notas)
    certos = sum(n.acertos for n in notas)
    linhas = [f"{n.id}: {n.acertos}/{n.campos} {' '.join(n.erros)}".rstrip() for n in notas]
    taxa = f"{100 * certos / total:.1f}%" if total else "—"
    return "\n".join([*linhas, f"campos certos: {certos}/{total} ({taxa})"])


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - casca de CLI
    from ..providers import build_provider
    from ..settings import AgentSettings

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args(argv)

    async def _rodar() -> list[NotaDoRotulo]:
        settings = AgentSettings(ai_base_url=args.base_url, ai_model_vision=args.model)
        provider = build_provider(settings)
        try:
            return await run_label_cases(provider, carregar_casos(args.manifest), args.images)
        finally:
            await provider.aclose()

    print(resumo(asyncio.run(_rodar())))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
