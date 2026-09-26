"""O `/mcp` do cenário: catálogo e respostas fixos, e o registro do que foi pedido.

🔴 **Nenhum caso escreve em lugar nenhum.** A escrita que o modelo pede é
respondida pelo cenário, como a leitura — o benchmark mede se o agente pediu a
coisa certa, com a confirmação certa, e não o banco.

O fio é o do `apps/api` de verdade (`event: message` com JSON-RPC dentro), para o
`McpClient` de produção fazer o mesmo parse que faz no ar.
"""

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

import httpx

Resposta = dict[str, Any] | list[Any] | str
Fixture = Resposta | Callable[[dict[str, Any]], Resposta]


def tool(
    nome: str,
    titulo: str,
    descricao: str,
    *,
    leitura: bool,
    confirmavel: bool = False,
    propriedades: Mapping[str, Any] | None = None,
    obrigatorias: Sequence[str] = (),
) -> dict[str, Any]:
    """Uma tool como o registry do `apps/api` a anuncia, com as anotações da ADR 022."""
    return {
        "name": nome,
        "title": titulo,
        "description": descricao,
        "inputSchema": {
            "type": "object",
            "properties": dict(propriedades or {}),
            "required": list(obrigatorias),
        },
        "annotations": {
            "title": titulo,
            "readOnlyHint": leitura,
            "destructiveHint": False,
            "confirmableHint": confirmavel,
        },
    }


@dataclass
class Chamada:
    nome: str
    argumentos: dict[str, Any]
    resposta: str


@dataclass
class CenarioMcp:
    """Serve `catalogo` em `tools/list` e `fixtures` em `tools/call`, gravando tudo."""

    catalogo: Sequence[dict[str, Any]]
    fixtures: Mapping[str, Fixture] = field(default_factory=dict)
    chamadas: list[Chamada] = field(default_factory=list)

    def transporte(self) -> httpx.MockTransport:
        return httpx.MockTransport(self._responder)

    def _responder(self, request: httpx.Request) -> httpx.Response:
        corpo = json.loads(request.content)
        metodo = corpo.get("method")
        if metodo == "tools/list":
            return _sse(corpo.get("id"), {"tools": list(self.catalogo)})
        if metodo == "tools/call":
            params = corpo.get("params") or {}
            nome = str(params.get("name"))
            argumentos = params.get("arguments") or {}
            fixture = self.fixtures.get(nome, [])
            dado = fixture(argumentos) if callable(fixture) else fixture
            texto = dado if isinstance(dado, str) else json.dumps(dado, ensure_ascii=False)
            self.chamadas.append(Chamada(nome, argumentos, texto))
            return _sse(corpo.get("id"), {"content": [{"type": "text", "text": texto}]})
        return httpx.Response(400, json={"erro": f"método inesperado: {metodo!r}"})


def _sse(request_id: object, resultado: dict[str, Any]) -> httpx.Response:
    payload = {"jsonrpc": "2.0", "id": request_id, "result": resultado}
    return httpx.Response(
        200,
        content=f"event: message\ndata: {json.dumps(payload)}\n\n".encode(),
        headers={"content-type": "text/event-stream"},
    )


__all__ = ["CenarioMcp", "Chamada", "Fixture", "tool"]
