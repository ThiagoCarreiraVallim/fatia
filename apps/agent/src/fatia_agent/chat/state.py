"""O estado que o checkpointer grava e o contexto que ele **não** grava.

A linha que separa os dois é a ADR 023 inteira:

- `EstadoDaConversa` vai para o Postgres, a cada passo do grafo. Só entra aqui o
  que é da conversa e pode estar num banco descrito pela LGPD deste produto: as
  falas, as chamadas de tool com seus resultados, as decisões da pessoa.
- `ContextoDoTurno` viaja por `astream(context=...)` e morre com a requisição. É
  aqui que mora o que **não** pode ser gravado — o `McpClient`, que carrega o
  Bearer, e o provedor — e o que só serve a este turno.

Um campo novo com credencial no estado seria o token no banco; o
`tests/chat/test_sem_vazamento.py` lê o checkpoint gravado e procura por ele.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Annotated, Any, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

from ..providers.base import ToolChatCapability
from .mcp_client import McpClient, McpToolInfo


@dataclass(frozen=True)
class ContextoDoTurno:
    """Tudo o que um turno precisa e que não sobrevive a ele.

    Por contexto, e não por fecho na montagem do grafo como antes: o grafo agora
    é compilado **uma vez** por processo, com o checkpointer, e a retomada de uma
    pausa pode chegar horas depois, em outra requisição — com outro Bearer.
    """

    provider: ToolChatCapability
    client: McpClient
    permitidas: tuple[McpToolInfo, ...]
    run_id: str
    timezone: str | None = None
    # As falas que o `apps/api` tem gravadas. Só são lidas quando a thread está
    # fria (primeira mensagem depois de uma purga, ou conversa anterior à ADR
    # 023) — numa thread quente o estado já é a verdade. Ver `hidratar`.
    historico: Sequence[dict[str, str]] = field(default=())


class EstadoDaConversa(TypedDict, total=False):
    """O estado de uma conversa, como o checkpointer o grava.

    - `messages`: a conversa, com o reducer do LangGraph (`add_messages`), que
      substitui no lugar quando o `id` bate — é assim que o portão troca o
      resultado sentinela de `ask_user` pela resposta da pessoa.
    - `decisoes`: `tool_call_id` → aprovou? para as CONFIRMABLE da volta atual.
      É do **turno**: `hidratar` zera no começo de cada mensagem nova.
    - `rodadas`: voltas do modelo que pediram tool neste turno.
    - `hidratada`: a thread já recebeu o histórico do `apps/api` uma vez.
    """

    messages: Annotated[list[AnyMessage], add_messages]
    decisoes: dict[str, bool]
    rodadas: int
    hidratada: bool


def estado_vazio() -> dict[str, Any]:
    """O que zera no começo de um turno novo (e não na retomada de uma pausa)."""
    return {"decisoes": {}, "rodadas": 0}


__all__ = ["ContextoDoTurno", "EstadoDaConversa", "estado_vazio"]
