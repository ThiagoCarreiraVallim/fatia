"""Chat hospedado: grafo LangGraph + cliente do `/mcp` (ADR 021)."""

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
from .graph import MAX_HISTORICO, MAX_RODADAS_DE_TOOL, MAX_TOOLS_POR_RODADA, stream_chat_events
from .mcp_client import McpClient, McpToolInfo, McpToolResult, build_mcp_client
from .tool_policy import formato_openai, somente_leitura

__all__ = [
    "MAX_HISTORICO",
    "MAX_RODADAS_DE_TOOL",
    "MAX_TOOLS_POR_RODADA",
    "ChatEvent",
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
    "formato_openai",
    "somente_leitura",
    "stream_chat_events",
]
