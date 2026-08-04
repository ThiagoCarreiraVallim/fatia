"""Reconhecimento a partir de mídia. Hoje só foto de refeição (#139)."""

from .recognize_meal import MEDIA_TYPES_ACEITOS, recognize_meal

__all__: list[str] = ["MEDIA_TYPES_ACEITOS", "recognize_meal"]
