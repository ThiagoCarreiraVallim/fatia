"""Pools de conexão HTTP do processo, emprestados aos clientes de cada turno.

O provedor e o cliente do `/mcp` nascem e morrem por requisição — é o que mantém
o Bearer de uma pessoa preso ao cliente dela. O que não precisava morrer junto
era a conexão: cada turno abria um TLS novo até o OpenRouter e uma conexão nova
até o `apps/api`. Os clientes continuam por turno (cabeçalhos, Bearer, timeout);
o pool de sockets embaixo é um só, e sobrevive a eles.
"""

import httpx


class SharedTransport(httpx.AsyncBaseTransport):
    """Transporte que o cliente usa mas não fecha.

    `httpx.AsyncClient.aclose()` fecha o transporte que recebeu. Aqui isso
    derrubaria o pool de todos os turnos em andamento; quem fecha é o `lifespan`,
    por `shutdown()`.

    `retries=1` no transporte do httpx só repete **falha de conexão** (recusada,
    DNS, TLS) — nada foi enviado ainda, então repetir não duplica um POST.
    """

    def __init__(
        self, *, keepalive_expiry_s: float, inner: httpx.AsyncBaseTransport | None = None
    ) -> None:
        # `inner` é para o duplo de teste.
        self._inner = inner or httpx.AsyncHTTPTransport(
            retries=1,
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
                keepalive_expiry=keepalive_expiry_s,
            ),
        )

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        return await self._inner.handle_async_request(request)

    async def aclose(self) -> None:
        return None

    async def shutdown(self) -> None:
        await self._inner.aclose()


__all__ = ["SharedTransport"]
