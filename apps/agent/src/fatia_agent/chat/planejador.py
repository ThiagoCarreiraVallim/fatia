"""O plano de um pedido de vários passos — opcional, e desligado por padrão.

Custa uma chamada ao modelo **a mais por turno**, antes da primeira palavra da
resposta. Num gateway pago isso é dinheiro; num modelo local de 9B em CPU são
segundos de tela parada. Por isso é `AGENT_CHAT_PLANNER=true` e não o default:
quem liga é quem roda um modelo que aguenta.

O plano é pedido em JSON por texto, e não por saída estruturada do provedor: o
provedor da Fatia é OpenAI-compatível genérico (ADR 015), e `response_format`
não existe em todo servidor que a instância auto-hospedada pode apontar. Um
plano que não parseia é plano nenhum — a conversa segue sem ele.
"""

import json
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from ..providers.base import TextDelta, ToolChatCapability, TurnEnd, Usage

MIN_PASSOS = 2
MAX_PASSOS = 5

SISTEMA = (
    "Você planeja o trabalho de um assistente de nutrição e treino. Dado o pedido da pessoa, "
    'responda SÓ um JSON no formato {"steps": ["passo curto", ...]}. Use de 2 a 5 passos quando '
    "o pedido exigir várias consultas ou registros (ex.: comparar semanas, montar um resumo). "
    'Para pedido simples — uma pergunta, um registro — responda {"steps": []}. Passos em '
    "português, no imperativo, com até 6 palavras, sem nome de ferramenta."
)

_JSON = re.compile(r"\{.*\}", re.DOTALL)


@dataclass(frozen=True)
class Plano:
    passos: list[dict[str, Any]] = field(default_factory=list)
    usage: Usage | None = None


def ler_plano(bruto: str) -> list[dict[str, Any]]:
    achado = _JSON.search(bruto)
    if not achado:
        return []
    try:
        lido: object = json.loads(achado.group(0))
    except ValueError:
        return []
    passos = lido.get("steps") if isinstance(lido, dict) else None
    if not isinstance(passos, list):
        return []
    titulos = [str(p).strip()[:80] for p in passos if isinstance(p, str) and p.strip()]
    if len(titulos) < MIN_PASSOS:
        return []
    return [
        {"id": str(indice + 1), "title": titulo, "status": "pending"}
        for indice, titulo in enumerate(titulos[:MAX_PASSOS])
    ]


async def planejar(provider: ToolChatCapability, conversa: Sequence[dict[str, Any]]) -> Plano:
    partes: list[str] = []
    usage: Usage | None = None
    async for pedaco in provider.stream_chat([{"role": "system", "content": SISTEMA}, *conversa]):
        if isinstance(pedaco, TextDelta):
            partes.append(pedaco.text)
        elif isinstance(pedaco, TurnEnd):
            usage = pedaco.usage
    return Plano(passos=ler_plano("".join(partes)), usage=usage)


def com_status(plano: Sequence[dict[str, Any]], passo_id: str, status: str) -> list[dict[str, Any]]:
    """O plano inteiro, com um passo em outro estado — a lista sai **inteira** no
    evento: quem entrou depois do primeiro `plan` não remonta a lista de um delta."""
    return [{**p, "status": status} if p["id"] == passo_id else dict(p) for p in plano]


__all__ = ["MAX_PASSOS", "MIN_PASSOS", "Plano", "com_status", "ler_plano", "planejar"]
