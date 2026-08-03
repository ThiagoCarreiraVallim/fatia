"""Degradação explícita (ADR 015).

Sem provedor configurado, o agente **sobe** e diz o que falta. Não estoura com
`NoneType` na primeira chamada, e não deixa a funcionalidade de IA virar o único
caminho: o registro manual continua sendo o caminho.
"""

import pytest

from fatia_agent.providers import build_provider
from fatia_agent.providers.errors import AIProviderNotConfigured
from fatia_agent.settings import LM_STUDIO_URL, ai_unavailable_reason, is_local_endpoint


def test_sem_base_url_levanta_erro_nomeado_e_acionavel(settings_factory):
    settings = settings_factory(ai_base_url="")

    with pytest.raises(AIProviderNotConfigured) as excinfo:
        build_provider(settings)

    mensagem = excinfo.value.message
    assert excinfo.value.code == "AI_PROVIDER_NOT_CONFIGURED"
    # "Acionável" tem conteúdo: precisa dizer a variável e para onde apontá-la.
    assert "AI_BASE_URL" in mensagem
    assert LM_STUDIO_URL in mensagem


def test_base_url_so_com_espaco_conta_como_ausente(settings_factory):
    """`AI_BASE_URL=` no `.env` com um espaço sobrando é o caso real de campo.

    Asserir só o tipo da exceção não distingue certo de errado aqui: a fixture
    já vem com `ai_api_key=""`, então sem o `.strip()` o erro viria do *outro*
    ramo (o da chave) e o teste passaria igual. É o nome da variável na
    mensagem que prova por onde passou.
    """
    with pytest.raises(AIProviderNotConfigured) as excinfo:
        build_provider(settings_factory(ai_base_url="   "))

    assert "AI_BASE_URL" in excinfo.value.message
    assert "AI_API_KEY" not in excinfo.value.message


def test_endpoint_local_dispensa_api_key(settings_factory):
    """LM Studio não pede credencial — exigir uma travaria o desenvolvimento."""
    provider = build_provider(settings_factory(ai_base_url=LM_STUDIO_URL, ai_api_key=""))
    assert provider is not None


def test_endpoint_remoto_sem_api_key_degrada_antes_do_401(settings_factory):
    """O risco que só apareceria no primeiro deploy.

    Todo o desenvolvimento passa com chave vazia porque o LM Studio aceita; no
    gateway isso vira 401 na primeira chamada de produção, longe da causa.
    """
    settings = settings_factory(
        ai_base_url="https://gateway.ai.cloudflare.com/v1/conta/fatia/openai",
        ai_api_key="",
    )

    with pytest.raises(AIProviderNotConfigured) as excinfo:
        build_provider(settings)

    assert "AI_API_KEY" in excinfo.value.message
    assert "gateway.ai.cloudflare.com" in excinfo.value.message


def test_endpoint_remoto_com_api_key_esta_configurado(settings_factory):
    settings = settings_factory(
        ai_base_url="https://gateway.ai.cloudflare.com/v1/conta/fatia/openai",
        ai_api_key="cf-token",
    )
    assert ai_unavailable_reason(settings) is None


@pytest.mark.parametrize(
    ("url", "local"),
    [
        ("http://localhost:1234/v1", True),
        ("http://127.0.0.1:1234/v1", True),
        ("http://host.docker.internal:1234/v1", True),
        ("https://gateway.ai.cloudflare.com/v1/conta/fatia/openai", False),
        # Não basta conter "localhost": um host que só começa igual é remoto.
        ("https://localhost.evil.example/v1", False),
    ],
)
def test_reconhecimento_de_endpoint_local(url: str, local: bool):
    assert is_local_endpoint(url) is local
