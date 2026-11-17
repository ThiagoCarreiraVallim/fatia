"""`web_search`: a busca na web do chat (#384), pelo OpenRouter e com aceite.

Ferramenta local, como `ask_user`: não passa pelo `/mcp`, porque não lê dado da pessoa. Ao
contrário de toda outra ferramenta, a pergunta **sai** para um terceiro (o motor de busca do
OpenRouter, Exa), e a retenção zero do roteamento não cobre esse motor. Daí as três travas:

- **Só a pergunta sai, e quem a escreve não vê nada além dela.** O modelo da conversa só
  *pede* a busca (a tool não tem argumento). A pergunta é escrita numa chamada à parte
  (`write_search_query`) que recebe só a última fala da pessoa, sem a citação — nada de
  memória, perfil, histórico, resultado de tool ou conteúdo de terceiro. Depois, `clean_query`
  tira e-mail, telefone e documento. Nome, histórico e sistema nunca entram no corpo da busca
  (`OpenAICompatProvider.web_search`).
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
# O modelo que escreve a pergunta da busca a partir da última fala da pessoa, e de nada mais.
QueryWriter = Callable[[str], Awaitable[str]]

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
EMPTY_QUERY = (
    "Não deu para montar a busca a partir da mensagem da pessoa. Responda sem ela, com o que "
    "já sabe."
)

# O sistema da chamada que escreve a pergunta. Ela só recebe a fala da pessoa.
QUERY_SYSTEM = (
    "Transforme a mensagem em uma consulta curta para um buscador na web, em português, com no "
    "máximo 12 palavras. Só o assunto público: nunca nome, idade, peso, endereço, contato, "
    "documento ou saúde de alguém. Responda só com a consulta, sem aspas."
)

# O modelo de mentira do lançamento da busca na cota: a unidade é a busca, não o token.
CHARGE_MODEL = "openrouter-web-search"

DEFINITION: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": NAME,
        "description": (
            "Busca na web informação pública e atual que NÃO está nos dados da pessoa: o valor "
            "nutricional de um produto ou prato, uma recomendação oficial, como fazer um "
            "exercício. Sem argumento: a pergunta é montada a partir da última mensagem da "
            "pessoa. Não use para os dados dela: para isso há as outras ferramentas."
        ),
        "parameters": {"type": "object", "properties": {}},
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


def latest_user_text(texto: str) -> str:
    """A fala da pessoa sem a citação (`> …` no começo, ver `withQuote` no api-client).

    A citação é um trecho de resposta do assistente, que pode trazer dado da pessoa ou de tool.
    """
    linhas = texto.split("\n")
    i = 0
    while i < len(linhas) and linhas[i].startswith(">"):
        i += 1
    return "\n".join(linhas[i:]).strip()


async def build_query(write_query: QueryWriter | None, user_text: str) -> str:
    """A pergunta da busca: escrita por quem só vê a fala da pessoa, e limpa depois."""
    fala = latest_user_text(user_text)
    if write_query is None or not fala:
        return ""
    return clean_query(await write_query(fala[: MAX_QUERY * 4]))
