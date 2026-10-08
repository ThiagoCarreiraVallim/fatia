"""O nome de uma conversa, a partir da primeira mensagem.

Pelo `stream_chat`, e não pelo `complete`: só ele devolve o `usage`, e um título
sem custo medido contaria na tolerância de chamadas não medidas da cota (#135) —
toda conversa nova gastaria uma.

**Nunca falha.** Um título é enfeite de lista: o provedor fora do ar ou uma
resposta torta viram `None`, e o `apps/api` fica com o título que já tinha (o
recorte da primeira mensagem). Erro de título derrubando conversa seria trocar o
essencial pelo acessório.
"""

import logging
from dataclasses import dataclass

from ..providers.base import TextDelta, ToolChatCapability, TurnEnd, Usage
from ..providers.errors import AIProviderError

logger = logging.getLogger(__name__)

# O que entra no prompt da primeira mensagem. O nome sai da intenção, que está no
# começo; mandar a mensagem inteira pagaria por texto que não muda o nome.
MAX_ENTRADA = 300

MAX_TITULO = 60

SISTEMA = (
    "Dê um nome curto, de no máximo 5 palavras, para uma conversa que começa com a mensagem "
    "abaixo. Português do Brasil, sem aspas, sem ponto final, sem emoji. Responda só o nome."
)


@dataclass(frozen=True)
class Titulo:
    titulo: str | None
    usage: Usage | None


async def gerar_titulo(provider: ToolChatCapability, texto: str) -> Titulo:
    partes: list[str] = []
    usage: Usage | None = None
    try:
        async for pedaco in provider.stream_chat(
            [
                {"role": "system", "content": SISTEMA},
                {"role": "user", "content": texto[:MAX_ENTRADA]},
            ]
        ):
            if isinstance(pedaco, TextDelta):
                partes.append(pedaco.text)
            elif isinstance(pedaco, TurnEnd):
                usage = pedaco.usage
    except AIProviderError as exc:
        logger.warning("Título de conversa não gerado: %s", exc.code)
        return Titulo(titulo=None, usage=usage)

    return Titulo(titulo=_limpo("".join(partes)), usage=usage)


def _limpo(bruto: str) -> str | None:
    """A primeira linha, sem aspas nem pontuação final, no teto da lista."""
    linha = next((parte.strip() for parte in bruto.splitlines() if parte.strip()), "")
    linha = linha.strip("\"'“”«» ").rstrip(".!?:;").strip()
    if not linha:
        return None
    return linha if len(linha) <= MAX_TITULO else linha[: MAX_TITULO - 1].rstrip() + "…"


__all__ = ["MAX_TITULO", "Titulo", "gerar_titulo"]
