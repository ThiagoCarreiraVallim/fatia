"""Duplo do provedor: transporte que grava o que saiu e respostas gravadas.

Tudo aqui roda **sem rede e sem LM Studio ligado** — o transporte do httpx é
trocado por um `MockTransport`.
"""

import json
from collections.abc import Callable

import httpx


class RecordingTransport(httpx.MockTransport):
    """`MockTransport` que guarda as requisições, para poder afirmar sobre elas.

    O que mais importa afirmar não é a resposta — é o que **saiu**: qual modelo
    foi pedido, se o header de autorização foi mandado, quantas tentativas
    houve. Sem isso, "trocar de provedor por configuração" não é verificável.
    """

    def __init__(self, handler: Callable[[httpx.Request], httpx.Response]) -> None:
        self.requests: list[httpx.Request] = []

        def _record(request: httpx.Request) -> httpx.Response:
            request.read()
            self.requests.append(request)
            return handler(request)

        super().__init__(_record)

    @property
    def last_json(self) -> dict[str, object]:
        body: dict[str, object] = json.loads(self.requests[-1].content)
        return body


def chat_response(content: str, *, finish_reason: str = "stop") -> httpx.Response:
    """Resposta de `/chat/completions` na forma que o LM Studio devolve."""
    return httpx.Response(
        200,
        json={
            "id": "chatcmpl-1",
            "object": "chat.completion",
            "model": "qualquer",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": finish_reason,
                }
            ],
        },
    )
