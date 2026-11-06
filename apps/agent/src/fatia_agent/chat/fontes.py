"""As fontes da busca na web, como uma linha de links no fim da resposta.

A busca é a tool de servidor do gateway (`allowed_models.WEB_SEARCH_TOOL`): não
passa pelo `/mcp`, não tem chamada de tool e por isso não tem cartão onde
pendurar um artefato. As páginas entram no texto, em markdown — que é o que fica
gravado e volta igual depois de reabrir a conversa —, e os dois apps já desenham
link de markdown (o do celular só abre `https:`).
"""

from collections.abc import Sequence
from urllib.parse import quote, urlsplit

from ..providers.base import WebSource

# Mais que isso é uma bibliografia, e não uma linha de fontes.
MAX_FONTES = 5


def dominio(url: str) -> str:
    """O nome que o link mostra: o domínio, sem `www.`."""
    host = urlsplit(url).hostname or url
    return host.removeprefix("www.")


def _url_segura(url: str) -> str:
    """A URL sem o que fecharia o link de markdown antes da hora (`)`, espaço)."""
    return quote(url, safe=":/?#[]@!$&'*+,;=%~.-_")


def linha_de_fontes(fontes: Sequence[WebSource]) -> str:
    """`\\n\\nFontes: [dominio](url) · …`, ou vazio sem fonte nenhuma.

    Um link por domínio: três páginas do mesmo site viram uma, que é o que a
    pessoa precisa para saber de onde veio.
    """
    vistos: set[str] = set()
    links: list[str] = []
    for fonte in fontes:
        nome = dominio(fonte.url)
        if nome in vistos:
            continue
        vistos.add(nome)
        links.append(f"[{nome}]({_url_segura(fonte.url)})")
        if len(links) == MAX_FONTES:
            break
    return f"\n\nFontes: {' · '.join(links)}" if links else ""


__all__ = ["MAX_FONTES", "dominio", "linha_de_fontes"]
