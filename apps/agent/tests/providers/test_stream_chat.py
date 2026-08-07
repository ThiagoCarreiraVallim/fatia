"""`stream_chat`: o streaming do provedor, com tools.

Tudo aqui roda contra o transporte duplo, que emite o formato de verdade —
fragmentos `data: {...}`, `tool_calls` fatiados por `index` e `data: [DONE]`.
"""

import httpx
import pytest

from fatia_agent.providers import build_provider
from fatia_agent.providers.base import TextDelta, TurnEnd
from fatia_agent.providers.errors import (
    AIProviderRefused,
    AIProviderTimeout,
    AIProviderUnreachable,
    AIResponseTruncated,
    AIResponseUnparseable,
)

from ..chat.support import (
    ProviderRecordingTransport,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
    stream_do_provedor,
)


async def coletar(provider, mensagens, **kwargs: object):
    return [pedaco async for pedaco in provider.stream_chat(mensagens, **kwargs)]


async def test_texto_sai_em_pedacos_na_ordem(settings_factory):
    transport = ProviderRecordingTransport(
        [[fragmento_de_texto("Você "), fragmento_de_texto("comeu "), fragmento_de_texto("arroz.")]]
    )
    provider = build_provider(settings_factory(), transport=transport)

    pedacos = await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()

    assert [p.text for p in pedacos if isinstance(p, TextDelta)] == ["Você ", "comeu ", "arroz."]
    assert isinstance(pedacos[-1], TurnEnd)
    assert pedacos[-1].tool_calls == ()
    # `stream: true` no corpo é o que faz o provedor mandar fragmento em vez da
    # resposta inteira. Sem ele o chat "funcionaria" e só apareceria no fim.
    assert transport.corpos[0]["stream"] is True


async def test_tool_calls_fatiadas_sao_remontadas(settings_factory):
    """O protocolo manda `id`/`name` no primeiro fragmento e `arguments` aos pedaços.

    Quem lê fragmento a fragmento sem acumular fica com um JSON pela metade, que
    falha na validação da tool — longe da causa.
    """
    transport = ProviderRecordingTransport(
        [
            [
                fragmento_de_tool(0, id="call_a", name="list_meals", arguments='{"da'),
                fragmento_de_tool(0, arguments='te": "2026-'),
                fragmento_de_tool(0, arguments='08-05"}'),
                fim("tool_calls"),
            ]
        ]
    )
    provider = build_provider(settings_factory(), transport=transport)

    pedacos = await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()

    (fim_do_turno,) = [p for p in pedacos if isinstance(p, TurnEnd)]
    assert len(fim_do_turno.tool_calls) == 1
    chamada = fim_do_turno.tool_calls[0]
    assert (chamada.id, chamada.name) == ("call_a", "list_meals")
    assert chamada.arguments == '{"date": "2026-08-05"}'
    assert fim_do_turno.finish_reason == "tool_calls"


async def test_duas_tools_no_mesmo_turno_saem_na_ordem_do_indice(settings_factory):
    """Os fragmentos chegam intercalados; o `index` é o que define a ordem."""
    transport = ProviderRecordingTransport(
        [
            [
                fragmento_de_tool(1, id="b", name="get_me", arguments="{}"),
                fragmento_de_tool(0, id="a", name="list_meals", arguments="{}"),
                fim("tool_calls"),
            ]
        ]
    )
    provider = build_provider(settings_factory(), transport=transport)

    pedacos = await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()

    (fim_do_turno,) = [p for p in pedacos if isinstance(p, TurnEnd)]
    assert [c.name for c in fim_do_turno.tool_calls] == ["list_meals", "get_me"]


async def test_tool_call_sem_id_ganha_um_estavel(settings_factory):
    """Modelo local nem sempre manda `id`, e sem ele o `tool_call_id` da resposta
    não correlaciona com nada."""
    transport = ProviderRecordingTransport(
        [[fragmento_de_tool(0, name="get_me", arguments="{}"), fim("tool_calls")]]
    )
    provider = build_provider(settings_factory(), transport=transport)

    pedacos = await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()

    (fim_do_turno,) = [p for p in pedacos if isinstance(p, TurnEnd)]
    assert fim_do_turno.tool_calls[0].id == "call_0"


async def test_o_catalogo_de_tools_vai_no_corpo(settings_factory):
    transport = ProviderRecordingTransport([[fragmento_de_texto("ok")]])
    provider = build_provider(settings_factory(), transport=transport)

    tools = [{"type": "function", "function": {"name": "get_me", "parameters": {}}}]
    await coletar(provider, [{"role": "user", "content": "oi"}], tools=tools)
    await provider.aclose()

    assert transport.corpos[0]["tools"] == tools


async def test_sem_tools_o_campo_nao_e_enviado(settings_factory):
    """`tools: []` faz parte dos endpoints OpenAI-compatíveis recusar com 400."""
    transport = ProviderRecordingTransport([[fragmento_de_texto("ok")]])
    provider = build_provider(settings_factory(), transport=transport)

    await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()

    assert "tools" not in transport.corpos[0]


async def test_keepalive_e_linha_de_evento_nao_derrubam_o_parser(settings_factory):
    """Provedor lento manda comentário de keep-alive no meio do stream."""

    def handler(request: httpx.Request) -> httpx.Response:
        corpo = (
            ": keepalive\n\n"
            'event: message\ndata: {"choices":[{"index":0,"delta":{"content":"oi"}}]}\n\n'
            "data: [DONE]\n\n"
        )
        return httpx.Response(
            200, content=corpo.encode("utf-8"), headers={"content-type": "text/event-stream"}
        )

    provider = build_provider(settings_factory(), transport=httpx.MockTransport(handler))
    pedacos = await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()

    assert [p.text for p in pedacos if isinstance(p, TextDelta)] == ["oi"]


async def test_fragmento_sem_choices_e_ignorado(settings_factory):
    """Alguns gateways abrem o stream com um bloco só de `usage`."""
    transport = ProviderRecordingTransport(
        [[{"usage": {"prompt_tokens": 3}}, fragmento_de_texto("oi")]]
    )
    provider = build_provider(settings_factory(), transport=transport)

    pedacos = await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()

    assert [p.text for p in pedacos if isinstance(p, TextDelta)] == ["oi"]


async def test_resposta_truncada_vira_erro_nomeado(settings_factory):
    """Saída pela metade é indistinguível de saída completa para quem só lê a string."""
    transport = ProviderRecordingTransport([[fragmento_de_texto("meio "), fim("length")]])
    provider = build_provider(settings_factory(), transport=transport)

    with pytest.raises(AIResponseTruncated):
        await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()


async def test_fragmento_que_nao_e_json_vira_erro_nomeado(settings_factory):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=b"data: nao sou json\n\n",
            headers={"content-type": "text/event-stream"},
        )

    provider = build_provider(settings_factory(), transport=httpx.MockTransport(handler))

    with pytest.raises(AIResponseUnparseable):
        await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()


async def test_status_de_erro_vira_erro_nomeado(settings_factory):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": "slow down"})

    provider = build_provider(settings_factory(), transport=httpx.MockTransport(handler))

    with pytest.raises(AIProviderRefused) as excinfo:
        await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()

    assert excinfo.value.status_code == 429


@pytest.mark.parametrize(
    ("excecao", "esperado"),
    [
        (httpx.ReadTimeout("estourou"), AIProviderTimeout),
        # Herdam de `RequestError`, não de `TimeoutException` — um `except` só de
        # timeout as deixaria escapar cruas, e no meio de um SSE isso é a tela
        # travando sem uma linha dizendo por quê.
        (httpx.ConnectError("recusou"), AIProviderUnreachable),
        (httpx.ReadError("caiu no meio"), AIProviderUnreachable),
        (httpx.RemoteProtocolError("fechou"), AIProviderUnreachable),
    ],
)
async def test_falha_de_transporte_no_stream_vira_erro_nomeado(
    settings_factory, excecao: httpx.RequestError, esperado: type[Exception]
):
    def handler(request: httpx.Request) -> httpx.Response:
        raise excecao

    provider = build_provider(settings_factory(), transport=httpx.MockTransport(handler))

    with pytest.raises(esperado):
        await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()


async def test_stream_nao_repete_a_chamada(settings_factory):
    """Repetir um POST que já entregou tokens duplicaria a resposta na tela.

    O `_request` (não-streaming) repete em 429; este caminho **não** repete, e é
    decisão, não esquecimento.
    """
    tentativas: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        tentativas.append(1)
        return httpx.Response(429, json={"error": "slow down"})

    provider = build_provider(
        settings_factory(ai_max_retries=2), transport=httpx.MockTransport(handler)
    )

    with pytest.raises(AIProviderRefused):
        await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()

    assert len(tentativas) == 1


async def test_modelo_nao_revisado_recusa_antes_de_qualquer_byte(settings_factory):
    """O chat passa pelo mesmo `_require_model` da foto (#136).

    O texto que a pessoa escreve sai para o mesmo host para onde a foto ia; se a
    revisão de destino valesse só para visão, o chat seria a porta dos fundos.
    """
    chamadas: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        chamadas.append(1)
        return stream_do_provedor([fragmento_de_texto("oi")])

    provider = build_provider(
        settings_factory(
            ai_base_url="https://gateway.ai.cloudflare.com/v1/conta/fatia/openai",
            ai_api_key="cf-token",
        ),
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(Exception) as excinfo:
        await coletar(provider, [{"role": "user", "content": "oi"}])
    await provider.aclose()

    assert excinfo.value.code == "AI_ENDPOINT_NOT_ALLOWED"  # type: ignore[attr-defined]
    assert chamadas == []
