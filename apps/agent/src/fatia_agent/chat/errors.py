"""Erros nomeados do caminho de chat — o lado do `/mcp`, não o do provedor.

Mesma disciplina de `providers/errors.py`: todo erro carrega um `code` estável,
e é o código que atravessa o HTTP. A família é separada de propósito. Falar com
o provedor de IA e falar com o nosso `/mcp` são duas dependências diferentes,
com donos diferentes e correções diferentes: `AI_PROVIDER_REFUSED` manda olhar o
gateway; `MCP_UNAUTHORIZED` manda olhar o token de quem está conversando.

A herança comum é `Exception`, e não `AIProviderError`, justamente para que
ninguém pesque as duas com um `except` só e trate um 401 do nosso `/mcp` como
"o provedor de IA está fora do ar".
"""


class McpError(Exception):
    """Base de tudo que pode dar errado ao falar com o `/mcp` do `apps/api`."""

    code = "MCP_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class McpNotConfigured(McpError):
    """Falta configuração para sequer tentar: `MCP_BASE_URL` ausente ou insegura."""

    code = "MCP_NOT_CONFIGURED"


class McpUnauthenticated(McpError):
    """A requisição de chat chegou sem Bearer de usuário.

    Recusa **antes** de qualquer inferência, e não durante: o agente age em nome
    de alguém, e sem saber de quem não há o que fazer — nem uma resposta genérica
    de LLM, que já custaria dinheiro e não teria acesso a dado nenhum.
    """

    code = "MCP_UNAUTHENTICATED"


class McpUnauthorized(McpError):
    """O `/mcp` recusou o Bearer: 401 ou 403.

    Código próprio, separado de `MCP_REFUSED`, porque a ação é do usuário e não
    do operador — o token expirou, e quem conserta é quem faz login de novo.
    """

    code = "MCP_UNAUTHORIZED"


class McpUnreachable(McpError):
    """A chamada não virou resposta: conexão recusada, DNS, TLS, conexão fechada.

    Existe pelo mesmo motivo que `AIProviderUnreachable`: `ConnectError`,
    `ReadError` e `RemoteProtocolError` herdam de `httpx.RequestError`, e **não**
    de `TimeoutException`. Tratar só timeout deixava a falha de rede escapar sem
    `code`.
    """

    code = "MCP_UNREACHABLE"


class McpTimeout(McpError):
    """O `/mcp` não respondeu dentro de `MCP_TIMEOUT_S`."""

    code = "MCP_TIMEOUT"


class McpRefused(McpError):
    """O `/mcp` respondeu com status de erro que não é 401/403 (429, 5xx...)."""

    code = "MCP_REFUSED"

    def __init__(self, message: str, *, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


class McpResponseUnparseable(McpError):
    """Veio 200, mas o corpo não tem a forma que o JSON-RPC do MCP promete."""

    code = "MCP_RESPONSE_UNPARSEABLE"


class McpToolRejected(McpError):
    """A chamada de tool foi recusada **antes** de sair do agente.

    Base própria porque estes são os erros **recuperáveis** da conversa: nada
    quebrou, o modelo é que pediu errado. O grafo devolve a mensagem para ele
    como resultado de tool com falha — do mesmo jeito que o `apps/api` devolve
    erro de execução como `isError` em vez de erro de protocolo, e pelo mesmo
    motivo: o modelo precisa poder ler o que houve e se corrigir sozinho.

    Derrubar a conversa aqui trocaria "pedi a tool errada" por "o chat caiu".
    """

    code = "MCP_TOOL_REJECTED"


class McpToolNotAllowed(McpToolRejected):
    """O modelo pediu uma tool fora do recorte permitido ao agente.

    Não é falha de infraestrutura: é o recorte da ADR 021 funcionando. O modelo
    alucina nome de tool com frequência, e um nome inventado que por acaso exista
    no catálogo de escrita não pode virar escrita.
    """

    code = "MCP_TOOL_NOT_ALLOWED"


class McpToolArgumentsInvalid(McpToolRejected):
    """O modelo mandou `arguments` que não são um objeto JSON.

    Código separado do de tool não permitida porque são diagnósticos opostos: um
    é o recorte funcionando, o outro é o modelo produzindo texto quebrado. Ler o
    log e não conseguir distinguir os dois esconderia justamente o sinal de que o
    modelo configurado é pequeno demais para chamar tool.
    """

    code = "MCP_TOOL_ARGUMENTS_INVALID"


__all__ = [
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
]
