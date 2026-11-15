"""Saída da leitura do rótulo por foto (#375, #333), validada.

Mesma fronteira de `recognized_meal.py`: o texto do modelo vira dado aqui ou vira
`AIResponseUnparseable`. A regra própria do rótulo é que **campo não lido é
`None`, nunca zero**: um zero inventado entra no alimento da pessoa com cara de
valor do rótulo, e o erro não se anuncia nunca mais.
"""

import math
from typing import Literal

from pydantic import BaseModel, ValidationError, field_validator

from ..providers.errors import AIResponseUnparseable
from .recognized_meal import first_json_object

MAX_NOME = 160
MAX_NOTA = 280
MAX_PORCAO_G = 2_000

_NUMEROS = ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg")


def _numero_ou_none(valor: object) -> float | None:
    """Número finito e não negativo, ou `None`.

    Um campo estranho (negativo, texto, infinito) some sozinho em vez de derrubar a
    leitura inteira num 502: o resto do rótulo continua útil, e a pessoa completa
    o campo vazio olhando a embalagem. O `apps/api` confere de novo.
    """
    if isinstance(valor, bool) or not isinstance(valor, int | float):
        return None
    numero = float(valor)
    return numero if math.isfinite(numero) and numero >= 0 else None


class LabelReading(BaseModel):
    """A tabela nutricional como o modelo a leu. **Ainda não é alimento.**

    `per` diz a base dos números: `100g` quando o rótulo tem a coluna por 100 g
    (o rótulo brasileiro novo tem), senão `serving`, por porção de
    `serving_grams`. Quem converte e confere é a pessoa, no formulário do app.
    """

    model_config = {"extra": "ignore"}

    name: str | None = None
    per: Literal["serving", "100g"] = "100g"
    serving_grams: float | None = None
    kcal: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    fiber_g: float | None = None
    sodium_mg: float | None = None
    note: str | None = None

    @field_validator("name", "note", mode="before")
    @classmethod
    def _texto_cortado(cls, valor: object, info: object) -> str | None:
        if not isinstance(valor, str):
            return None
        limpo = " ".join(valor.split())
        teto = MAX_NOME if getattr(info, "field_name", "") == "name" else MAX_NOTA
        return limpo[:teto] or None

    @field_validator(*_NUMEROS, mode="before")
    @classmethod
    def _numero(cls, valor: object) -> float | None:
        return _numero_ou_none(valor)

    @field_validator("serving_grams", mode="before")
    @classmethod
    def _porcao(cls, valor: object) -> float | None:
        numero = _numero_ou_none(valor)
        return numero if numero is not None and 0 < numero <= MAX_PORCAO_G else None


def parse_label_reading(texto: str) -> LabelReading:
    """Texto do modelo → `LabelReading`, ou `AIResponseUnparseable`. Função pura."""
    bruto = first_json_object(texto)
    if bruto is None:
        raise AIResponseUnparseable(
            "O modelo de visão respondeu em prosa, sem nenhum objeto JSON, ao ler o rótulo."
        )
    try:
        return LabelReading.model_validate(bruto)
    except ValidationError as exc:
        # Só a contagem: o dump carregaria o nome do produto para o log.
        raise AIResponseUnparseable(
            f"O JSON do rótulo não tem a forma esperada ({exc.error_count()} campo(s) inválido(s))."
        ) from exc
