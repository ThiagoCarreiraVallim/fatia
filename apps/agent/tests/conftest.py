"""Fixtures compartilhadas. Os duplos ficam em `tests/support.py`."""

from collections.abc import Callable

import pytest

from fatia_agent.settings import AgentSettings

AI_ENV_VARS = (
    "AI_BASE_URL",
    "AI_API_KEY",
    "AI_MODEL_TEXT",
    "AI_MODEL_VISION",
    "AI_MODEL_EMBEDDING",
    "AI_TIMEOUT_S",
    "AI_MAX_RETRIES",
    "AGENT_API_KEY",
    # Sem estas duas, uma máquina com o `apps/api` configurado no ambiente faria
    # o teste de degradação do chat passar por engano — o mesmo motivo das de IA.
    "MCP_BASE_URL",
    "MCP_TIMEOUT_S",
)


@pytest.fixture
def settings_factory() -> Callable[..., AgentSettings]:
    """Settings isolada do ambiente e do `.env` do desenvolvedor.

    `_env_file=None` não é detalhe: sem ele, uma máquina com `AI_BASE_URL` no
    `.env` faria o teste de degradação passar por engano.
    """

    def _factory(**overrides: object) -> AgentSettings:
        defaults: dict[str, object] = {
            "ai_base_url": "http://localhost:1234/v1",
            "ai_api_key": "",
            "ai_model_text": "ornith-1.0-9b",
            "ai_model_vision": "google/gemma-4-12b-qat",
            "ai_model_embedding": "text-embedding-nomic-embed-text-v1.5",
            "ai_retry_backoff_s": 0.0,
            "agent_api_key": "",
            "mcp_base_url": "http://localhost:3000/mcp",
        }
        defaults.update(overrides)
        return AgentSettings(_env_file=None, **defaults)  # type: ignore[arg-type]

    return _factory


@pytest.fixture(autouse=True)
def _sem_env_de_ia(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """Nenhum teste não-smoke enxerga `AI_*` do ambiente real.

    O smoke é a exceção declarada: ele existe justamente para exercitar a
    configuração de verdade da máquina.
    """
    if request.node.get_closest_marker("smoke") is not None:
        return
    for name in AI_ENV_VARS:
        monkeypatch.delenv(name, raising=False)
