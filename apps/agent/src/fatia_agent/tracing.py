"""Langfuse: o que cada turno do chat fez, para investigar resposta ruim e erro (ADR 034).

É o **único** módulo que conhece o SDK. O resto do agente recebe um `TurnTrace`
— que, sem `LANGFUSE_PUBLIC_KEY` e `LANGFUSE_SECRET_KEY`, não faz nada.

## O que sai, e o que não sai

O chat da Fatia fala de saúde. O trace precisa mostrar **o que o agente fez**,
não guardar uma cópia da vida da pessoa em outro fornecedor:

- **Sai:** a pergunta e a resposta, passadas por `mask` (e-mail, CPF, CNPJ e
  telefone viram marcadores); o modelo, os tokens, o custo e o tempo de cada
  chamada; o nome, a duração e o desfecho de cada tool; o `code` de cada erro.
- **Não sai:** o resultado das tools (só o tamanho), os argumentos das tools, as
  fotos (viram `[imagem]`), o id da pessoa (vai um HMAC dele) e o e-mail.

## Por que observações explícitas, e não "a observação corrente"

O turno é um gerador assíncrono que a resposta HTTP consome aos pedaços. Um
`start_as_current_observation` ali dentro mexeria no contexto do OpenTelemetry
entre um `yield` e outro, e o contexto seria restaurado fora de ordem. Cada
observação aqui tem pai explícito e é encerrada à mão.

## Trace id determinístico

`trace_id_for(runId)`: o `apps/api` guarda o `runId` de cada resposta, e com ele o
voto 👍/👎 acha o trace sem ninguém guardar id do Langfuse — e o sorteio
(`LANGFUSE_SAMPLE_RATE`), que é pelo trace id, decide igual para os dois.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import threading
import time
from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import AbstractContextManager
from typing import TYPE_CHECKING, Any, Protocol, cast

from . import __version__
from .providers.base import ChatCapability, ReasoningDelta, TextDelta, ToolChatCapability, TurnEnd
from .settings import AgentSettings

if TYPE_CHECKING:
    from langfuse import Langfuse

logger = logging.getLogger(__name__)


class _Observation(Protocol):
    """O pedaço de uma observação do Langfuse que este módulo usa."""

    def update(self, **kwargs: Any) -> object: ...  # noqa: ANN401
    def end(self) -> object: ...
    def start_observation(self, **kwargs: Any) -> _Observation: ...  # noqa: ANN401


_client: Langfuse | None = None
_lock = threading.Lock()

FEEDBACK_SCORE = "user_feedback"


def langfuse_enabled(settings: AgentSettings) -> bool:
    return bool(settings.langfuse_public_key.strip() and settings.langfuse_secret_key.strip())


def get_langfuse(settings: AgentSettings) -> Langfuse | None:
    """O cliente do processo, ou `None` sem as duas chaves."""
    global _client
    if _client is not None or not langfuse_enabled(settings):
        return _client
    with _lock:
        if _client is None:
            _client = _build_client(settings)
    return _client


def reset_langfuse(client: Langfuse | None = None) -> None:
    """Troca o cliente do processo. Para os testes; em produção ele nasce uma vez."""
    global _client
    _client = client


def shutdown_langfuse() -> None:
    """Esvazia a fila. Sem isto os últimos traces de um processo que sai se perdem."""
    if _client is not None:
        try:
            _client.shutdown()
        except Exception:
            logger.warning("Langfuse não esvaziou a fila no desligamento.", exc_info=True)


def _build_client(settings: AgentSettings) -> Langfuse:
    from langfuse import Langfuse
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.sampling import TraceIdRatioBased

    # Provider próprio, e não o global: a `api` tem OpenTelemetry próprio
    # (Tempo), e um provider global misturaria os spans dos dois destinos.
    taxa = min(max(settings.langfuse_sample_rate, 0.0), 1.0)
    resource = Resource.create({"service.name": "fatia-agent"})
    provider = (
        TracerProvider(resource=resource, sampler=TraceIdRatioBased(taxa))
        if taxa < 1
        else TracerProvider(resource=resource)
    )
    return Langfuse(
        public_key=settings.langfuse_public_key.strip(),
        secret_key=settings.langfuse_secret_key.strip(),
        base_url=settings.langfuse_host.strip(),
        environment=_environment(settings.langfuse_environment),
        release=__version__,
        sample_rate=taxa,
        mask=mask,
        tracer_provider=provider,
    )


_ENVIRONMENT_CHARS = re.compile(r"[^a-z0-9_-]+")


def _environment(env: str) -> str:
    """O Langfuse recusa ambiente fora de `[a-z0-9_-]` ou começando por `langfuse`."""
    nome = _ENVIRONMENT_CHARS.sub("-", env.lower()).strip("-")[:40]
    return nome if nome and not nome.startswith("langfuse") else "default"


def trace_id_for(run_id: str) -> str:
    """32 hex, sempre o mesmo para o mesmo `runId`."""
    from langfuse import Langfuse

    trace_id: str = Langfuse.create_trace_id(seed=run_id)
    return trace_id


def hashed_user_id(user_id: str, settings: AgentSettings) -> str:
    """O id da pessoa como o Langfuse vê: HMAC com a chave do agente.

    Agrupa os traces de uma mesma pessoa sem entregar ao Langfuse o id que abre
    o cadastro dela no nosso banco. A chave é a `AGENT_API_KEY`, que o Langfuse
    não tem.
    """
    chave = (settings.agent_api_key.strip() or "fatia-agent").encode()
    return hmac.new(chave, user_id.encode(), hashlib.sha256).hexdigest()[:32]


# ── Máscara ──────────────────────────────────────────────────────────────────

# A ordem importa: o e-mail sai antes porque tem dígitos, e o CNPJ antes do CPF
# porque os 14 dígitos dele contêm 11. Os limites `(?<![\w-])`/`(?![\w-])` não
# são enfeite: os ids são UUIDs, e `4000-8000` dentro de um parece telefone.
_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"), "[email]"),
    (
        re.compile(r"(?<![\w-])(?:\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}|\d{14})(?![\w-])"),
        "[cnpj]",
    ),
    (re.compile(r"(?<![\w-])(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})(?![\w-])"), "[cpf]"),
    (
        re.compile(
            r"(?<![\w-])(?:"
            r"(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}"
            r"|9?\d{4}-\d{4}"
            r")(?![\w-])"
        ),
        "[telefone]",
    ),
)


def mask(*, data: object, **_: object) -> object:
    """Tira e-mail, CPF, CNPJ e telefone de tudo o que vai para o Langfuse."""
    if isinstance(data, str):
        for pattern, replacement in _PATTERNS:
            data = pattern.sub(replacement, data)
        return data
    if isinstance(data, Mapping):
        return {key: mask(data=value) for key, value in data.items()}
    if isinstance(data, list | tuple):
        return [mask(data=item) for item in data]
    return data


def messages_for_trace(messages: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """As mensagens que foram ao modelo, sem o que não pode sair.

    O resultado de tool vira só o tamanho; imagem vira `[imagem]`; os argumentos
    de tool call ficam de fora (são dado de saúde: refeição, peso, treino).
    """
    saida: list[dict[str, Any]] = []
    for mensagem in messages:
        papel = str(mensagem.get("role", ""))
        conteudo = mensagem.get("content")
        if papel == "tool":
            tamanho = len(conteudo) if isinstance(conteudo, str) else 0
            saida.append({"role": "tool", "content": f"[resultado de tool, {tamanho} caracteres]"})
            continue
        if isinstance(conteudo, list):
            partes = [
                parte.get("text", "")
                if isinstance(parte, Mapping) and parte.get("type") == "text"
                else "[imagem]"
                for parte in conteudo
            ]
            conteudo = "\n".join(str(p) for p in partes)
        item: dict[str, Any] = {"role": papel, "content": conteudo or ""}
        chamadas = mensagem.get("tool_calls")
        if isinstance(chamadas, list) and chamadas:
            item["tool_calls"] = [
                (chamada.get("function") or {}).get("name", "?")
                for chamada in chamadas
                if isinstance(chamada, Mapping)
            ]
        saida.append(item)
    return saida


# ── O trace do turno ─────────────────────────────────────────────────────────


class ToolTrace:
    """Uma tool chamada. Sem Langfuse, nada aqui faz coisa alguma."""

    def __init__(self, observation: _Observation | None = None) -> None:
        self._observation = observation
        self._started = time.perf_counter()

    def end(self, *, is_error: bool, result_chars: int) -> None:
        if self._observation is None:
            return
        self._observation.update(
            metadata={
                "is_error": is_error,
                "result_chars": result_chars,
                "duration_ms": round((time.perf_counter() - self._started) * 1000),
            },
            level="WARNING" if is_error else None,
        )
        self._observation.end()

    def fail(self, code: str) -> None:
        if self._observation is None:
            return
        self._observation.update(level="ERROR", status_message=code)
        self._observation.end()


class TurnTrace:
    """Um turno do chat. A versão base é o no-op de quando o Langfuse está desligado."""

    def generation(self, *, model: str, messages: Sequence[Mapping[str, Any]]) -> GenerationTrace:
        return GenerationTrace()

    def tool(self, name: str) -> ToolTrace:
        return ToolTrace()

    def finish(
        self, *, status: str, output: str | None = None, error_code: str | None = None
    ) -> None:
        return None


NOOP_TRACE = TurnTrace()


class GenerationTrace:
    """Uma chamada ao modelo dentro do turno."""

    def __init__(self, observation: _Observation | None = None) -> None:
        self._observation = observation
        self._first_token_at: float | None = None

    def token(self) -> None:
        if self._first_token_at is None:
            self._first_token_at = time.time()

    def end(self, *, output: str, end: TurnEnd) -> None:
        if self._observation is None:
            return
        from datetime import UTC, datetime

        uso = end.usage
        self._observation.update(
            output={
                "text": output,
                "tool_calls": [chamada.name for chamada in end.tool_calls],
                "finish_reason": end.finish_reason,
            },
            model=uso.model if uso else None,
            usage_details={
                chave: valor
                for chave, valor in {
                    "input": uso.input_units if uso else None,
                    "output": uso.output_units if uso else None,
                    "input_cached_tokens": uso.cached_input_units if uso else None,
                    "output_reasoning_tokens": uso.reasoning_units if uso else None,
                }.items()
                if valor
            }
            or None,
            cost_details={"total": uso.cost_usd} if uso and uso.cost_usd else None,
            completion_start_time=datetime.fromtimestamp(self._first_token_at, UTC)
            if self._first_token_at
            else None,
        )
        self._observation.end()

    def fail(self, code: str) -> None:
        if self._observation is None:
            return
        self._observation.update(level="ERROR", status_message=code)
        self._observation.end()


class LangfuseTurnTrace(TurnTrace):
    def __init__(self, root: _Observation, attributes: dict[str, Any]) -> None:
        self._root = root
        self._attributes = attributes

    def _scope(self) -> AbstractContextManager[Any]:
        from langfuse import propagate_attributes

        return propagate_attributes(**self._attributes)

    def generation(self, *, model: str, messages: Sequence[Mapping[str, Any]]) -> GenerationTrace:
        try:
            with self._scope():
                observation = self._root.start_observation(
                    name="modelo",
                    as_type="generation",
                    model=model,
                    input=messages_for_trace(messages),
                )
        except Exception:
            logger.warning("Langfuse recusou a geração; o turno segue.", exc_info=True)
            return GenerationTrace()
        return GenerationTrace(observation)

    def tool(self, name: str) -> ToolTrace:
        try:
            with self._scope():
                observation = self._root.start_observation(name=name, as_type="tool")
        except Exception:
            logger.warning("Langfuse recusou o span da tool; o turno segue.", exc_info=True)
            return ToolTrace()
        return ToolTrace(observation)

    def finish(
        self, *, status: str, output: str | None = None, error_code: str | None = None
    ) -> None:
        try:
            self._root.update(
                output={"status": status, "text": output} if output else {"status": status},
                level="ERROR" if status == "error" else None,
                status_message=error_code,
            )
            self._root.end()
        except Exception:
            logger.warning("Langfuse recusou o fim do turno.", exc_info=True)


def start_turn_trace(
    settings: AgentSettings,
    *,
    run_id: str,
    user_id: str,
    conversation_id: str,
    kind: str,
    message: str | None,
    persona_group_id: str | None = None,
    model: str | None = None,
) -> TurnTrace:
    """Abre o trace do turno, ou devolve o no-op. **Nunca levanta**: tracing não derruba chat."""
    client = get_langfuse(settings)
    if client is None:
        return NOOP_TRACE
    tags = [kind] + ([f"persona:{persona_group_id}"] if persona_group_id else [])
    attributes: dict[str, Any] = {
        "user_id": hashed_user_id(user_id, settings),
        "session_id": conversation_id,
        "tags": tags,
        "trace_name": f"chat-{kind}",
        "metadata": {"run_id": run_id, **({"model": model} if model else {})},
    }
    try:
        from langfuse import propagate_attributes

        with propagate_attributes(**attributes):
            root = client.start_observation(
                trace_context={"trace_id": trace_id_for(run_id)},
                name=f"chat-{kind}",
                as_type="agent",
                input={"message": message} if message else None,
            )
    except Exception:
        logger.warning("Langfuse não abriu o trace; o turno segue sem.", exc_info=True)
        return NOOP_TRACE
    return LangfuseTurnTrace(cast(_Observation, root), attributes)


class TracedProvider:
    """O provedor do turno, com uma `generation` por chamada ao modelo."""

    def __init__(self, inner: ToolChatCapability, trace: TurnTrace, *, model: str) -> None:
        self._inner = inner
        self._trace = trace
        self._model = model

    async def stream_chat(
        self,
        messages: Sequence[dict[str, object]],
        *,
        tools: Sequence[dict[str, object]] = (),
        capacidade: ChatCapability = "text",
    ) -> AsyncIterator[TextDelta | ReasoningDelta | TurnEnd]:
        geracao = self._trace.generation(model=self._model, messages=messages)
        texto: list[str] = []
        try:
            async for pedaco in self._inner.stream_chat(
                messages, tools=tools, capacidade=capacidade
            ):
                if isinstance(pedaco, TextDelta):
                    geracao.token()
                    texto.append(pedaco.text)
                elif isinstance(pedaco, TurnEnd):
                    geracao.end(output="".join(texto), end=pedaco)
                yield pedaco
        except BaseException as exc:
            geracao.fail(str(getattr(exc, "code", type(exc).__name__)))
            raise

    async def aclose(self) -> None:
        aclose = getattr(self._inner, "aclose", None)
        if aclose is not None:
            await aclose()


# ── Fora do turno ────────────────────────────────────────────────────────────


def record_generation(
    settings: AgentSettings,
    *,
    name: str,
    model: str,
    input: object,
    output: object,
    usage: Mapping[str, int | None] | None = None,
) -> None:
    """Título e transcrição: uma geração solta, sem trace de turno. Nunca levanta."""
    client = get_langfuse(settings)
    if client is None:
        return
    try:
        observation = client.start_observation(
            name=name,
            as_type="generation",
            model=model,
            input=input,
            output=output,
            usage_details={k: v for k, v in (usage or {}).items() if v} or None,
        )
        observation.end()
    except Exception:
        logger.warning("Langfuse recusou a geração solta.", exc_info=True)


async def record_feedback(
    settings: AgentSettings, *, run_id: str, review: str | None, reasons: Sequence[str]
) -> bool:
    """O 👍/👎 da pessoa vira score no trace do turno; `review=None` apaga o score.

    Um score por turno (`score_id` fixo): trocar o voto sobrescreve, não soma.
    O comentário livre da pessoa **não** vem para cá — ele pode trazer dado de
    saúde. Nunca levanta: o voto já está gravado no banco da `api`.
    """
    client = get_langfuse(settings)
    if client is None:
        return False
    score_id = f"{run_id}-{FEEDBACK_SCORE}"
    try:
        if review is None:
            await _delete_score(settings, score_id)
            return True
        client.create_score(
            score_id=score_id,
            trace_id=trace_id_for(run_id),
            name=FEEDBACK_SCORE,
            value=1 if review == "like" else 0,
            data_type="BOOLEAN",
            metadata={"reasons": list(reasons)} if reasons else None,
        )
    except Exception:
        logger.warning("Langfuse recusou o voto.", exc_info=True)
        return False
    return True


async def _delete_score(settings: AgentSettings, score_id: str) -> None:
    """`DELETE /api/public/scores/{id}`: o SDK só expõe a exclusão sob `legacy`.

    Tirar um voto que nunca chegou ao Langfuse (404) não é erro.
    """
    import httpx

    async with httpx.AsyncClient(
        base_url=settings.langfuse_host.strip(),
        auth=(settings.langfuse_public_key.strip(), settings.langfuse_secret_key.strip()),
        timeout=5.0,
    ) as http:
        response = await http.delete(f"/api/public/scores/{score_id}")
    if response.status_code != httpx.codes.NOT_FOUND:
        response.raise_for_status()


__all__ = [
    "FEEDBACK_SCORE",
    "NOOP_TRACE",
    "GenerationTrace",
    "ToolTrace",
    "TracedProvider",
    "TurnTrace",
    "get_langfuse",
    "hashed_user_id",
    "langfuse_enabled",
    "mask",
    "messages_for_trace",
    "record_feedback",
    "record_generation",
    "reset_langfuse",
    "shutdown_langfuse",
    "start_turn_trace",
    "trace_id_for",
]
