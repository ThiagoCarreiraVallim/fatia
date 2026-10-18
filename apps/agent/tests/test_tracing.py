"""Langfuse (ADR 034): o que sai do agente, e o que não pode sair.

O cliente é o de verdade, com um exportador em memória no lugar da rede: os
spans que o teste lê são exatamente os que iriam para a Langfuse Cloud.
"""

import json

import pytest
from langfuse import Langfuse
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from fatia_agent import tracing
from fatia_agent.settings import AgentSettings
from fatia_agent.tracing import (
    NOOP_TRACE,
    hashed_user_id,
    mask,
    messages_for_trace,
    start_turn_trace,
    trace_id_for,
)

from .chat.support import duplo_do_mcp, fim, fragmento_de_texto, fragmento_de_tool
from .chat.turno import CATALOGO, turno

SEGREDO_DA_TOOL = "almoço: 250 g de frango, glicemia 180"
USUARIO = "6a1f0f8e-3d0e-4d8f-9a55-0c1d2e3f4a5b"


@pytest.fixture
def exportador(monkeypatch):
    spans = InMemorySpanExporter()
    provider = TracerProvider()
    cliente = Langfuse(
        public_key="pk-lf-teste",
        secret_key="sk-lf-teste",
        base_url="http://127.0.0.1:9",
        tracer_provider=provider,
        span_exporter=spans,
        mask=mask,
    )
    tracing.reset_langfuse(cliente)
    yield spans
    tracing.reset_langfuse(None)
    provider.shutdown()


def _atributos(spans) -> list[dict[str, object]]:
    tracing.get_langfuse(None).flush()  # type: ignore[arg-type]
    return [dict(span.attributes or {}) for span in spans.get_finished_spans()]


def _settings(settings_factory) -> AgentSettings:
    return settings_factory(
        langfuse_public_key="pk-lf-teste",
        langfuse_secret_key="sk-lf-teste",
        agent_api_key="chave-do-agente",
    )


def test_sem_chaves_nada_e_traçado(settings_factory):
    tracing.reset_langfuse(None)
    settings = settings_factory()
    assert tracing.get_langfuse(settings) is None
    trace = start_turn_trace(
        settings, run_id="r", user_id=USUARIO, conversation_id="c", kind="chat", message="oi"
    )
    assert trace is NOOP_TRACE


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("meu email é ana.souza+fit@exemplo.com.br", "meu email é [email]"),
        ("cpf 123.456.789-09", "cpf [cpf]"),
        ("cnpj 12.345.678/0001-90", "cnpj [cnpj]"),
        ("liga (11) 98765-4321", "liga [telefone]"),
        # UUID não é telefone: mascarar id tornaria o trace inútil.
        (f"conversa {USUARIO}", f"conversa {USUARIO}"),
    ],
)
def test_mask(texto, esperado):
    assert mask(data=texto) == esperado
    assert mask(data={"a": [texto]}) == {"a": [esperado]}


def test_mensagens_ao_modelo_saem_sem_resultado_de_tool_nem_imagem():
    saida = messages_for_trace(
        [
            {"role": "system", "content": "regras"},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "o que é isso?"},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,AAAA"}},
                ],
            },
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {"function": {"name": "list_meals", "arguments": '{"peso": 82}'}},
                ],
            },
            {"role": "tool", "content": SEGREDO_DA_TOOL},
        ]
    )
    texto = json.dumps(saida, ensure_ascii=False)
    assert "base64" not in texto
    assert SEGREDO_DA_TOOL not in texto
    assert "82" not in texto
    assert saida[1]["content"] == "o que é isso?\n[imagem]"
    assert saida[2]["tool_calls"] == ["list_meals"]
    assert saida[3]["content"] == f"[resultado de tool, {len(SEGREDO_DA_TOOL)} caracteres]"


def test_id_da_pessoa_vai_como_hmac(settings_factory):
    settings = _settings(settings_factory)
    hashed = hashed_user_id(USUARIO, settings)
    assert hashed != USUARIO and USUARIO not in hashed
    assert hashed == hashed_user_id(USUARIO, settings)
    assert hashed != hashed_user_id(USUARIO, settings_factory(agent_api_key="outra"))


async def test_turno_com_tool_vira_trace_sem_o_resultado_da_tool(settings_factory, exportador):
    settings = _settings(settings_factory)
    trace = start_turn_trace(
        settings,
        run_id="run-1",
        user_id=USUARIO,
        conversation_id="conversa-1",
        kind="chat",
        message="meu email é ana@exemplo.com, o que comi?",
    )
    mcp = duplo_do_mcp(
        catalogo=CATALOGO,
        resultados={"list_meals": {"content": [{"type": "text", "text": SEGREDO_DA_TOOL}]}},
    )

    r = await turno(
        settings_factory,
        [
            [fragmento_de_tool(0, id="c1", name="list_meals", arguments="{}"), fim("tool_calls")],
            [fragmento_de_texto("Frango.")],
        ],
        mcp_transport=mcp,
        trace=trace,
    )
    assert r.data_of("done") == [{"status": "completed"}]

    atributos = _atributos(exportador)
    tudo = json.dumps(atributos, ensure_ascii=False, default=str)
    assert SEGREDO_DA_TOOL not in tudo
    assert "ana@exemplo.com" not in tudo
    assert USUARIO not in tudo

    tipos = [a.get("langfuse.observation.type") for a in atributos]
    assert tipos.count("generation") == 2
    assert "tool" in tipos and "agent" in tipos
    (ferramenta,) = [a for a in atributos if a.get("langfuse.observation.type") == "tool"]
    assert ferramenta["langfuse.observation.metadata.result_chars"] == len(SEGREDO_DA_TOOL)
    # Atributos de trace em todo span: é o que deixa filtrar custo por pessoa e conversa.
    assert ferramenta["session.id"] == "conversa-1"
    (raiz,) = [a for a in atributos if a.get("langfuse.observation.type") == "agent"]
    assert raiz["user.id"] == hashed_user_id(USUARIO, settings)
    assert raiz["session.id"] == "conversa-1"
    assert "[email]" in str(raiz["langfuse.observation.input"])
    assert "Frango." in str(raiz["langfuse.observation.output"])
    spans = exportador.get_finished_spans()
    assert {format(span.context.trace_id, "032x") for span in spans} == {trace_id_for("run-1")}


async def test_voto_vira_score_no_trace_do_turno(settings_factory, exportador, monkeypatch):
    chamadas: list[dict[str, object]] = []
    monkeypatch.setattr(
        tracing.get_langfuse(_settings(settings_factory)),
        "create_score",
        lambda **kw: chamadas.append(kw),
    )

    ok = await tracing.record_feedback(
        _settings(settings_factory), run_id="run-1", review="dislike", reasons=["errou"]
    )

    assert ok
    (score,) = chamadas
    assert score["trace_id"] == trace_id_for("run-1")
    assert score["score_id"] == "run-1-user_feedback"
    assert score["value"] == 0
    assert score["metadata"] == {"reasons": ["errou"]}
