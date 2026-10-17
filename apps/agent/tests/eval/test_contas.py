"""Troca de PAT por access token das contas de avaliação — sem rede."""

import base64
import json
from urllib.parse import parse_qs

import httpx
import pytest

from fatia_agent.eval.contas import (
    MARGEM_DE_RENOVACAO_S,
    ContaDeAvaliacao,
    ContaDeAvaliacaoError,
    TokensDeAvaliacao,
)
from tests.support import RecordingTransport

AUD = "https://api.fatia.local"
CONTAS = {
    "usuario": ContaDeAvaliacao(persona="usuario", sub="sub-usuario", pat="pat_usuario"),
    "profissional": ContaDeAvaliacao(persona="profissional", sub="sub-prof", pat="pat_prof"),
}


def _jwt(**claims: object) -> str:
    def parte(obj: object) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    return f"{parte({'alg': 'ES384'})}.{parte(claims)}.assinatura"


def _logto(*, sub_por_pat: dict[str, str] | None = None, aud: str = AUD) -> RecordingTransport:
    subs = sub_por_pat or {"pat_usuario": "sub-usuario", "pat_prof": "sub-prof"}
    emitidos = 0

    def responder(request: httpx.Request) -> httpx.Response:
        nonlocal emitidos
        emitidos += 1
        form = parse_qs(request.content.decode())
        token = _jwt(sub=subs[form["subject_token"][0]], aud=aud, n=emitidos)
        return httpx.Response(200, json={"access_token": token, "expires_in": 3600})

    return RecordingTransport(responder)


class _Relogio:
    def __init__(self) -> None:
        self.agora = 1000.0

    def __call__(self) -> float:
        return self.agora


def _tokens(
    transporte: httpx.AsyncBaseTransport, relogio: _Relogio | None = None
) -> TokensDeAvaliacao:
    return TokensDeAvaliacao(
        logto_endpoint="http://localhost:3001/",
        app_id="app",
        app_secret="segredo",
        audience=AUD,
        contas=CONTAS,
        transport=transporte,
        relogio=relogio or _Relogio(),
    )


async def test_troca_o_pat_pelo_token_da_api_com_o_app_de_troca() -> None:
    transporte = _logto()
    tokens = _tokens(transporte)

    await tokens.bearer("usuario")

    pedido = transporte.requests[-1]
    assert str(pedido.url) == "http://localhost:3001/oidc/token"
    assert pedido.headers["authorization"] == "Basic " + base64.b64encode(b"app:segredo").decode()
    assert parse_qs(pedido.content.decode()) == {
        "grant_type": ["urn:ietf:params:oauth:grant-type:token-exchange"],
        "subject_token": ["pat_usuario"],
        "subject_token_type": ["urn:logto:token-type:personal_access_token"],
        "resource": [AUD],
    }


async def test_reusa_o_token_ate_perto_de_vencer_e_troca_de_novo_depois() -> None:
    transporte = _logto()
    relogio = _Relogio()
    tokens = _tokens(transporte, relogio)

    primeiro = await tokens.bearer("usuario")
    relogio.agora += 3600 - MARGEM_DE_RENOVACAO_S - 1
    assert await tokens.bearer("usuario") == primeiro
    assert len(transporte.requests) == 1

    relogio.agora += 2
    assert await tokens.bearer("usuario") != primeiro
    assert len(transporte.requests) == 2


async def test_cada_persona_tem_o_proprio_token() -> None:
    transporte = _logto()
    tokens = _tokens(transporte)

    await tokens.bearer("usuario")
    await tokens.bearer("profissional")

    assert [parse_qs(r.content.decode())["subject_token"] for r in transporte.requests] == [
        ["pat_usuario"],
        ["pat_prof"],
    ]


async def test_recusa_pat_de_outra_conta_antes_de_chegar_ao_mcp() -> None:
    tokens = _tokens(_logto(sub_por_pat={"pat_usuario": "sub-de-uma-pessoa-real"}))

    with pytest.raises(ContaDeAvaliacaoError, match="sub-de-uma-pessoa-real"):
        await tokens.bearer("usuario")


async def test_recusa_token_com_outra_audiencia() -> None:
    tokens = _tokens(_logto(aud="https://default.logto.app/api"))

    with pytest.raises(ContaDeAvaliacaoError, match="aud"):
        await tokens.bearer("usuario")


async def test_diz_o_que_o_logto_respondeu_quando_ele_recusa() -> None:
    transporte = RecordingTransport(
        lambda _r: httpx.Response(
            400, json={"error": "invalid_grant", "error_description": "expired"}
        )
    )
    tokens = _tokens(transporte)

    with pytest.raises(ContaDeAvaliacaoError, match=r"400.*invalid_grant"):
        await tokens.bearer("usuario")


async def test_persona_sem_conta_e_erro_nomeado() -> None:
    tokens = _tokens(_logto())

    with pytest.raises(ContaDeAvaliacaoError, match="'aluna'"):
        await tokens.bearer("aluna")


def test_so_aceita_logto_local() -> None:
    with pytest.raises(ContaDeAvaliacaoError, match=r"auth\.fatia\.app"):
        TokensDeAvaliacao(
            logto_endpoint="https://auth.fatia.app",
            app_id="app",
            app_secret="segredo",
            audience=AUD,
            contas=CONTAS,
        )


def test_do_ambiente_nomeia_a_variavel_que_falta() -> None:
    env = {
        "LOGTO_ENDPOINT": "http://localhost:3001",
        "LOGTO_AUDIENCE": AUD,
        "EVAL_LOGTO_APP_ID": "app",
        "EVAL_LOGTO_APP_SECRET": "segredo",
        "EVAL_SUB_USUARIO": "sub-usuario",
        "EVAL_PAT_USUARIO": "pat_usuario",
        "EVAL_SUB_PROFISSIONAL": "sub-prof",
    }

    with pytest.raises(ContaDeAvaliacaoError, match="EVAL_PAT_PROFISSIONAL"):
        TokensDeAvaliacao.do_ambiente(env)
