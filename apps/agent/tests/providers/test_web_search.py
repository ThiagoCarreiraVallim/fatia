"""A busca na web pelo OpenRouter (#384): o plugin `web`, e só a pergunta sai.

A forma da resposta é a medida em 2026-11-16 contra o OpenRouter com o GLM 5.3 Flash
(engine `exa`): as fontes chegam em `choices[0].message.annotations`, como
`url_citation` com `url`, `title` e `content`; o custo vem em `usage.cost`.
"""

import json

import httpx
import pytest

from fatia_agent.providers.errors import AIProviderNotConfigured
from fatia_agent.providers.openai_compat import OpenAICompatProvider

OPENROUTER = "https://openrouter.ai/api/v1"
GLM = "z-ai/glm-5.3-flash"


def _resposta(anotacoes: list[dict[str, object]]) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "model": GLM,
            "choices": [
                {
                    "finish_reason": "length",
                    "message": {"role": "assistant", "content": "", "annotations": anotacoes},
                }
            ],
            "usage": {"prompt_tokens": 1200, "completion_tokens": 16, "cost": 0.0071},
        },
    )


CITACAO = {
    "type": "url_citation",
    "url_citation": {
        "url": "https://www.gov.br/saude/pt-br/acai",
        "title": "Açaí: valor nutricional",
        "content": "100 g de polpa de açaí têm cerca de 58 kcal.",
        "start_index": 0,
        "end_index": 10,
    },
}


def _provedor(transport: httpx.MockTransport, base_url: str = OPENROUTER) -> OpenAICompatProvider:
    return OpenAICompatProvider(
        base_url=base_url, api_key="k", text_model=GLM, transport=transport, retry_backoff_s=0
    )


async def test_so_a_pergunta_sai_com_o_plugin_web_e_retencao_zero():
    enviados: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        enviados.append(json.loads(request.content))
        return _resposta([CITACAO])

    async with _provedor(httpx.MockTransport(handler)) as provedor:
        resultado = await provedor.web_search("calorias do açaí")

    (corpo,) = enviados
    assert corpo["messages"] == [{"role": "user", "content": "calorias do açaí"}]
    assert corpo["plugins"] == [{"id": "web", "engine": "exa", "max_results": 5}]
    assert corpo["provider"] == {"zdr": True, "data_collection": "deny"}
    assert corpo["model"] == GLM
    # Só a pergunta: sem sistema, sem histórico, sem tool, sem stream.
    assert set(corpo) == {"model", "messages", "plugins", "provider", "max_tokens"}

    (fonte,) = resultado.sources
    assert fonte.url == "https://www.gov.br/saude/pt-br/acai"
    assert fonte.title == "Açaí: valor nutricional"
    assert fonte.domain == "gov.br"
    assert "58 kcal" in fonte.content
    assert resultado.usage is not None
    assert resultado.usage.cost_usd == pytest.approx(0.0071)


async def test_fonte_repetida_e_anotacao_torta_ficam_de_fora():
    torta = {"type": "url_citation", "url_citation": {"title": "sem url"}}
    outra = {"type": "file", "file": {}}
    transport = httpx.MockTransport(lambda _r: _resposta([CITACAO, CITACAO, torta, outra]))
    async with _provedor(transport) as provedor:
        resultado = await provedor.web_search("açaí")

    assert [f.url for f in resultado.sources] == ["https://www.gov.br/saude/pt-br/acai"]


async def test_sem_openrouter_nao_ha_busca():
    """O plugin é do OpenRouter: em outro destino, nada sai."""
    transport = httpx.MockTransport(lambda _r: _resposta([CITACAO]))
    async with _provedor(transport, base_url="http://localhost:1234/v1") as provedor:
        with pytest.raises(AIProviderNotConfigured):
            await provedor.web_search("açaí")
