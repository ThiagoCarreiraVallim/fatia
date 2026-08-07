"""Cliente do `/mcp` do `apps/api`, com o Bearer **do usuário** (ADR 021).

É por aqui, e **só** por aqui, que o agente alcança dado de alguém. Não existe
`DATABASE_URL` neste serviço e não deve passar a existir: quem filtra por
`userId` continua sendo o NestJS, com um dono só (ADR 015 e ADR 010).

## Por que um cliente à mão, e não o SDK `mcp`

O `/mcp` do `apps/api` é **sem sessão**: o controller monta um `McpServer` e um
`StreamableHTTPServerTransport` novos a cada requisição HTTP, com
`sessionIdGenerator: undefined`. Nesse modo o transporte não valida sessão nem
exige `initialize` — verificado no `webStandardStreamableHttp.js` da versão
1.30.0, em `validateSession`, que devolve imediatamente quando o gerador é
indefinido. Um handshake de `initialize` negociaria uma sessão que morre com a
resposta: seria uma ida e volta a mais por chamada, sem nada do outro lado para
lembrar dela.

O que sobra do protocolo é um POST de JSON-RPC — `tools/list` e `tools/call` —
com a resposta chegando como um evento SSE. Trinta linhas de transporte, contra
uma dependência que traria máquina de sessão, grupo de tarefas e uma tradução a
mais entre a exceção dela e os erros nomeados que o resto deste serviço usa. O
preço é conhecido e está escrito: se o `/mcp` deixar de ser sem sessão, este
módulo quebra — e o teste de fumaça `tests/smoke/test_mcp_smoke.py` é o que
descobre isso contra o servidor de verdade.

## O Bearer

Ele entra **uma vez**, nos headers do `httpx.AsyncClient`, e não aparece em mais
lugar nenhum: não vai para o estado do grafo, não vai para o log, não vai para a
mensagem de erro e não é devolvido em resposta. As mensagens de erro daqui citam
método e status, nunca o header — é a mesma lição da #214, do lado Python.
"""

import json
from dataclasses import dataclass
from typing import Any

import httpx

from ..settings import AgentSettings, mcp_unavailable_reason
from .errors import (
    McpNotConfigured,
    McpRefused,
    McpResponseUnparseable,
    McpTimeout,
    McpUnauthorized,
    McpUnreachable,
)

# `Accept` com os dois tipos é **exigência do servidor**, não preferência: o
# transporte responde 406 quando falta qualquer um dos dois
# (`handlePostRequest`, "Client must accept both application/json and
# text/event-stream"). A resposta de fato vem como SSE.
ACCEPT = "application/json, text/event-stream"

# `MCP-Protocol-Version` fica **de fora** de propósito. O cabeçalho existe para o
# cliente ecoar a versão negociada no `initialize`, e nós não inicializamos: o
# servidor aceita a ausência e assume o default dele, mas recusa com 400 uma
# versão fora da lista que ele suporta. Mandar um número fixo daqui seria
# prometer uma negociação que não houve — e quebrar no dia em que aquela versão
# saísse da lista.


@dataclass(frozen=True)
class McpToolInfo:
    """Uma tool como o `/mcp` a anuncia. `annotations` é o que decide o recorte."""

    name: str
    description: str
    input_schema: dict[str, Any]
    annotations: dict[str, Any]


class McpClient:
    """Fala JSON-RPC com o `/mcp`. Uma instância por conversa, um Bearer por instância."""

    def __init__(
        self,
        *,
        base_url: str,
        bearer: str,
        timeout_s: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            timeout=timeout_s,
            headers={
                "Authorization": f"Bearer {bearer}",
                "Accept": ACCEPT,
                "Content-Type": "application/json",
            },
            transport=transport,
        )
        self._url = base_url
        self._proximo_id = 0

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "McpClient":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    async def list_tools(self) -> list[McpToolInfo]:
        """O catálogo que o `/mcp` serve para **este** usuário.

        Segue `nextCursor` enquanto houver. O servidor de hoje devolve tudo numa
        página só, mas um catálogo truncado em silêncio seria indistinguível de
        um catálogo pequeno — e o sintoma seria o agente jurar que não sabe fazer
        algo que sabe.
        """
        tools: list[McpToolInfo] = []
        cursor: str | None = None
        # Teto para não virar laço infinito se um servidor devolver sempre o
        # mesmo cursor. 20 páginas é muito mais do que o catálogo inteiro cabe.
        for _ in range(20):
            params: dict[str, Any] = {"cursor": cursor} if cursor else {}
            resultado = await self._rpc("tools/list", params)
            tools.extend(_tools_do_resultado(resultado))
            proximo = resultado.get("nextCursor")
            if not isinstance(proximo, str) or not proximo:
                return tools
            cursor = proximo
        raise McpResponseUnparseable("'tools/list' não parou de paginar depois de 20 páginas.")

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> "McpToolResult":
        """Executa a tool e devolve o texto que ela produziu.

        Erro **de execução** da tool volta como `isError: true` com texto, e não
        como exceção: é assim que o registry do `apps/api` responde (ver
        `mcp-tool.registry.ts`), e o modelo precisa poder ler a categoria e se
        corrigir. Exceção aqui é falha de transporte ou de protocolo.
        """
        resultado = await self._rpc("tools/call", {"name": name, "arguments": arguments})
        return McpToolResult(text=_texto_do_conteudo(resultado), is_error=_e_erro(resultado))

    async def _rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self._proximo_id += 1
        corpo = {
            "jsonrpc": "2.0",
            "id": self._proximo_id,
            "method": method,
            "params": params,
        }

        try:
            response = await self._client.post(self._url, json=corpo)
        except httpx.TimeoutException as exc:
            raise McpTimeout(
                f"O /mcp não respondeu '{method}' dentro de MCP_TIMEOUT_S ({exc})."
            ) from exc
        # `ConnectError`, `ReadError` e `RemoteProtocolError` herdam de
        # `RequestError`, não de `TimeoutException`. Ramo próprio, depois do
        # timeout, que é o mais específico dos dois.
        except httpx.RequestError as exc:
            raise McpUnreachable(
                f"Falha de transporte em '{method}' contra o /mcp: {type(exc).__name__} ({exc}). "
                "Verifique MCP_BASE_URL e se o apps/api está no ar."
            ) from exc

        if response.status_code in (401, 403):
            raise McpUnauthorized(
                f"O /mcp recusou o Bearer do usuário em '{method}' "
                f"({response.status_code}). O token expirou ou não vale para esta instância."
            )
        if response.status_code >= 400:
            raise McpRefused(
                f"O /mcp respondeu {response.status_code} em '{method}'.",
                status_code=response.status_code,
            )

        return _resultado_do_envelope(_envelope_da_resposta(response), method)


@dataclass(frozen=True)
class McpToolResult:
    """O que a tool produziu. `is_error` é a falha *de negócio*, não de transporte."""

    text: str
    is_error: bool


def build_mcp_client(
    settings: AgentSettings,
    *,
    bearer: str,
    transport: httpx.AsyncBaseTransport | None = None,
) -> McpClient:
    """Monta o cliente, ou degrada com erro nomeado — irmão de `build_provider`.

    `transport` existe para o duplo de teste; em produção fica `None`.
    """
    motivo = mcp_unavailable_reason(settings)
    if motivo is not None:
        raise McpNotConfigured(motivo)

    return McpClient(
        base_url=settings.mcp_base_url,
        bearer=bearer,
        timeout_s=settings.mcp_timeout_s,
        transport=transport,
    )


def _envelope_da_resposta(response: httpx.Response) -> dict[str, Any]:
    """O objeto JSON-RPC, venha ele como JSON puro ou dentro de um evento SSE.

    O transporte do `apps/api` responde `text/event-stream` (é o default do SDK
    — `enableJsonResponse` não está ligado), mas o mesmo servidor com aquela
    opção ligada responderia `application/json`. Aceitar os dois custa um `if` e
    evita que uma linha de configuração do outro repositório derrube o chat.
    """
    tipo = response.headers.get("content-type", "")
    bruto = response.text if "text/event-stream" in tipo else None

    if bruto is None:
        return _objeto_json(response.text, contexto="corpo JSON")

    for evento in _eventos_sse(bruto):
        return _objeto_json(evento, contexto="evento SSE")

    raise McpResponseUnparseable(
        "O /mcp respondeu um SSE sem nenhum evento com dado — resposta vazia."
    )


def _eventos_sse(bruto: str) -> list[str]:
    """Os payloads `data:` do fluxo, na ordem, ignorando o que não é dado.

    Três coisas que aparecem no fio e **não** são resposta: comentário de
    keep-alive (`: keepalive`), o evento de priming (que vem com `data:` vazio) e
    as linhas `event:`/`id:`. Um parser que tratasse qualquer uma delas como JSON
    estouraria na primeira conversa longa o bastante para o servidor mandar um
    keep-alive.
    """
    dados: list[str] = []
    for linha in bruto.splitlines():
        if not linha.startswith("data:"):
            continue
        payload = linha[len("data:") :].strip()
        if payload:
            dados.append(payload)
    return dados


def _objeto_json(texto: str, *, contexto: str) -> dict[str, Any]:
    try:
        carregado: object = json.loads(texto)
    except ValueError as exc:
        raise McpResponseUnparseable(
            f"O /mcp respondeu um {contexto} que não é JSON: {texto[:120]!r} ({exc})."
        ) from exc
    if not isinstance(carregado, dict):
        raise McpResponseUnparseable(
            f"O {contexto} do /mcp não é objeto ({type(carregado).__name__})."
        )
    return carregado


def _resultado_do_envelope(envelope: dict[str, Any], method: str) -> dict[str, Any]:
    erro = envelope.get("error")
    if isinstance(erro, dict):
        # A mensagem do JSON-RPC é do nosso próprio servidor, então pode ser
        # repassada — mas truncada: ela vira texto que o modelo lê, e um dump
        # inteiro no prompt é contexto gasto sem retorno.
        mensagem = erro.get("message")
        detalhe = mensagem if isinstance(mensagem, str) else repr(erro)
        raise McpResponseUnparseable(
            f"O /mcp devolveu erro de protocolo em '{method}': {detalhe[:200]}"
        )

    resultado = envelope.get("result")
    if not isinstance(resultado, dict):
        raise McpResponseUnparseable(
            f"O /mcp respondeu '{method}' sem 'result' utilizável "
            f"({type(resultado).__name__ if resultado is not None else 'ausente'})."
        )
    return resultado


def _tools_do_resultado(resultado: dict[str, Any]) -> list[McpToolInfo]:
    tools = resultado.get("tools")
    if not isinstance(tools, list):
        raise McpResponseUnparseable("'tools/list' não devolveu 'tools'.")

    catalogo: list[McpToolInfo] = []
    for item in tools:
        if not isinstance(item, dict):
            raise McpResponseUnparseable("Item de 'tools/list' não é objeto.")
        nome = item.get("name")
        if not isinstance(nome, str) or not nome:
            raise McpResponseUnparseable(f"Tool sem 'name' utilizável em 'tools/list': {nome!r}.")
        descricao = item.get("description")
        schema = item.get("inputSchema")
        anotacoes = item.get("annotations")
        catalogo.append(
            McpToolInfo(
                name=nome,
                description=descricao if isinstance(descricao, str) else "",
                # Objeto vazio e não `None`: o formato de tool da OpenAI exige um
                # schema, e o do JSON Schema para "nenhum parâmetro" é este.
                input_schema=schema if isinstance(schema, dict) else {"type": "object"},
                # Ausente vira `{}`, e `{}` **não** passa no recorte da ADR 021 —
                # falha fechada. Ver `tool_policy.py`.
                annotations=anotacoes if isinstance(anotacoes, dict) else {},
            )
        )
    return catalogo


def _texto_do_conteudo(resultado: dict[str, Any]) -> str:
    """Concatena os blocos de texto de `content`. Bloco não textual é descartado.

    O `apps/api` só emite `{"type": "text"}` (ver `mcp-tool.registry.ts`), mas o
    protocolo permite imagem e recurso. Descartar é melhor que estourar: o que
    interessa ao modelo é o texto, e uma tool que um dia devolva imagem não pode
    derrubar a conversa.
    """
    conteudo = resultado.get("content")
    if not isinstance(conteudo, list):
        raise McpResponseUnparseable("'tools/call' não devolveu 'content'.")

    pedacos = [
        bloco["text"]
        for bloco in conteudo
        if isinstance(bloco, dict)
        and bloco.get("type") == "text"
        and isinstance(bloco.get("text"), str)
    ]
    return "\n".join(pedacos)


def _e_erro(resultado: dict[str, Any]) -> bool:
    return resultado.get("isError") is True


__all__ = [
    "McpClient",
    "McpToolInfo",
    "McpToolResult",
    "build_mcp_client",
]
