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
from .tool_policy import (
    camada_confirmavel,
    camada_read_only,
    camada_restrita,
    classificar_tools,
    formato_openai,
    somente_leitura,
    todas_permitidas,
)

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
    "McpToolNotAllowed",
    "McpToolRejected",
    "McpUnauthenticated",
    "McpUnauthorized",
    "McpUnreachable",
    "build_mcp_client",
    "camada_confirmavel",
    "camada_read_only",
    "camada_restrita",
    "classificar_tools",
    "formato_openai",
    "somente_leitura",
    "stream_chat_events",
    "todas_permitidas",
]
