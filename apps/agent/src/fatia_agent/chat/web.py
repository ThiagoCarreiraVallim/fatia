"""`web_search`: a busca na web do chat (#384), pelo OpenRouter e com aceite.

Ferramenta local, como `ask_user`: não passa pelo `/mcp`, porque não lê dado da pessoa. Ao
contrário de toda outra ferramenta, a pergunta **sai** para um terceiro (o motor de busca do
OpenRouter, Exa), e a retenção zero do roteamento não cobre esse motor. Daí as três travas:

- **Só a pergunta sai.** `clean_query` tira e-mail, telefone e documento antes; nome, histórico
  e sistema nunca entram no corpo (`OpenAICompatProvider.web_search`).
- **Aceite antes da primeira.** O `apps/api` manda o modo (`off | ask | on`) a cada turno. Em
  `ask`, a chamada para no portão como `web_consent`; o sim da tela só busca se a API, na
  retomada, já tiver o aceite gravado (`on`).
- **O que volta é dado de terceiro.** O resultado chega ao modelo cercado como qualquer tool,
  e as fontes vão à tela como artefato `sources`, sem passar pelo texto do modelo.
"""

import re
from collections.abc import Awaitable, Callable
from typing import Any, Literal

from ..providers.base import WebSearchResult

NAME = "web_search"

WebSearchMode = Literal["off", "ask", "on"]
WebSearcher = Callable[[str], Awaitable[WebSearchResult]]

MAX_QUERY = 200
MAX_SNIPPET = 600

CONSENT_PROMPT = "Posso buscar na web?"

DECLINED = "A pessoa preferiu não buscar na web. Responda sem a busca, com o que já sabe."
NO_RESULTS = (
    "A busca na web não achou nada confiável sobre isso. Diga à pessoa que não encontrou "
    "fonte confiável, sem inventar."
)
UNAVAILABLE = (
    "A busca na web está indisponível agora. Diga que não conseguiu buscar e responda só com "
    "o que já sabe."
)
OFF = "A busca na web está desligada. Responda sem ela."
EMPTY_QUERY = "Faltou a pergunta da busca. Mande só a pergunta, em poucas palavras."

DEFINITION: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": NAME,
        "description": (
            "Busca na web informação pública e atual que NÃO está nos dados da pessoa: o valor "
            "nutricional de um produto ou prato, uma recomendação oficial, como fazer um "
            "exercício. Mande só a pergunta, curta — nunca nome, idade, peso, e-mail ou "
            "qualquer dado da pessoa. Não use para os dados dela: para isso há as outras "
            "ferramentas."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "A pergunta, sem dado pessoal. Ex.: 'calorias do açaí'.",
                }
            },
            "required": ["query"],
        },
    },
}

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
# Telefone, CPF, cartão: qualquer sequência com 8 dígitos ou mais, com ou sem separador.
_NUMERO_LONGO = re.compile(r"\+?\(?\d[\d\s().-]{6,}\d")
_ESPACOS = re.compile(r"\s+")
_ROTULOS_SOLTOS = re.compile(r"\b(cpf|rg|cnpj|tel(efone)?|celular|e-?mail)\b[:\s]*", re.IGNORECASE)


def clean_query(query: object) -> str:
    """A pergunta sem e-mail, telefone nem documento, em uma linha e com teto.

    Defesa em profundidade: a descrição da tool já pede só a pergunta, mas modelo pequeno
    copia a fala inteira. O que tem cara de dado pessoal sai; o resto fica — tirar nome
    próprio levaria junto o nome do prato.
    """
    texto = str(query or "")
    texto = _EMAIL.sub(" ", texto)
    texto = _NUMERO_LONGO.sub(lambda m: " " if sum(c.isdigit() for c in m[0]) >= 8 else m[0], texto)
    texto = _ROTULOS_SOLTOS.sub(" ", texto)
    texto = _ESPACOS.sub(" ", texto).strip(" ,;—-")
    return texto[:MAX_QUERY].strip()


def text_for_model(result: WebSearchResult) -> str:
    """As fontes como o modelo as lê: título, endereço e o trecho que o motor achou."""
    blocos = [
        f"[{indice}] {fonte.title} ({fonte.url})\n{fonte.content[:MAX_SNIPPET]}".rstrip()
        for indice, fonte in enumerate(result.sources, start=1)
    ]
    return "\n\n".join(blocos)


def sources_artifact(query: str, result: WebSearchResult) -> dict[str, Any]:
    """O cartão de fontes da tela: só título, endereço e domínio — o trecho fica com o modelo."""
    return {
        "kind": "sources",
        "query": query,
        "sources": [
            {"title": fonte.title, "url": fonte.url, "domain": fonte.domain}
            for fonte in result.sources
        ],
    }


__all__ = [
    "CONSENT_PROMPT",
    "DECLINED",
    "DEFINITION",
    "EMPTY_QUERY",
    "NAME",
    "NO_RESULTS",
    "OFF",
    "UNAVAILABLE",
    "WebSearchMode",
    "WebSearcher",
    "clean_query",
    "sources_artifact",
    "text_for_model",
]
