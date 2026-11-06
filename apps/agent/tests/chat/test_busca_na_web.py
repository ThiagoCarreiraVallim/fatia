"""A busca na web do chat: a tool de servidor do OpenRouter, dentro da chamada.

Os fragmentos reproduzem o que o OpenRouter mandou de verdade (2026-11-05, GLM
5.3 Flash em stream, com `provider.zdr`): as fontes em `delta.annotations` como
`url_citation`, a contagem em `usage.server_tool_use_details` e nenhuma
`tool_calls` — a busca roda dentro do gateway.
"""

from collections.abc import AsyncIterator

from fatia_agent.chat.fontes import MAX_FONTES, linha_de_fontes
from fatia_agent.providers.base import TextDelta, TurnEnd, WebSource
from fatia_agent.providers.openai_compat import OpenAICompatProvider

from ..providers.test_openai_compat import GLM, OPENROUTER, make_provider
from .support import ProviderRecordingTransport, bloco_de_uso, fragmento, fragmento_de_texto
from .test_graph import _fluxo
from .turno import turno

BUSCA = {
    "type": "openrouter:web_search",
    "parameters": {"max_results": 3, "max_total_results": 6},
}


def citacao(url: str, title: str = "Página") -> dict[str, object]:
    return {
        "type": "url_citation",
        "url_citation": {"url": url, "title": title, "start_index": 0, "end_index": 0},
    }


def com_fontes(*urls: str) -> dict[str, object]:
    return fragmento(content="", role="assistant", annotations=[citacao(u) for u in urls])


async def _coletar(provider: OpenAICompatProvider, **kwargs: object) -> list[object]:
    return [p async for p in provider.stream_chat([{"role": "user", "content": "oi"}], **kwargs)]


async def test_no_openrouter_a_busca_vai_junto_das_tools_do_chat():
    transport = ProviderRecordingTransport([[fragmento_de_texto("ok")]])
    async with make_provider(
        transport, base_url=OPENROUTER, api_key="k", text_model=GLM
    ) as provider:
        tool = {"type": "function", "function": {"name": "list_meals", "parameters": {}}}
        await _coletar(provider, tools=[tool], web_search=True)

    assert transport.corpos[0]["tools"] == [tool, BUSCA]


async def test_sem_pedir_a_busca_ela_nao_vai():
    """Título e plano usam o mesmo `stream_chat`: busca ali seria custo à toa."""
    transport = ProviderRecordingTransport([[fragmento_de_texto("ok")]])
    async with make_provider(
        transport, base_url=OPENROUTER, api_key="k", text_model=GLM
    ) as provider:
        await _coletar(provider)

    assert "tools" not in transport.corpos[0]


async def test_fora_do_openrouter_a_busca_nao_vai(settings_factory):
    """O LM Studio recusaria um `type` de tool que não conhece com 400."""
    from fatia_agent.providers import build_provider

    transport = ProviderRecordingTransport([[fragmento_de_texto("ok")]])
    provider = build_provider(settings_factory(), transport=transport)
    await _coletar(provider, web_search=True)
    await provider.aclose()

    assert "tools" not in transport.corpos[0]


async def test_as_fontes_e_a_contagem_saem_do_stream():
    transport = ProviderRecordingTransport(
        [
            [
                com_fontes("https://www.mcdonalds.com.br/big-mac", "https://tabnut.dis.epm.br/x"),
                # A mesma URL de novo, e uma que não é da web: nenhuma das duas entra.
                com_fontes("https://www.mcdonalds.com.br/big-mac", "javascript:alert(1)"),
                fragmento_de_texto("Tem 563 kcal."),
                bloco_de_uso(
                    model=GLM,
                    detalhes={
                        "server_tool_use_details": {
                            "web_search_requests": 3,
                            "tool_calls_requested": 3,
                            "tool_calls_executed": 3,
                        }
                    },
                ),
            ]
        ]
    )
    async with make_provider(
        transport, base_url=OPENROUTER, api_key="k", text_model=GLM
    ) as provider:
        pedacos = await _coletar(provider, web_search=True)

    (fim,) = [p for p in pedacos if isinstance(p, TurnEnd)]
    assert [f.url for f in fim.sources] == [
        "https://www.mcdonalds.com.br/big-mac",
        "https://tabnut.dis.epm.br/x",
    ]
    assert fim.usage is not None and fim.usage.web_searches == 3
    assert fim.tool_calls == ()
    assert [p.text for p in pedacos if isinstance(p, TextDelta)] == ["Tem 563 kcal."]


def test_a_linha_de_fontes_tem_um_link_por_dominio():
    linha = linha_de_fontes(
        [
            WebSource(url="https://www.mcdonalds.com.br/big-mac", title="Big Mac"),
            WebSource(url="https://www.mcdonalds.com.br/outra", title="Outra"),
            WebSource(url="https://pt.wikipedia.org/wiki/Big_Mac_(sanduíche)", title="W"),
        ]
    )

    assert linha == (
        "\n\nFontes: [mcdonalds.com.br](https://www.mcdonalds.com.br/big-mac) · "
        "[pt.wikipedia.org](https://pt.wikipedia.org/wiki/Big_Mac_%28sandu%C3%ADche%29)"
    )


def test_a_linha_de_fontes_tem_teto_e_some_sem_fonte():
    muitas = [WebSource(url=f"https://site{i}.com/", title="") for i in range(10)]
    assert linha_de_fontes(muitas).count("](") == MAX_FONTES
    assert linha_de_fontes([]) == ""


async def test_no_turno_as_fontes_fecham_a_resposta_e_as_buscas_vao_para_a_cota(
    settings_factory,
):
    r = await turno(
        settings_factory,
        [
            [
                com_fontes("https://www.mcdonalds.com.br/big-mac"),
                fragmento_de_texto("Um Big Mac tem 563 kcal."),
                bloco_de_uso(detalhes={"server_tool_use_details": {"web_search_requests": 2}}),
            ]
        ],
    )

    (final,) = r.data_of("messages/complete")[0]
    assert final["content"] == (
        "Um Big Mac tem 563 kcal.\n\nFontes: [mcdonalds.com.br](https://www.mcdonalds.com.br/big-mac)"
    )
    # A linha também chega aos pedaços, com o id da resposta: a tela a vê na hora.
    assert r.data_of("messages")[-1][0]["content"].startswith("\n\nFontes:")
    (uso,) = r.data_of("usage")
    assert uso["webSearches"] == 2


async def test_turno_sem_busca_nao_ganha_linha_nem_lancamento(settings_factory):
    r = await turno(settings_factory, [[fragmento_de_texto("Oi."), bloco_de_uso()]])

    (final,) = r.data_of("messages/complete")[0]
    assert final["content"] == "Oi."
    assert "webSearches" not in r.data_of("usage")[0]


async def test_o_grafo_oferece_a_busca_ao_modelo_do_chat():
    """Sem o pedido, o provedor nunca põe a tool de servidor no corpo."""
    pedidos: list[bool] = []

    class Provedor:
        async def stream_chat(
            self, messages, *, tools=(), capacidade="text", web_search=False
        ) -> AsyncIterator[TextDelta | TurnEnd]:
            pedidos.append(web_search)
            yield TextDelta(text="Oi.")
            yield TurnEnd()

        async def aclose(self) -> None:
            return None

    fluxo = await _fluxo(Provedor(), mensagem="quantas calorias tem um big mac?")
    [q async for q in fluxo]

    assert pedidos == [True]
