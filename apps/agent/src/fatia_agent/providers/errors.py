"""Erros nomeados do provedor de IA.

Todo erro carrega um `code` estável. É esse código que atravessa o HTTP e chega
ao NestJS — a mensagem em português é para o humano que lê o log, o código é
para o cliente decidir se cai no caminho manual.

A degradação exigida pela ADR 015 é `AIProviderNotConfigured`: sem `AI_BASE_URL`
o serviço **sobe**, `/health` responde 200, e é só quando alguém pede inferência
que o erro nomeado aparece — com uma mensagem que diz o que fazer.
"""


class AIProviderError(Exception):
    """Base de tudo que pode dar errado ao falar com o provedor."""

    code = "AI_PROVIDER_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class AIProviderNotConfigured(AIProviderError):
    """Falta configuração para sequer tentar a chamada. Não é falha do provedor."""

    code = "AI_PROVIDER_NOT_CONFIGURED"


class AIProviderTimeout(AIProviderError):
    """O provedor não respondeu dentro de `AI_TIMEOUT_S`."""

    code = "AI_PROVIDER_TIMEOUT"


class AIProviderRefused(AIProviderError):
    """O provedor respondeu com status de erro (401, 429, 5xx...)."""

    code = "AI_PROVIDER_REFUSED"

    def __init__(self, message: str, *, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


class AIResponseUnparseable(AIProviderError):
    """Veio 200, mas o corpo não tem a forma que a chamada precisa."""

    code = "AI_RESPONSE_UNPARSEABLE"


class AIResponseTruncated(AIProviderError):
    """O modelo parou por limite de tokens.

    Merece erro próprio, e não um retorno feliz com texto pela metade: saída
    truncada é indistinguível de saída completa para quem só lê a string, e o
    sintoma aparece longe da causa.
    """

    code = "AI_RESPONSE_TRUNCATED"
