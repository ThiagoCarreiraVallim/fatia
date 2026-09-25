"""Roda os casos pelo grafo de produção, contra o cenário, e confere os checks.

**O caminho é o de produção inteiro:** o mesmo `montar_grafo`, o mesmo prompt, o
mesmo `McpClient` e o mesmo recorte da ADR 022. Só o `/mcp` é o do cenário, e o
checkpointer é em memória — a pausa e a retomada atravessam turnos do mesmo jeito.
"""

import json
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver

from ...chat.graph import montar_grafo, stream_chat_events
from ...chat.mcp_client import McpClient
from ...chat.state import ContextoDoTurno
from ...chat.tool_policy import todas_permitidas
from ...providers.base import ToolChatCapability
from .casos import CATALOGO, Caso
from .cenario import CenarioMcp
from .checks import Resultado, Traco


@dataclass
class ResultadoDoCaso:
    id: str
    checks: list[Resultado]
    traco: Traco
    duracao_s: float
    unidades: dict[str, int] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return all(r.ok for r in self.checks)

    def como_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "ok": self.ok,
            "durationSeconds": round(self.duracao_s, 2),
            "units": self.unidades,
            "status": self.traco.status,
            "executed": [
                {"name": c.nome, "arguments": c.argumentos} for c in self.traco.executadas
            ],
            "pauses": [p.get("kind") for p in self.traco.pausas],
            "answer": self.traco.resposta,
            "errors": self.traco.erros,
            "checks": [r.como_dict() for r in self.checks],
        }


def _quadros(brutos: Sequence[str]) -> list[tuple[str, Any]]:
    achados: list[tuple[str, Any]] = []
    for quadro in brutos:
        for bloco in quadro.split("\n\n"):
            linhas = bloco.splitlines()
            nome = next((x[7:] for x in linhas if x.startswith("event: ")), None)
            dado = next((x[6:] for x in linhas if x.startswith("data: ")), None)
            if nome is not None and dado is not None:
                achados.append((nome, json.loads(dado)))
    return achados


def _absorver(traco: Traco, unidades: dict[str, int], eventos: list[tuple[str, Any]]) -> None:
    for nome, dado in eventos:
        if nome == "updates":
            for no, conteudo in dado.items():
                if no == "__interrupt__":
                    traco.pausas.extend(item.get("value") or {} for item in conteudo)
                    continue
                for mensagem in conteudo.get("messages", []):
                    traco.pedidas.extend(mensagem.get("tool_calls") or [])
        elif nome == "messages/complete":
            for mensagem in dado:
                texto = mensagem.get("content")
                if mensagem.get("type") == "ai" and isinstance(texto, str) and texto.strip():
                    traco.resposta = texto
        elif nome == "usage":
            for chave in ("inputUnits", "outputUnits"):
                if isinstance(dado.get(chave), int):
                    unidades[chave] = unidades.get(chave, 0) + dado[chave]
        elif nome == "error":
            traco.erros.append(dado)
        elif nome == "done":
            traco.status = dado.get("status", "error")


async def rodar_caso(caso: Caso, provider: ToolChatCapability) -> ResultadoDoCaso:
    cenario = CenarioMcp(catalogo=CATALOGO, fixtures=caso.fixtures)
    grafo = montar_grafo(InMemorySaver())
    traco = Traco(executadas=cenario.chamadas)
    unidades: dict[str, int] = {}
    inicio = time.monotonic()

    for indice, turno in enumerate(caso.turnos):
        async with McpClient(
            base_url="http://cenario.local/mcp",
            bearer="benchmark",
            transport=cenario.transporte(),
        ) as client:
            contexto = ContextoDoTurno(
                provider=provider,
                client=client,
                permitidas=tuple(todas_permitidas(await client.list_tools())),
                run_id=f"bench-{caso.id}-{indice}",
                timezone=caso.timezone,
                memorias=caso.memorias,
            )
            brutos = [
                quadro
                async for quadro in stream_chat_events(
                    grafo,
                    contexto,
                    thread_id=f"bench:{caso.id}",
                    conversation_id=caso.id,
                    mensagem=turno.mensagem,
                    retomada=turno.retomada,
                )
            ]
        _absorver(traco, unidades, _quadros(brutos))

    return ResultadoDoCaso(
        id=caso.id,
        checks=[check.rodar(traco) for check in caso.checks],
        traco=traco,
        duracao_s=time.monotonic() - inicio,
        unidades=unidades,
    )


def resumo_em_markdown(resultados: Sequence[ResultadoDoCaso], *, modelo: str) -> str:
    passaram = sum(r.ok for r in resultados)
    linhas = [
        f"# Benchmark do chat — {modelo}",
        "",
        f"**{passaram} de {len(resultados)} casos passaram.**",
        "",
        "| caso | resultado | tempo | o que falhou |",
        "| --- | --- | --- | --- |",
    ]
    for r in resultados:
        falhas = "; ".join(f"{c.nome} ({c.detalhe})" for c in r.checks if not c.ok) or "—"
        linhas.append(f"| `{r.id}` | {'✅' if r.ok else '❌'} | {r.duracao_s:.1f} s | {falhas} |")
    return "\n".join(linhas) + "\n"


__all__ = ["ResultadoDoCaso", "resumo_em_markdown", "rodar_caso"]
