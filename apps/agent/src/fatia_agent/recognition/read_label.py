"""Foto da tabela nutricional → valores para conferir (#375, #333).

Uma chamada e uma validação, como `recognize_meal.py`. **A imagem não é escrita
em lugar nenhum**: chega em memória, vai ao provedor e some com a requisição
(ADR 020; ADR 038, item 4 — rótulo não vira refeição, então não fica).
"""

from dataclasses import dataclass

from ..prompts.read_label_pt_br import INSTRUCAO, SISTEMA
from ..providers.base import Usage, VisionCapability
from ..schemas.label_reading import LabelReading, parse_label_reading

# Em constante pelo mesmo motivo do `PROMPT` do prato: o benchmark grava o sha256.
PROMPT = f"{SISTEMA}\n\n{INSTRUCAO}"


@dataclass(frozen=True)
class MeasuredLabel:
    """O que o rótulo rendeu e o que a chamada custou."""

    label: LabelReading
    usage: Usage | None


async def read_label(
    provider: VisionCapability,
    image: bytes,
    *,
    media_type: str = "image/jpeg",
) -> MeasuredLabel:
    """Lê a tabela pela capacidade de visão e valida a saída."""
    resposta = await provider.describe(image, prompt=PROMPT, media_type=media_type)
    return MeasuredLabel(label=parse_label_reading(resposta.text), usage=resposta.usage)
