"""Única implementação de provedor: cliente OpenAI-compatível.

Não há um SDK por fornecedor por trás de uma fachada — o protocolo da OpenAI já
é a fachada, e é o que LM Studio (dev) e Cloudflare AI Gateway (produção) falam.
Trocar de fornecedor é trocar `AI_BASE_URL`, `AI_API_KEY` e o nome do modelo da
capacidade. Nenhuma linha deste arquivo sabe em que ambiente está rodando.
"""

import asyncio
import base64
from collections.abc import Sequence
from typing import Any

import httpx

from .errors import (
    AIProviderNotConfigured,
    AIProviderRefused,
    AIProviderTimeout,
    AIResponseTruncated,
    AIResponseUnparseable,
)

# 429 e 5xx são transientes: o gateway está com fila ou instável. 401/403/400
# não são — repetir só gasta tempo e, no gateway, cota.
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class OpenAICompatProvider:
    """Atende `TextCapability`, `VisionCapability` e `EmbeddingCapability`."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str = "",
        text_model: str = "",
        vision_model: str = "",
        embedding_model: str = "",
        timeout_s: float = 120.0,
        max_retries: int = 2,
        retry_backoff_s: float = 0.5,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._text_model = text_model
        self._vision_model = vision_model
        self._embedding_model = embedding_model
        self._max_retries = max_retries
        self._retry_backoff_s = retry_backoff_s

        # Sem chave, nenhum header de autorização: o LM Studio recusa nada, mas
        # mandar `Bearer ` vazio para um gateway produz um 401 mais confuso do
        # que a ausência do header.
        headers = {"Authorization": f"Bearer {api_key}"} if api_key.strip() else {}

        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout_s,
            headers=headers,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "OpenAICompatProvider":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    # --- capacidades -----------------------------------------------------

    async def complete(self, prompt: str, *, system: str | None = None) -> str:
        model = _require_model(self._text_model, "AI_MODEL_TEXT", "texto")
        messages: list[dict[str, Any]] = []
        if system is not None:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return await self._chat(model, messages)

    async def describe(self, image: bytes, *, prompt: str, media_type: str = "image/jpeg") -> str:
        model = _require_model(self._vision_model, "AI_MODEL_VISION", "visão")
        data_uri = f"data:{media_type};base64,{base64.b64encode(image).decode('ascii')}"
        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }
        ]
        return await self._chat(model, messages)

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        model = _require_model(self._embedding_model, "AI_MODEL_EMBEDDING", "embedding")
        response = await self._request(
            "POST", "embeddings", json={"model": model, "input": list(texts)}
        )
        body = _json_body(response)
        data = body.get("data")
        if not isinstance(data, list) or len(data) != len(texts):
            raise AIResponseUnparseable(
                f"'/embeddings' devolveu {_describe(data)} para {len(texts)} texto(s)."
            )
        # A ordem do array não é contratual; `index` é. Reordenar aqui evita
        # parear vetor com o texto errado sem nenhum sintoma.
        vectors: list[list[float]] = [[] for _ in texts]
        for item in data:
            if not isinstance(item, dict):
                raise AIResponseUnparseable("Item de '/embeddings' não é objeto.")
            index = item.get("index", 0)
            embedding = item.get("embedding")
            if not isinstance(index, int) or not 0 <= index < len(texts):
                raise AIResponseUnparseable(f"'index' fora da faixa em '/embeddings': {index!r}.")
            if not isinstance(embedding, list):
                raise AIResponseUnparseable("'embedding' ausente ou não é lista.")
            vectors[index] = [float(value) for value in embedding]
        return vectors

    async def list_models(self) -> list[str]:
        """Usado pelo teste de fumaça e pelo diagnóstico — não é capacidade."""
        body = _json_body(await self._request("GET", "models"))
        data = body.get("data")
        if not isinstance(data, list):
            raise AIResponseUnparseable("'/models' não devolveu 'data'.")
        return [item["id"] for item in data if isinstance(item, dict) and "id" in item]

    # --- transporte ------------------------------------------------------

    async def _chat(self, model: str, messages: list[dict[str, Any]]) -> str:
        response = await self._request(
            "POST", "chat/completions", json={"model": model, "messages": messages}
        )
        body = _json_body(response)

        choices = body.get("choices")
        if not isinstance(choices, list) or not choices:
            raise AIResponseUnparseable(
                f"'/chat/completions' devolveu {_describe(choices)} em 'choices'."
            )
        choice = choices[0]
        if not isinstance(choice, dict):
            raise AIResponseUnparseable("Primeiro item de 'choices' não é objeto.")

        message = choice.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            raise AIResponseUnparseable(
                f"'message.content' ausente ou não é texto ({_describe(content)})."
            )

        if choice.get("finish_reason") == "length":
            raise AIResponseTruncated(
                f"O modelo '{model}' parou por limite de tokens; a resposta veio pela metade."
            )
        return content

    async def _request(
        self, method: str, path: str, json: dict[str, object] | None = None
    ) -> httpx.Response:
        timeout_message = ""
        for attempt in range(self._max_retries + 1):
            try:
                response = await self._client.request(method, path, json=json)
            except httpx.TimeoutException as exc:
                timeout_message = (
                    f"O provedor não respondeu {method} {path} dentro de AI_TIMEOUT_S ({exc})."
                )
            else:
                if response.status_code < 400:
                    return response
                if response.status_code in RETRYABLE_STATUS and attempt < self._max_retries:
                    await self._backoff(attempt)
                    continue
                raise AIProviderRefused(
                    f"O provedor respondeu {response.status_code} em {method} {path}.",
                    status_code=response.status_code,
                )

            if attempt >= self._max_retries:
                raise AIProviderTimeout(timeout_message)
            await self._backoff(attempt)

        # `range` sempre entra no corpo (max_retries >= 0), então este ponto é
        # inalcançável; fica para o type checker.
        raise AIProviderTimeout(timeout_message)

    async def _backoff(self, attempt: int) -> None:
        if self._retry_backoff_s > 0:
            await asyncio.sleep(self._retry_backoff_s * (2**attempt))


def _require_model(model: str, env_var: str, capability: str) -> str:
    if not model.strip():
        raise AIProviderNotConfigured(
            f"A capacidade de {capability} não tem modelo configurado: defina {env_var}. "
            "Os modelos são variáveis separadas de propósito — o gateway roteia "
            "capacidades diferentes para modelos diferentes."
        )
    return model


def _json_body(response: httpx.Response) -> dict[str, Any]:
    try:
        body: object = response.json()
    except ValueError as exc:
        raise AIResponseUnparseable(
            f"Resposta {response.status_code} não é JSON: {response.text[:120]!r}"
        ) from exc
    if not isinstance(body, dict):
        raise AIResponseUnparseable(f"Corpo JSON não é objeto ({_describe(body)}).")
    return body


def _describe(value: object) -> str:
    return "ausente" if value is None else f"{type(value).__name__}"
