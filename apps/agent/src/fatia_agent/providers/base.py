"""Capacidades de IA, separadas de quem as fornece.

O código de produto pede "descreva esta imagem" (`VisionCapability`), nunca
"chame o modelo X do fornecedor Y". Qual modelo atende cada capacidade é
configuração (`AI_MODEL_VISION`, `AI_MODEL_TEXT`, `AI_MODEL_EMBEDDING`), lida em
`settings.py` — trocar de modelo ou de fornecedor é editar `.env` e reiniciar.

São protocolos, não classes-base: quem implementa não herda nada, o que mantém
o duplo de teste sendo um objeto qualquer com os métodos certos.
"""

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@runtime_checkable
class TextCapability(Protocol):
    """Texto entra, texto sai."""

    async def complete(self, prompt: str, *, system: str | None = None) -> str: ...


@dataclass(frozen=True)
class ToolCall:
    """Uma tool que o modelo pediu para chamar.

    `arguments` fica como **texto**, exatamente como o modelo emitiu. Fazer o
    `json.loads` aqui perderia a distinção entre "o modelo mandou JSON inválido"
    e "o modelo mandou um objeto que a tool recusa" — dois erros com correções
    diferentes, e o primeiro é comum em modelo pequeno.
    """

    id: str
    name: str
    arguments: str


@dataclass(frozen=True)
class TextDelta:
    """Um pedaço de texto da resposta, na ordem em que o modelo produziu."""

    text: str


@dataclass(frozen=True)
class TurnEnd:
    """Fim de um turno do modelo: ou ele respondeu, ou pediu tools."""

    tool_calls: tuple[ToolCall, ...] = ()
    finish_reason: str = "stop"


@runtime_checkable
class ToolChatCapability(Protocol):
    """Conversa com tools, em streaming.

    Separada de `TextCapability` porque são contratos diferentes: `complete`
    devolve a resposta inteira e não sabe o que é tool. Um chat que só responde
    no fim parece travado (#247), e um chat sem tool não alcança dado nenhum.

    Streaming é `AsyncIterator` e não callback: quem consome é a rota SSE, que
    precisa poder parar de ler no meio quando o cliente desconecta.
    """

    def stream_chat(
        self,
        messages: Sequence[dict[str, object]],
        *,
        tools: Sequence[dict[str, object]] = (),
    ) -> AsyncIterator[TextDelta | TurnEnd]: ...


@runtime_checkable
class VisionCapability(Protocol):
    """Imagem + pergunta entram, texto sai."""

    async def describe(
        self, image: bytes, *, prompt: str, media_type: str = "image/jpeg"
    ) -> str: ...


@runtime_checkable
class EmbeddingCapability(Protocol):
    """Textos entram, vetores saem, na mesma ordem."""

    async def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


@runtime_checkable
class TranscriptionCapability(Protocol):
    """Áudio entra, texto sai.

    Declarado aqui porque a separação capacidade/fornecedor é o que esta issue
    entrega, e transcrição é uma das capacidades. **Sem implementação ainda**:
    o LM Studio local não serve modelo de transcrição, então uma implementação
    hoje só poderia ser testada contra um mock inventado por mim — exatamente o
    "mock com forma que a realidade não tem" que já custou caro aqui. Implementa
    junto com #141 (voz), contra um endpoint de verdade.
    """

    async def transcribe(self, audio: bytes, *, media_type: str) -> str: ...
