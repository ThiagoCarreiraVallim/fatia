"""Duplos do chat: o `/mcp` do NestJS e o stream do provedor.

**Os dois emitem o formato de verdade**, e não um formato conveniente. Dublê que
aceita payload que a realidade não tem passa verde exatamente sobre a tradução
que deveria testar — já custou caro aqui.

- O `/mcp` do `apps/api` responde `text/event-stream` com o JSON-RPC dentro de um
  `event: message` (`StreamableHTTPServerTransport` sem `enableJsonResponse`,
  verificado no `webStandardStreamableHttp.js` 1.30.0), e intercala comentários
  de keep-alive (`: keepalive`). Os dois aparecem aqui.
- O provedor OpenAI-compatível responde `data: {...}` por fragmento, com
  `tool_calls` fatiados por `index` e um `data: [DONE]` no fim.
"""

import json
from collections.abc import Callable, Iterable

import httpx

# ---------------------------------------------------------------- /mcp (NestJS)


def sse_jsonrpc(payload: dict[str, object], *, com_keepalive: bool = True) -> httpx.Response:
    """Resposta do `/mcp` exatamente na forma que o transporte do SDK emite."""
    corpo = ""
    if com_keepalive:
        # Comentário de keep-alive: o servidor manda a cada intervalo em stream
        # aberto. Não é JSON, e um parser que tentar carregá-lo estoura.
        corpo += ": keepalive\n\n"
    corpo += f"event: message\ndata: {json.dumps(payload)}\n\n"
    return httpx.Response(
        200,
        content=corpo.encode("utf-8"),
        headers={"content-type": "text/event-stream"},
    )


def resultado_mcp(request_id: object, result: dict[str, object]) -> dict[str, object]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def tool_do_catalogo(
    name: str,
    *,
    read_only: bool,
    description: str = "Descrição de teste com tamanho suficiente.",
    annotations: dict[str, object] | None = None,
) -> dict[str, object]:
    """Uma tool como o registry do `apps/api` a serve.

    `annotations` traz `title` junto dos hints porque é o que
    `mcp-tool.registry.ts` faz (`{ title, ...tool.annotations }`) — o recorte do
    agente tem de funcionar sobre o objeto de verdade, não sobre um com só o
    campo que interessa.
    """
    return {
        "name": name,
        "title": name.replace("_", " ").title(),
        "description": description,
        "inputSchema": {"type": "object", "properties": {}},
        "annotations": annotations
        if annotations is not None
        else {
            "title": name.replace("_", " ").title(),
            "readOnlyHint": read_only,
            "destructiveHint": False,
        },
    }


class McpRecordingTransport(httpx.MockTransport):
    """Grava o que saiu para o `/mcp` — headers inclusive.

    O que mais importa afirmar aqui não é a resposta: é que o `Authorization`
    chegou, e com o token de quem está conversando.
    """

    def __init__(self, handler: Callable[[httpx.Request], httpx.Response]) -> None:
        self.requests: list[httpx.Request] = []

        def _record(request: httpx.Request) -> httpx.Response:
            request.read()
            self.requests.append(request)
            return handler(request)

        super().__init__(_record)

    @property
    def rpcs(self) -> list[dict[str, object]]:
        corpos: list[dict[str, object]] = []
        for request in self.requests:
            corpo: dict[str, object] = json.loads(request.content)
            corpos.append(corpo)
        return corpos

    @property
    def bearers(self) -> list[str]:
        return [request.headers.get("authorization", "") for request in self.requests]


def duplo_do_mcp(
    *,
    catalogo: Iterable[dict[str, object]],
    resultados: dict[str, dict[str, object]] | None = None,
) -> McpRecordingTransport:
    """Um `/mcp` que serve `catalogo` em `tools/list` e `resultados` em `tools/call`."""
    por_tool = resultados or {}
    tools = list(catalogo)

    def handler(request: httpx.Request) -> httpx.Response:
        corpo: dict[str, object] = json.loads(request.content)
        metodo = corpo.get("method")
        request_id = corpo.get("id")

        if metodo == "tools/list":
            return sse_jsonrpc(resultado_mcp(request_id, {"tools": tools}))

        if metodo == "tools/call":
            params = corpo.get("params")
            nome = params.get("name") if isinstance(params, dict) else None
            resultado = por_tool.get(
                str(nome),
                {"content": [{"type": "text", "text": "[]"}]},
            )
            return sse_jsonrpc(resultado_mcp(request_id, resultado))

        return httpx.Response(400, json={"erro": f"método inesperado: {metodo!r}"})

    return McpRecordingTransport(handler)


# ------------------------------------------------------- provedor (OpenAI-like)


def fragmento(**delta: object) -> dict[str, object]:
    return {"choices": [{"index": 0, "delta": delta}]}


def fragmento_de_texto(texto: str) -> dict[str, object]:
    return fragmento(content=texto)


def fragmento_de_tool(
    indice: int,
    *,
    id: str | None = None,
    name: str | None = None,
    arguments: str = "",
) -> dict[str, object]:
    """Um fragmento de `tool_calls` como o protocolo os fatia.

    `id` e `name` só no primeiro; os seguintes trazem só um pedaço de
    `arguments`. Reproduzir isso é o ponto: um dublê que mandasse a tool call
    inteira de uma vez passaria verde sobre um acumulador quebrado.
    """
    funcao: dict[str, object] = {"arguments": arguments}
    if name is not None:
        funcao["name"] = name
    chamada: dict[str, object] = {"index": indice, "function": funcao}
    if id is not None:
        chamada["id"] = id
    return fragmento(tool_calls=[chamada])


def fim(finish_reason: str = "stop") -> dict[str, object]:
    return {"choices": [{"index": 0, "delta": {}, "finish_reason": finish_reason}]}


def stream_do_provedor(fragmentos: Iterable[dict[str, object]]) -> httpx.Response:
    """Resposta de `/chat/completions` com `stream: true`."""
    linhas = [f"data: {json.dumps(bloco)}\n\n" for bloco in fragmentos]
    linhas.append("data: [DONE]\n\n")
    return httpx.Response(
        200,
        content="".join(linhas).encode("utf-8"),
        headers={"content-type": "text/event-stream"},
    )


class ProviderRecordingTransport(httpx.MockTransport):
    """Devolve um roteiro de turnos, um por chamada a `/chat/completions`."""

    def __init__(self, turnos: Iterable[list[dict[str, object]]]) -> None:
        self.requests: list[httpx.Request] = []
        self._turnos = list(turnos)

        def _record(request: httpx.Request) -> httpx.Response:
            request.read()
            self.requests.append(request)
            indice = min(len(self.requests) - 1, len(self._turnos) - 1)
            return stream_do_provedor(self._turnos[indice])

        super().__init__(_record)

    @property
    def corpos(self) -> list[dict[str, object]]:
        enviados: list[dict[str, object]] = []
        for request in self.requests:
            corpo: dict[str, object] = json.loads(request.content)
            enviados.append(corpo)
        return enviados
