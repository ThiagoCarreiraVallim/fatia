"""Bearer das contas de avaliação do eval da fronteira de tools.

O runner conversa com o `/mcp` como uma pessoa de verdade: o `/mcp` valida JWT
pelo JWKS do Logto, e não há — de propósito — emissor de teste que a API aceite.
Cada persona do conjunto de tarefas é uma conta real do Logto de desenvolvimento,
criada por `packages/db/prisma/eval-contas.ts`, com um *personal access token*
de 30 dias.

Um access token do Logto vale uma hora, e uma rodada do eval leva a noite. Por
isso o PAT é trocado (token exchange, RFC 8693) por um access token da API, e a
troca é refeita quando o token está perto de vencer — nunca no meio de uma
tarefa por causa de um 401.

Duas travas, pelo mesmo motivo da trava de banco local do seed: o PAT é uma
credencial de longa duração, e errar a variável de ambiente é o jeito mais curto
de o eval rodar como outra pessoa.

- o Logto tem de ser local;
- o token trocado tem de trazer o `sub` declarado para aquela persona, e o `aud`
  da API. Um PAT de outra conta colado no lugar errado é recusado antes da
  primeira chamada ao `/mcp`.
"""

from __future__ import annotations

import base64
import json
import os
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

GRANT_TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange"
TIPO_PAT = "urn:logto:token-type:personal_access_token"

#: Troca de novo quando faltar menos que isto para vencer. Uma tarefa do eval
#: tem teto de alguns minutos; dois de margem cobrem uma tarefa que começa com o
#: token quase no fim.
MARGEM_DE_RENOVACAO_S = 120.0

PERSONAS: tuple[str, ...] = ("usuario", "profissional")

HOSTS_LOCAIS = frozenset({"localhost", "127.0.0.1", "::1", "logto"})


class ContaDeAvaliacaoError(Exception):
    """Configuração ou troca de token das contas de avaliação que não fecha."""


@dataclass(frozen=True)
class ContaDeAvaliacao:
    persona: str
    sub: str
    pat: str


@dataclass(frozen=True)
class _TokenEmCache:
    valor: str
    vence_em: float


def _claims(token: str) -> dict[str, object]:
    """O payload do JWT, **sem** verificar assinatura.

    Quem verifica é a API, pelo JWKS. Aqui a leitura só serve para recusar cedo
    um token de outra conta — que a API aceitaria, porque ele é válido.
    """
    partes = token.split(".")
    if len(partes) != 3:
        raise ContaDeAvaliacaoError("O Logto devolveu um access token que não é JWT.")
    corpo = partes[1] + "=" * (-len(partes[1]) % 4)
    claims: dict[str, object] = json.loads(base64.urlsafe_b64decode(corpo))
    return claims


class TokensDeAvaliacao:
    """Um access token válido por persona, trocado do PAT e renovado sozinho."""

    def __init__(
        self,
        *,
        logto_endpoint: str,
        app_id: str,
        app_secret: str,
        audience: str,
        contas: Mapping[str, ContaDeAvaliacao],
        transport: httpx.AsyncBaseTransport | None = None,
        relogio: Callable[[], float] = time.monotonic,
    ) -> None:
        endpoint = logto_endpoint.rstrip("/")
        host = urlparse(endpoint).hostname
        if host not in HOSTS_LOCAIS:
            raise ContaDeAvaliacaoError(
                "As contas de avaliação só existem em Logto local; "
                f"LOGTO_ENDPOINT aponta para {host}."
            )
        self._url_token = f"{endpoint}/oidc/token"
        self._audience = audience
        self._contas = dict(contas)
        self._relogio = relogio
        self._cache: dict[str, _TokenEmCache] = {}
        self._client = httpx.AsyncClient(
            timeout=15.0, auth=httpx.BasicAuth(app_id, app_secret), transport=transport
        )

    @classmethod
    def do_ambiente(
        cls,
        env: Mapping[str, str] | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> TokensDeAvaliacao:
        """Lê as variáveis que `eval-contas.ts` imprime, mais as do Logto que a API já usa."""
        fonte = os.environ if env is None else env

        def exigir(nome: str) -> str:
            valor = fonte.get(nome, "").strip()
            if not valor:
                raise ContaDeAvaliacaoError(
                    f"{nome} não definido. Rode `pnpm db:eval:contas` e cole as linhas no .env."
                )
            return valor

        return cls(
            logto_endpoint=exigir("LOGTO_ENDPOINT"),
            app_id=exigir("EVAL_LOGTO_APP_ID"),
            app_secret=exigir("EVAL_LOGTO_APP_SECRET"),
            audience=exigir("LOGTO_AUDIENCE"),
            contas={
                persona: ContaDeAvaliacao(
                    persona=persona,
                    sub=exigir(f"EVAL_SUB_{persona.upper()}"),
                    pat=exigir(f"EVAL_PAT_{persona.upper()}"),
                )
                for persona in PERSONAS
            },
            transport=transport,
        )

    def sub(self, persona: str) -> str:
        return self._conta(persona).sub

    async def bearer(self, persona: str) -> str:
        conta = self._conta(persona)
        em_cache = self._cache.get(persona)
        if em_cache is not None and em_cache.vence_em - self._relogio() > MARGEM_DE_RENOVACAO_S:
            return em_cache.valor

        antes = self._relogio()
        resposta = await self._client.post(
            self._url_token,
            data={
                "grant_type": GRANT_TOKEN_EXCHANGE,
                "subject_token": conta.pat,
                "subject_token_type": TIPO_PAT,
                "resource": self._audience,
            },
        )
        if resposta.status_code != 200:
            raise ContaDeAvaliacaoError(
                f"O Logto recusou a troca do PAT da persona {persona}: "
                f"{resposta.status_code} {resposta.text[:200]}"
            )
        corpo = resposta.json()
        token = str(corpo["access_token"])

        claims = _claims(token)
        if claims.get("sub") != conta.sub:
            raise ContaDeAvaliacaoError(
                f"O PAT da persona {persona} é da conta {claims.get('sub')}, e não da "
                f"{conta.sub} declarada em EVAL_SUB_{persona.upper()}."
            )
        if claims.get("aud") != self._audience:
            raise ContaDeAvaliacaoError(
                f"O token trocado tem aud {claims.get('aud')!r}; a API espera {self._audience!r}."
            )

        self._cache[persona] = _TokenEmCache(
            valor=token, vence_em=antes + float(corpo.get("expires_in", 0))
        )
        return token

    async def aclose(self) -> None:
        await self._client.aclose()

    def _conta(self, persona: str) -> ContaDeAvaliacao:
        conta = self._contas.get(persona)
        if conta is None:
            raise ContaDeAvaliacaoError(
                f"Persona {persona!r} sem conta de avaliação; as que existem são "
                f"{', '.join(sorted(self._contas))}."
            )
        return conta


__all__ = [
    "MARGEM_DE_RENOVACAO_S",
    "PERSONAS",
    "ContaDeAvaliacao",
    "ContaDeAvaliacaoError",
    "TokensDeAvaliacao",
]
