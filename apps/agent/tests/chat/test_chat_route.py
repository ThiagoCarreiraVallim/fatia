"""A rota `/chat`: as duas credenciais, a degradação e o SSE no fio.

O que sai daqui é o que o NestJS repassa e o PWA renderiza (#247). Por isso os
casos afirmam sobre o **texto do fluxo**, e não sobre objetos internos: é o texto
que atravessa três camadas, e é onde a divergência entre elas apareceria.
"""

import httpx
import pytest
from fastapi.testclient import TestClient

from fatia_agent.api import create_app
from fatia_agent.chat.mcp_client import McpClient
from fatia_agent.providers.openai_compat import OpenAICompatProvider

from .support import (
    ProviderRecordingTransport,
    duplo_do_mcp,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
    tool_do_catalogo,
)

TOKEN = "tok-do-usuario-xyz"
BEARER = {"Authorization": f"Bearer {TOKEN}"}

CATALOGO = [
    tool_do_catalogo("list_meals", read_only=True),
    tool_do_catalogo("delete_meal", read_only=False),
]


def app_com(
    settings_factory,
    *,
    turnos,
    mcp_transport: httpx.AsyncBaseTransport | None = None,
    monkeypatch: pytest.MonkeyPatch,
    **overrides: object,
):
    """Sobe a app com os transportes trocados nos dois clientes que a rota monta.

    O `monkeypatch` é sobre `fatia_agent.api`, e não sobre os módulos de origem,
    porque é o `api` que chama `build_provider`/`build_mcp_client` — trocar no
    outro lugar deixaria a rota usando os de verdade e o teste tentaria rede.
    """
    import fatia_agent.api as api_module
    from fatia_agent.providers import build_provider as build_provider_real

    provider_transport = ProviderRecordingTransport(turnos)
    transporte_mcp = mcp_transport if mcp_transport is not None else duplo_do_mcp(catalogo=CATALOGO)

    def build_provider_fake(settings, *, transport=None) -> OpenAICompatProvider:
        return build_provider_real(settings, transport=provider_transport)

    def build_mcp_client_fake(settings, *, bearer, transport=None) -> McpClient:
        from fatia_agent.chat.mcp_client import build_mcp_client as real

        return real(settings, bearer=bearer, transport=transporte_mcp)

    monkeypatch.setattr(api_module, "build_provider", build_provider_fake)
    monkeypatch.setattr(api_module, "build_mcp_client", build_mcp_client_fake)

    client = TestClient(create_app(settings_factory(**overrides)))
    return client, provider_transport, transporte_mcp


def eventos_do_fluxo(texto: str) -> list[tuple[str, str]]:
    """`(nome, dado)` de cada evento do SSE, na ordem em que vieram no fio."""
    achados: list[tuple[str, str]] = []
    nome = ""
    for linha in texto.splitlines():
        if linha.startswith("event: "):
            nome = linha[len("event: ") :]
        elif linha.startswith("data: "):
            achados.append((nome, linha[len("data: ") :]))
    return achados


def test_sem_bearer_a_rota_recusa_com_erro_nomeado(settings_factory, monkeypatch):
    """O agente age em nome de alguém. Sem saber de quem, não há conversa a ter.

    E recusa **antes** de qualquer inferência: uma resposta genérica de LLM já
    custaria dinheiro e não teria acesso a dado nenhum.
    """
    client, provider_transport, mcp_transport = app_com(
        settings_factory, turnos=[[fragmento_de_texto("oi")]], monkeypatch=monkeypatch
    )

    resposta = client.post("/chat", json={"message": "oi"})

    assert resposta.status_code == 401
    erro = resposta.json()["error"]
    assert erro["code"] == "MCP_UNAUTHENTICATED"
    # Nem o provedor nem o /mcp foram acionados.
    assert provider_transport.requests == []
    assert mcp_transport.requests == []


@pytest.mark.parametrize(
    "authorization",
    ["", "tok-sem-esquema", "Basic dXNlcjpwYXNz", "Bearer ", "Bearer    "],
)
def test_authorization_malformado_tambem_recusa(settings_factory, monkeypatch, authorization: str):
    client, _, _ = app_com(
        settings_factory, turnos=[[fragmento_de_texto("oi")]], monkeypatch=monkeypatch
    )

    resposta = client.post(
        "/chat", json={"message": "oi"}, headers={"Authorization": authorization}
    )

    assert resposta.status_code == 401
    assert resposta.json()["error"]["code"] == "MCP_UNAUTHENTICATED"


def test_sem_provedor_configurado_degrada_com_status_e_envelope(settings_factory, monkeypatch):
    """Degradação da ADR 015, agora no chat: o serviço sobe e diz o que falta.

    E sai como envelope JSON com status, não como um 200 com evento de erro
    dentro — porque acontece **antes** do primeiro byte do fluxo.
    """
    client, _, mcp_transport = app_com(
        settings_factory,
        turnos=[[fragmento_de_texto("oi")]],
        monkeypatch=monkeypatch,
        ai_base_url="",
    )

    resposta = client.post("/chat", json={"message": "oi"}, headers=BEARER)

    assert resposta.status_code == 503
    assert resposta.json()["error"]["code"] == "AI_PROVIDER_NOT_CONFIGURED"
    assert mcp_transport.requests == []


def test_sem_mcp_configurado_degrada_com_status_e_envelope(settings_factory, monkeypatch):
    client, _, _ = app_com(
        settings_factory,
        turnos=[[fragmento_de_texto("oi")]],
        monkeypatch=monkeypatch,
        mcp_base_url="",
    )

    resposta = client.post("/chat", json={"message": "oi"}, headers=BEARER)

    assert resposta.status_code == 503
    assert resposta.json()["error"]["code"] == "MCP_NOT_CONFIGURED"


def test_token_recusado_pelo_mcp_vira_401_e_nao_um_200_com_erro_dentro(
    settings_factory, monkeypatch
):
    """O catálogo é buscado antes de abrir o fluxo justamente por isto.

    Um token expirado tem de chegar ao PWA como 401 — que é o que dispara o
    fluxo de login — e não como um 200 que ele teria de aprender a destrinchar.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "Unauthorized"})

    client, provider_transport, _ = app_com(
        settings_factory,
        turnos=[[fragmento_de_texto("oi")]],
        mcp_transport=httpx.MockTransport(handler),
        monkeypatch=monkeypatch,
    )

    resposta = client.post("/chat", json={"message": "oi"}, headers=BEARER)

    assert resposta.status_code == 401
    assert resposta.json()["error"]["code"] == "MCP_UNAUTHORIZED"
    assert provider_transport.requests == []


def test_credencial_de_agente_exigida_quando_a_inferencia_e_paga(settings_factory, monkeypatch):
    """A fronteira de custo da ADR 018 vale para o chat como vale para a foto.

    Com `AI_BASE_URL` remota há `AGENT_API_KEY`, e sem o header a rota recusa —
    senão ela seria um proxy aberto para o gateway pago.
    """
    client, _, _ = app_com(
        settings_factory,
        turnos=[[fragmento_de_texto("oi")]],
        monkeypatch=monkeypatch,
        ai_base_url="https://gateway.ai.cloudflare.com/v1/conta/fatia/openai",
        ai_api_key="cf-token",
        agent_api_key="segredo-compartilhado",
    )

    resposta = client.post("/chat", json={"message": "oi"}, headers=BEARER)

    assert resposta.status_code == 401
    # No envelope de sempre, e não num `{"detail": ...}`: o NestJS traduz pelo
    # `code`, e um segundo formato de erro obrigaria os dois lados a conhecer os
    # dois. Foi o que a #157 pagou caro.
    corpo = resposta.json()
    assert corpo["error"]["code"] == "AGENT_KEY_REJECTED"
    assert "detail" not in corpo


def test_o_fluxo_sse_sai_na_ordem_com_os_eventos_de_tool(settings_factory, monkeypatch):
    client, _, mcp_transport = app_com(
        settings_factory,
        turnos=[
            [fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"), fim("tool_calls")],
            [fragmento_de_texto("Você "), fragmento_de_texto("comeu arroz.")],
        ],
        mcp_transport=duplo_do_mcp(
            catalogo=CATALOGO,
            resultados={"list_meals": {"content": [{"type": "text", "text": "[]"}]}},
        ),
        monkeypatch=monkeypatch,
    )

    resposta = client.post("/chat", json={"message": "o que eu comi?"}, headers=BEARER)

    assert resposta.status_code == 200
    assert resposta.headers["content-type"].startswith("text/event-stream")
    # Sem isto, um proxy que bufferize entrega a conversa inteira de uma vez e o
    # streaming das outras duas camadas da #247 se perde.
    assert resposta.headers["x-accel-buffering"] == "no"
    assert "no-transform" in resposta.headers["cache-control"]

    assert eventos_do_fluxo(resposta.text) == [
        ("tool", '{"name":"list_meals","phase":"start","arguments":"{}"}'),
        ("tool", '{"name":"list_meals","phase":"end","ok":true,"result":"[]"}'),
        ("token", '{"text":"Você "}'),
        ("token", '{"text":"comeu arroz."}'),
        ("done", '{"reason":"stop"}'),
    ]

    # O Bearer do usuário chegou ao /mcp — a propriedade inteira da ADR 021.
    assert set(mcp_transport.bearers) == {f"Bearer {TOKEN}"}


def test_acento_vai_sem_escape_no_fio(settings_factory, monkeypatch):
    """`ensure_ascii=True` triplicaria o tamanho de cada token em português."""
    client, _, _ = app_com(
        settings_factory,
        turnos=[[fragmento_de_texto("Refeição")]],
        monkeypatch=monkeypatch,
    )

    resposta = client.post("/chat", json={"message": "oi"}, headers=BEARER)

    assert '{"text":"Refeição"}' in resposta.text
    assert "\\u00e7" not in resposta.text


def test_falha_no_meio_do_fluxo_sai_como_evento_e_o_done_continua_por_ultimo(
    settings_factory, monkeypatch
):
    import json as jsonlib

    from .support import resultado_mcp, sse_jsonrpc

    def handler(request: httpx.Request) -> httpx.Response:
        corpo = jsonlib.loads(request.content)
        if corpo["method"] == "tools/list":
            return sse_jsonrpc(resultado_mcp(corpo["id"], {"tools": CATALOGO}))
        raise httpx.ConnectError("apps/api caiu")

    client, _, _ = app_com(
        settings_factory,
        turnos=[
            [fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"), fim("tool_calls")]
        ],
        mcp_transport=httpx.MockTransport(handler),
        monkeypatch=monkeypatch,
    )

    resposta = client.post("/chat", json={"message": "oi"}, headers=BEARER)

    # O status já foi 200 quando a falha aconteceu — não há como mudá-lo.
    assert resposta.status_code == 200
    nomes = [nome for nome, _ in eventos_do_fluxo(resposta.text)]
    assert nomes[-2:] == ["error", "done"]
    assert "MCP_UNREACHABLE" in resposta.text


def test_o_corpo_recusa_campo_de_identidade(settings_factory, monkeypatch):
    """`extra: forbid`. Um token no corpo acabaria no histórico que o NestJS persiste."""
    client, _, _ = app_com(
        settings_factory, turnos=[[fragmento_de_texto("oi")]], monkeypatch=monkeypatch
    )

    resposta = client.post(
        "/chat", json={"message": "oi", "userId": "outro-usuario"}, headers=BEARER
    )

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "INVALID_REQUEST"


def test_historico_longo_e_recortado_em_vez_de_recusado(settings_factory, monkeypatch):
    """O cenário que matava a conversa: a resposta longa do modelo volta no corpo.

    Sem `max_tokens` no payload, "monte um plano de 7 dias" sai com mais de 4 000
    caracteres. O NestJS persiste e reenvia no turno seguinte, e um teto duro
    aqui viraria 422 **permanente** — o fio morto por algo que nem o PWA nem o
    NestJS têm como enxergar. Quem limita é o grafo, cortando.
    """
    from fatia_agent.chat.graph import MAX_CARACTERES_POR_MENSAGEM, MAX_HISTORICO

    client, provider_transport, _ = app_com(
        settings_factory, turnos=[[fragmento_de_texto("ok")]], monkeypatch=monkeypatch
    )

    historico = [{"role": "user", "content": "x"} for _ in range(MAX_HISTORICO + 5)]
    historico.append({"role": "assistant", "content": "p" * (MAX_CARACTERES_POR_MENSAGEM + 2_000)})
    resposta = client.post(
        "/chat", json={"message": "e amanhã?", "history": historico}, headers=BEARER
    )

    assert resposta.status_code == 200
    # Sistema + 40 do histórico + a mensagem de agora: o corte aconteceu, e a
    # conversa seguiu.
    mensagens = provider_transport.corpos[0]["messages"]
    assert len(mensagens) == MAX_HISTORICO + 2
    assert len(mensagens[-2]["content"]) < MAX_CARACTERES_POR_MENSAGEM + 2_000


def test_a_mensagem_de_agora_alem_do_teto_e_recusada(settings_factory, monkeypatch):
    """Esta a pessoa acabou de escrever, e o cliente sabe contar caracteres."""
    from fatia_agent.chat.graph import MAX_CARACTERES_POR_MENSAGEM

    client, _, _ = app_com(
        settings_factory, turnos=[[fragmento_de_texto("oi")]], monkeypatch=monkeypatch
    )

    resposta = client.post(
        "/chat",
        json={"message": "z" * (MAX_CARACTERES_POR_MENSAGEM + 1)},
        headers=BEARER,
    )

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "INVALID_REQUEST"


def test_o_erro_de_validacao_nao_devolve_o_que_a_pessoa_escreveu(settings_factory, monkeypatch):
    """O 422 do FastAPI ecoava o corpo recusado em `input` — o histórico inteiro.

    Num rastreador de nutrição isso é dado de saúde (`docs/DATA_RETENTION.md`),
    num corpo de erro que o NestJS lê e provavelmente loga. É a #214 por outra
    porta, e nenhuma varredura de log do agente pegaria: o vazamento sai pelo fio.
    """
    confidencia = "engordei porque estou tomando corticoide"
    client, _, _ = app_com(
        settings_factory, turnos=[[fragmento_de_texto("oi")]], monkeypatch=monkeypatch
    )

    resposta = client.post(
        "/chat",
        # Item de histórico sem `role`: o `input` do erro é o item **inteiro**, e
        # o item inteiro é o que a pessoa escreveu. Um cliente com defeito num
        # campo devolvia a conversa no corpo do erro.
        json={"message": "oi", "history": [{"content": confidencia}]},
        headers=BEARER,
    )

    assert resposta.status_code == 422
    assert confidencia not in resposta.text
    # Controle negativo: sem dizer qual campo está errado, o corpo estaria
    # "limpo" por não dizer nada — e quem chamou não teria como corrigir.
    assert "history.0.role" in resposta.json()["error"]["message"]


def test_toda_recusa_do_chat_antes_do_primeiro_byte_sai_no_envelope(settings_factory, monkeypatch):
    """A garantia nº 3 do contrato, varrida em todos os caminhos que existem.

    Ela era falsa em dois deles: a credencial do agente e a validação do corpo
    saíam como `{"detail": ...}`. Um caso por caminho não pega o próximo que
    alguém acrescentar com `HTTPException` — este pega.
    """
    caminhos: list[tuple[str, dict[str, object], dict[str, str], dict[str, object], int]] = [
        ("sem bearer", {}, {}, {"message": "oi"}, 401),
        ("bearer torto", {}, {"Authorization": "Basic x"}, {"message": "oi"}, 401),
        (
            "sem chave do agente",
            {
                "ai_base_url": "https://gateway.ai.cloudflare.com/v1/conta/fatia/openai",
                "ai_api_key": "cf-token",
                "agent_api_key": "segredo",
            },
            BEARER,
            {"message": "oi"},
            401,
        ),
        ("sem provedor", {"ai_base_url": ""}, BEARER, {"message": "oi"}, 503),
        ("sem mcp", {"mcp_base_url": ""}, BEARER, {"message": "oi"}, 503),
        ("corpo vazio", {}, BEARER, {}, 422),
        ("campo inventado", {}, BEARER, {"message": "oi", "userId": "x"}, 422),
        ("mensagem vazia", {}, BEARER, {"message": ""}, 422),
    ]

    for nome, overrides, headers, corpo, status in caminhos:
        client, _, _ = app_com(
            settings_factory,
            turnos=[[fragmento_de_texto("oi")]],
            monkeypatch=monkeypatch,
            **overrides,
        )
        resposta = client.post("/chat", json=corpo, headers=headers)

        assert resposta.status_code == status, nome
        devolvido = resposta.json()
        assert "detail" not in devolvido, nome
        assert isinstance(devolvido["error"]["code"], str) and devolvido["error"]["code"], nome
        assert devolvido["error"]["message"], nome
