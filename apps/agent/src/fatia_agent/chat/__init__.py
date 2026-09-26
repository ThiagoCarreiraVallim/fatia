"""Chat hospedado: grafo LangGraph com checkpointer + cliente do `/mcp` (ADR 021, 022 e 023)."""

from .checkpointer import SCHEMA, Checkpointer, thread_da_conversa
from .errors import (
    McpError,
    McpNotConfigured,
    McpRefused,
    McpResponseUnparseable,
    McpTimeout,
    McpToolArgumentsInvalid,
    McpToolNotAllowed,
    McpToolRejected,
    McpUnauthenticated,
    McpUnauthorized,
    McpUnreachable,
)
from .events import ChatEvent
from .graph import (
    MAX_HISTORICO,
    MAX_RODADAS_DE_TOOL,
    MAX_TOOLS_POR_RODADA,
    GrafoDaConversa,
    interrupcao_pendente,
    montar_grafo,
    stream_chat_events,
)
from .mcp_client import McpClient, McpToolInfo, McpToolResult, build_mcp_client
from .state import ContextoDoTurno, EstadoDaConversa
from .tool_policy import (
    camada_confirmavel,
    camada_read_only,
    camada_restrita,
    classificar_tools,
    exigir_permitida,
    formato_openai,
    todas_permitidas,
)

__all__ = [
    "MAX_HISTORICO",
    "MAX_RODADAS_DE_TOOL",
    "MAX_TOOLS_POR_RODADA",
    "SCHEMA",
    "ChatEvent",
    "Checkpointer",
    "ContextoDoTurno",
    "EstadoDaConversa",
    "GrafoDaConversa",
    "McpClient",
    "McpError",
    "McpNotConfigured",
    "McpRefused",
    "McpResponseUnparseable",
    "McpTimeout",
    "McpToolArgumentsInvalid",
    "McpToolInfo",
    "McpToolNotAllowed",
    "McpToolRejected",
    "McpToolResult",
    "McpUnauthenticated",
    "McpUnauthorized",
    "McpUnreachable",
    "build_mcp_client",
    "camada_confirmavel",
    "camada_read_only",
    "camada_restrita",
    "classificar_tools",
    "exigir_permitida",
    "formato_openai",
    "interrupcao_pendente",
    "montar_grafo",
    "stream_chat_events",
    "thread_da_conversa",
    "todas_permitidas",
]
