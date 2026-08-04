"""Superfície HTTP: saúde e contrato de erro."""

from fastapi.testclient import TestClient

from fatia_agent.api import create_app


def test_health_responde_200_mesmo_sem_provedor(settings_factory):
    """Agente sem IA é um serviço saudável que não faz inferência.

    Se /health ficasse vermelho aqui, o orquestrador reiniciaria em loop um
    container que está exatamente como deveria.
    """
    client = TestClient(create_app(settings_factory(ai_base_url="")))

    resposta = client.get("/health")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "ok"
    assert corpo["ai"]["configured"] is False
    assert "AI_BASE_URL" in corpo["ai"]["reason"]


def test_health_com_provedor_configurado_nao_traz_motivo(settings_factory):
    client = TestClient(create_app(settings_factory()))

    corpo = client.get("/health").json()

    # Igualdade exata de propósito: campo novo em `ai` tem de passar por aqui.
    # `unreviewed_models` vazio e `unreviewed_host` nulo afirmam, junto, que
    # provedor local não exige revisão nenhuma (#136) — ver
    # `test_allowed_models.py`.
    assert corpo["ai"] == {
        "configured": True,
        "reason": None,
        "unreviewed_host": None,
        "unreviewed_models": {},
    }


def test_capabilities_sem_provedor_responde_erro_nomeado(settings_factory):
    """A degradação atravessa o HTTP com um `code` estável.

    É esse código que o NestJS traduz para o cliente cair no caminho manual —
    uma mensagem em prosa não serviria, porque mudar o texto quebraria o outro
    lado sem aviso.
    """
    client = TestClient(create_app(settings_factory(ai_base_url="")))

    resposta = client.get("/capabilities")

    assert resposta.status_code == 503
    erro = resposta.json()["error"]
    assert erro["code"] == "AI_PROVIDER_NOT_CONFIGURED"
    assert "AI_BASE_URL" in erro["message"]


def test_capabilities_lista_o_modelo_de_cada_capacidade(settings_factory):
    client = TestClient(create_app(settings_factory()))

    corpo = client.get("/capabilities").json()

    assert corpo["capabilities"] == {
        "text": "ornith-1.0-9b",
        "vision": "google/gemma-4-12b-qat",
        "embedding": "text-embedding-nomic-embed-text-v1.5",
        # Sem implementação até #141 — declarada como ausente, não omitida.
        "transcription": None,
    }


def test_capacidade_sem_modelo_aparece_como_ausente(settings_factory):
    client = TestClient(create_app(settings_factory(ai_model_vision="")))

    corpo = client.get("/capabilities").json()

    assert corpo["capabilities"]["vision"] is None
    assert corpo["capabilities"]["text"] == "ornith-1.0-9b"


def test_capabilities_nao_ecoa_o_caminho_da_base_url(settings_factory):
    """A rota é anônima e o compose publica a porta em `0.0.0.0`.

    O path de um gateway carrega id de conta e nome do gateway; devolver a
    `AI_BASE_URL` inteira entregava os dois a um `curl` sem credencial.
    """
    client = TestClient(
        create_app(
            settings_factory(
                ai_base_url="https://gateway.ai.cloudflare.com/v1/f7a3c0de-conta/fatia-gw/openai",
                ai_api_key="cf-token",
            )
        )
    )

    corpo = client.get("/capabilities").json()

    assert corpo["provider_host"] == "gateway.ai.cloudflare.com"
    # Nem a conta nem o nome do gateway aparecem em lugar nenhum da resposta.
    bruto = client.get("/capabilities").text
    assert "f7a3c0de-conta" not in bruto
    assert "fatia-gw" not in bruto


def test_a_superficie_e_so_diagnostico_mais_o_reconhecimento(settings_factory):
    """Guarda de escopo, e de custo.

    A #134 não expunha rota de inferência nenhuma; a #139 expõe exatamente uma, e
    ela é autenticada por segredo compartilhado (ver `test_recognize_meal.py`).
    Rota de inferência **anônima** seria um proxy aberto para o gateway pago —
    a fronteira de custo da ADR 018. Este teste existe para que uma terceira rota
    tenha de passar por aqui antes de nascer.
    """
    app = create_app(settings_factory())

    caminhos = {rota.path for rota in app.routes}  # type: ignore[attr-defined]

    nossas = {
        caminho for caminho in caminhos if not caminho.startswith(("/openapi", "/docs", "/redoc"))
    }
    assert nossas == {"/health", "/capabilities", "/recognize-meal"}
