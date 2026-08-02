"""Provedor de IA: capacidades (o que o produto pede) e fornecedor (quem atende)."""

import httpx

from ..settings import AgentSettings, ai_unavailable_reason
from .base import (
    EmbeddingCapability,
    TextCapability,
    TranscriptionCapability,
    VisionCapability,
)
from .errors import (
    AIProviderError,
    AIProviderNotConfigured,
    AIProviderRefused,
    AIProviderTimeout,
    AIResponseTruncated,
    AIResponseUnparseable,
)
from .openai_compat import OpenAICompatProvider

__all__ = [
    "AIProviderError",
    "AIProviderNotConfigured",
    "AIProviderRefused",
    "AIProviderTimeout",
    "AIResponseTruncated",
    "AIResponseUnparseable",
    "EmbeddingCapability",
    "OpenAICompatProvider",
    "TextCapability",
    "TranscriptionCapability",
    "VisionCapability",
    "build_provider",
]


def build_provider(
    settings: AgentSettings,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> OpenAICompatProvider:
    """Monta o provedor a partir da configuração, ou degrada com erro nomeado.

    É aqui que a ADR 015 se cumpre: sem `AI_BASE_URL` o serviço não estoura com
    `NoneType` na primeira chamada — levanta `AIProviderNotConfigured` com uma
    mensagem que diz o que preencher.

    `transport` existe para o duplo de teste; em produção fica `None`.
    """
    reason = ai_unavailable_reason(settings)
    if reason is not None:
        raise AIProviderNotConfigured(reason)

    return OpenAICompatProvider(
        base_url=settings.ai_base_url,
        api_key=settings.ai_api_key,
        text_model=settings.ai_model_text,
        vision_model=settings.ai_model_vision,
        embedding_model=settings.ai_model_embedding,
        timeout_s=settings.ai_timeout_s,
        max_retries=settings.ai_max_retries,
        retry_backoff_s=settings.ai_retry_backoff_s,
        transport=transport,
    )
