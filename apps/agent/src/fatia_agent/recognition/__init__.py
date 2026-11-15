"""Reconhecimento a partir de mídia: foto de refeição (#139) e rótulo (#375)."""

from .read_label import MeasuredLabel, read_label
from .recognize_meal import MEDIA_TYPES_ACEITOS, MeasuredMeal, recognize_meal

__all__: list[str] = [
    "MEDIA_TYPES_ACEITOS",
    "MeasuredLabel",
    "MeasuredMeal",
    "read_label",
    "recognize_meal",
]
