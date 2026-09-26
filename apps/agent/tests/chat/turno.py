"""Rodar um turno do grafo de ponta a ponta, com os duplos de `support.py`.

O grafo é o de produção, com um `InMemorySaver`: é ele que torna possível
afirmar sobre a pausa e a retomada, que atravessam duas chamadas.
"""

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

import httpx
from langgraph.checkpoint.memory import InMemorySaver

from fatia_agent.chat.graph import GrafoDaConversa, montar_grafo, stream_chat_events
from fatia_agent.chat.mcp_client import McpClient
from fatia_agent.chat.state import ContextoDoTurno, FotoDoTurno
from fatia_agent.chat.tool_policy import todas_permitidas
from fatia_agent.providers import build_provider
from fatia_agent.settings import AgentSettings

from .support import ProviderRecordingTransport, duplo_do_mcp, tool_do_catalogo

TOKEN = "tok-do-usuario"
THREAD = "user-1:conversa-1"
CONVERSA = "conversa-1"

CATALOGO = [
    tool_do_catalogo("list_meals", read_only=True),
    tool_do_catalogo("log_meal", read_only=False, confirmable=True),
    tool_do_catalogo("log_weight", read_only=False, confirmable=True),
    tool_do_catalogo("delete_meal", read_only=False),
]


def quadros(fluxo: Sequence[str]) -> list[tuple[str, Any]]:
    """`(evento, dado já decodificado)` de cada quadro, na ordem do fio."""
    achados: list[tuple[str, Any]] = []
    for quadro in fluxo:
        for bloco in quadro.split("\n\n"):
            nome = next((x[7:] for x in bloco.splitlines() if x.startswith("event: ")), None)
            dado = next((x[6:] for x in bloco.splitlines() if x.startswith("data: ")), None)
            if nome is not None and dado is not None:
                achados.append((nome, json.loads(dado)))
    return achados


@dataclass
class Resultado:
    eventos: list[tuple[str, Any]]
    provider: ProviderRecordingTransport
    mcp: httpx.AsyncBaseTransport
    grafo: GrafoDaConversa
    brutos: list[str] = field(default_factory=list)

    def nomes(self) -> list[str]:
        return [nome for nome, _ in self.eventos]

    def de(self, nome: str) -> list[Any]:
        return [dado for evento, dado in self.eventos if evento == nome]

    def texto(self) -> str:
        """O texto que a tela montaria a partir dos fragmentos."""
        return "".join(dado[0].get("content", "") for dado in self.de("messages"))

    def interrupcao(self) -> dict[str, Any]:
        for dado in self.de("updates"):
            if "__interrupt__" in dado:
                return dado["__interrupt__"][0]
        raise AssertionError("o turno não pausou")

    def mensagens_de_tool(self) -> list[dict[str, Any]]:
        return [
            mensagem
            for dado in self.de("updates")
            for no, conteudo in dado.items()
            if no != "__interrupt__"
            for mensagem in conteudo.get("messages", [])
            if mensagem.get("type") == "tool"
        ]

    def chamadas_ao_mcp(self, nome: str) -> int:
        corpos = [json.loads(r.content) for r in self.mcp.requests]  # type: ignore[attr-defined]
        return sum(
            1
            for corpo in corpos
            if corpo.get("method") == "tools/call" and corpo["params"]["name"] == nome
        )


async def turno(
    settings_factory: Callable[..., AgentSettings],
    turnos_do_provedor: Sequence[list[dict[str, object]]],
    *,
    mensagem: str | None = "o que eu comi ontem?",
    retomada: object = None,
    grafo: GrafoDaConversa | None = None,
    mcp_transport: httpx.AsyncBaseTransport | None = None,
    catalogo: Sequence[dict[str, object]] = CATALOGO,
    historico: Sequence[dict[str, str]] = (),
    timezone: str | None = None,
    thread: str = THREAD,
    token: str = TOKEN,
    memorias: Sequence[dict[str, str]] = (),
    planejar: bool = False,
    fotos: Sequence[FotoDoTurno] = (),
) -> Resultado:
    """Um turno inteiro. Passe o `grafo` de um turno anterior para continuar a thread."""
    provider_transport = ProviderRecordingTransport(turnos_do_provedor)
    provider = build_provider(settings_factory(), transport=provider_transport)
    transporte_mcp = mcp_transport if mcp_transport is not None else duplo_do_mcp(catalogo=catalogo)
    client = McpClient(base_url="http://localhost:3000/mcp", bearer=token, transport=transporte_mcp)
    compilado = grafo if grafo is not None else montar_grafo(InMemorySaver())

    permitidas = todas_permitidas(await client.list_tools())
    contexto = ContextoDoTurno(
        provider=provider,
        client=client,
        permitidas=tuple(permitidas),
        run_id="run-1",
        timezone=timezone,
        historico=tuple(historico),
        memorias=tuple(memorias),
        planejar=planejar,
        fotos=tuple(fotos),
    )
    brutos = [
        quadro
        async for quadro in stream_chat_events(
            compilado,
            contexto,
            thread_id=thread,
            conversation_id=CONVERSA,
            mensagem=mensagem,
            retomada=retomada,
        )
    ]
    await client.aclose()
    await provider.aclose()
    return Resultado(quadros(brutos), provider_transport, transporte_mcp, compilado, brutos)
