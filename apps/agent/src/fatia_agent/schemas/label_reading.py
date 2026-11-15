"""Saída da leitura do rótulo por foto (#375, #333), validada.

Mesma fronteira de `recognized_meal.py`: o texto do modelo vira dado aqui ou vira
`AIResponseUnparseable`. A regra própria do rótulo é que **campo não lido é
`None`, nunca zero**: um zero inventado entra no alimento da pessoa com cara de
valor do rótulo, e o erro não se anuncia nunca mais.
"""

from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from ..providers.errors import AIResponseUnparseable
from .recognized_meal import first_json_object

MAX_NOME = 160


class LabelReading(BaseModel):
    """A tabela nutricional como o modelo a leu. **Ainda não é alimento.**

    `per` diz a base dos números: `100g` quando o rótulo tem a coluna por 100 g
    (o rótulo brasileiro novo tem), senão `serving`, por porção de
    `serving_grams`. Quem converte e confere é a pessoa, no formulário do app.
    """

    model_config = {"extra": "ignore"}

    name: str | None = Field(default=None, max_length=MAX_NOME)
    per: Literal["serving", "100g"] = "100g"
    serving_grams: float | None = Field(default=None, gt=0, le=2_000)
    kcal: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    fiber_g: float | None = Field(default=None, ge=0)
    sodium_mg: float | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=280)

    @field_validator("name")
    @classmethod
    def _sem_espaco_sobrando(cls, valor: str | None) -> str | None:
        if valor is None:
            return None
        limpo = " ".join(valor.split())
        return limpo or None


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
