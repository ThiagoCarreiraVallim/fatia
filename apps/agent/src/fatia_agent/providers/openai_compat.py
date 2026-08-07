"""Única implementação de provedor: cliente OpenAI-compatível.

Não há um SDK por fornecedor por trás de uma fachada — o protocolo da OpenAI já
é a fachada, e é o que LM Studio (dev) e Cloudflare AI Gateway (produção) falam.
Trocar de fornecedor é trocar `AI_BASE_URL`, `AI_API_KEY` e o nome do modelo da
capacidade. Nenhuma linha deste arquivo sabe em que ambiente está rodando.
"""

import asyncio
import base64
import json as jsonlib
from collections.abc import AsyncIterator, Sequence
from typing import Any

import httpx

from ..allowed_models import (
    CAPABILITY_ENV_VARS,
    CAPABILITY_LABELS,
    is_local_destination,
    unreviewed_host_reason,
    unreviewed_model_reason,
)
from .base import (
    EmbeddingCapability,
    TextCapability,
    TextDelta,
    ToolCall,
    ToolChatCapability,
    TurnEnd,
    VisionCapability,
)
from .errors import (
    AIEndpointNotAllowed,
    AIModelNotAllowed,
    AIProviderError,
    AIProviderNotConfigured,
    AIProviderRefused,
    AIProviderTimeout,
    AIProviderUnreachable,
    AIResponseTruncated,
    AIResponseUnparseable,
)

# 429 e 5xx são transientes: o gateway está com fila ou instável. 401/403/400
# não são — repetir só gasta tempo e, no gateway, cota.
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class OpenAICompatProvider:
    """Atende `TextCapability`, `VisionCapability` e `EmbeddingCapability`."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str = "",
        text_model: str = "",
        vision_model: str = "",
        embedding_model: str = "",
        timeout_s: float = 120.0,
        max_retries: int = 2,
        retry_backoff_s: float = 0.5,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._text_model = text_model
        self._vision_model = vision_model
        self._embedding_model = embedding_model
        self._max_retries = max_retries
        self._retry_backoff_s = retry_backoff_s

        # Derivado da própria `base_url`, não recebido como parâmetro: um flag
        # opcional nasceria com default, e o default erraria na direção de
        # liberar — o mesmo motivo pelo qual `hostedInference` é obrigatório na
        # ADR 018. Assim não existe forma de construir o provedor escapando da
        # revisão de modelo, nem por engano nem em teste.
        self._remote_endpoint = not is_local_destination(base_url)
        # Guardada pelo mesmo motivo: a revisão de destino é sobre esta string,
        # e ela precisa estar disponível em `_require_model` — o único ponto por
        # onde toda inferência passa antes de a requisição existir.
        self._base_url = base_url

        # Sem chave, nenhum header de autorização: o LM Studio recusa nada, mas
        # mandar `Bearer ` vazio para um gateway produz um 401 mais confuso do
        # que a ausência do header.
        headers = {"Authorization": f"Bearer {api_key}"} if api_key.strip() else {}

        # Desliga o log do Cloudflare AI Gateway **em cada chamada**.
        #
        # O gateway grava corpo de requisição e corpo de resposta por padrão — é
        # o produto dele. Sem este header, a foto do prato e a resposta do modelo
        # ficariam retidas e visíveis no painel da Cloudflare, e a frase da
        # /privacy sobre não haver bucket, disco ou coluna seria verdadeira só
        # dentro deste repositório. Desligar pela chave do painel resolveria
        # igual — e é o mesmo tipo de promessa que depende de alguém lembrar de
        # uma configuração, que é exatamente o que a #136 existe para não fazer.
        # Aqui a decisão viaja com a requisição e passa por diff (ADR 020).
        #
        # Vai **sempre**, e não só quando `self._remote_endpoint`: a derivação de
        # "isto é local?" é justamente o que um proxy reverso em `localhost`
        # engana, e é aí que a proteção mais faria falta. Para quem não é o
        # gateway é um header desconhecido, ignorado como qualquer outro.
        headers["cf-aig-collect-log"] = "false"

        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout_s,
            headers=headers,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "OpenAICompatProvider":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    # --- capacidades -----------------------------------------------------

    async def complete(self, prompt: str, *, system: str | None = None) -> str:
        model = self._require_model("text", self._text_model)
        messages: list[dict[str, Any]] = []
        if system is not None:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return await self._chat(model, messages)

    async def describe(self, image: bytes, *, prompt: str, media_type: str = "image/jpeg") -> str:
        model = self._require_model("vision", self._vision_model)
        data_uri = f"data:{media_type};base64,{base64.b64encode(image).decode('ascii')}"
        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }
        ]
        return await self._chat(model, messages)

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        model = self._require_model("embedding", self._embedding_model)
        response = await self._request(
            "POST", "embeddings", json={"model": model, "input": list(texts)}
        )
        body = _json_body(response)
        data = body.get("data")
        if not isinstance(data, list) or len(data) != len(texts):
            raise AIResponseUnparseable(
                f"'/embeddings' devolveu {_describe(data)} para {len(texts)} texto(s)."
            )
        # A ordem do array não é contratual; `index` é. Reordenar aqui evita
        # parear vetor com o texto errado sem nenhum sintoma.
        by_index: dict[int, list[float]] = {}
        for item in data:
            if not isinstance(item, dict):
                raise AIResponseUnparseable("Item de '/embeddings' não é objeto.")
            index = item.get("index")
            embedding = item.get("embedding")
            # Sem default: `index` ausente já significou "posição 0", e três
            # itens sem o campo devolviam `[[...], [], []]` — vetor vazio e
            # pareamento errado, em silêncio, que é exatamente o que a
            # reordenação existe para evitar. `bool` é `int` em Python, então
            # `{"index": true}` passaria como posição 1.
            if isinstance(index, bool) or not isinstance(index, int):
                raise AIResponseUnparseable(
                    f"'index' ausente ou não é inteiro em '/embeddings': {index!r}."
                )
            if not 0 <= index < len(texts):
                raise AIResponseUnparseable(f"'index' fora da faixa em '/embeddings': {index!r}.")
            if index in by_index:
                raise AIResponseUnparseable(f"'/embeddings' repetiu o 'index' {index}.")
            if not isinstance(embedding, list):
                raise AIResponseUnparseable("'embedding' ausente ou não é lista.")
            by_index[index] = _floats(embedding)
        # `len(data) == len(texts)` (checado acima) + índices únicos dentro da
        # faixa ⇒ toda posição foi preenchida. Nenhuma chave pode faltar aqui.
        return [by_index[position] for position in range(len(texts))]

    async def stream_chat(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        tools: Sequence[dict[str, Any]] = (),
    ) -> AsyncIterator[TextDelta | TurnEnd]:
        """Conversa em streaming, com tools. Atende `ToolChatCapability`.

        Passa por `_require_model` como todas as outras capacidades — é o único
        ponto por onde a revisão de destino e de modelo da #136 acontece, e o
        chat manda texto do usuário para o mesmo lugar que a foto ia.

        **Sem retentativa, ao contrário de `_request`.** Repetir um POST que já
        entregou tokens duplicaria a resposta na tela; e o backoff, aqui, seria
        indistinguível de "o modelo está pensando" para quem está olhando. Falha
        antes do primeiro byte vira erro nomeado como em qualquer outra chamada.
        """
        model = self._require_model("text", self._text_model)
        payload: dict[str, Any] = {
            "model": model,
            "messages": list(messages),
            "stream": True,
        }
        if tools:
            payload["tools"] = list(tools)

        acumulador = _AcumuladorDeToolCalls()
        finish_reason = "stop"

        try:
            async with self._client.stream("POST", "chat/completions", json=payload) as response:
                if response.status_code >= 400:
                    # O corpo do erro precisa ser lido antes de fechar o stream,
                    # senão `response.text` estoura com `ResponseNotRead`.
                    await response.aread()
                    raise AIProviderRefused(
                        f"O provedor respondeu {response.status_code} em POST chat/completions.",
                        status_code=response.status_code,
                    )

                async for linha in response.aiter_lines():
                    dado = _dado_do_evento_sse(linha)
                    if dado is None:
                        continue
                    if dado == "[DONE]":
                        break

                    bloco = _bloco_de_stream(dado)
                    delta = bloco.get("delta")
                    if isinstance(delta, dict):
                        conteudo = delta.get("content")
                        if isinstance(conteudo, str) and conteudo:
                            yield TextDelta(text=conteudo)
                        acumulador.absorver(delta.get("tool_calls"))

                    razao = bloco.get("finish_reason")
                    if isinstance(razao, str):
                        finish_reason = razao
        except httpx.TimeoutException as exc:
            raise AIProviderTimeout(
                f"O provedor não respondeu POST chat/completions dentro de AI_TIMEOUT_S ({exc})."
            ) from exc
        # Mesmo ramo do `_request`, pelo mesmo motivo: `ConnectError`,
        # `ReadError` e `RemoteProtocolError` herdam de `RequestError`, e **não**
        # de `TimeoutException`. Sem isto, provedor caindo no meio do stream
        # escapava cru, sem `code` — e no meio de um SSE isso é a tela travando
        # sem uma linha dizendo por quê.
        except httpx.RequestError as exc:
            raise AIProviderUnreachable(
                f"Falha de transporte em POST chat/completions: {type(exc).__name__} ({exc}). "
                "Verifique AI_BASE_URL e se o provedor está no ar."
            ) from exc

        if finish_reason == "length":
            raise AIResponseTruncated(
                f"O modelo '{model}' parou por limite de tokens; a resposta veio pela metade."
            )

        yield TurnEnd(tool_calls=acumulador.resultado(), finish_reason=finish_reason)

    async def list_models(self) -> list[str]:
        """Usado pelo teste de fumaça e pelo diagnóstico — não é capacidade."""
        body = _json_body(await self._request("GET", "models"))
        data = body.get("data")
        if not isinstance(data, list):
            raise AIResponseUnparseable("'/models' não devolveu 'data'.")
        return [item["id"] for item in data if isinstance(item, dict) and "id" in item]

    # --- modelo por capacidade -------------------------------------------

    def _require_model(self, capability: str, model: str) -> str:
        """Resolve modelo **e destino** da capacidade, ou recusa com erro nomeado.

        Único ponto por onde toda inferência passa antes de a requisição existir
        — é por isso que a revisão de privacidade da issue #136 mora aqui, e não
        no `build_provider`. Recusar na montagem derrubaria as três capacidades
        por causa de uma; recusar aqui derruba exatamente a que aponta para o
        fornecedor não revisado, e antes de qualquer byte sair.

        A ordem das três recusas é a ordem em que o operador tem que agir:
        preencher a variável vazia, apontar para um destino revisado, e só então
        o nome do modelo faz alguma diferença. Acusar o modelo enquanto a
        `AI_BASE_URL` está errada mandaria a pessoa mexer na lista que não é a
        do problema.
        """
        env_var = CAPABILITY_ENV_VARS.get(capability, "AI_MODEL_*")
        label = CAPABILITY_LABELS.get(capability, capability)

        if not model.strip():
            raise AIProviderNotConfigured(
                f"A capacidade de {label} não tem modelo configurado: defina {env_var}. "
                "Os modelos são variáveis separadas de propósito — o gateway roteia "
                "capacidades diferentes para modelos diferentes."
            )

        endpoint_reason = unreviewed_host_reason(self._base_url)
        if endpoint_reason is not None:
            raise AIEndpointNotAllowed(endpoint_reason)

        reason = unreviewed_model_reason(capability, model, remote=self._remote_endpoint)
        if reason is not None:
            raise AIModelNotAllowed(reason)

        return model

    # --- transporte ------------------------------------------------------

    async def _chat(self, model: str, messages: list[dict[str, Any]]) -> str:
        response = await self._request(
            "POST", "chat/completions", json={"model": model, "messages": messages}
        )
        body = _json_body(response)

        choices = body.get("choices")
        if not isinstance(choices, list) or not choices:
            raise AIResponseUnparseable(
                f"'/chat/completions' devolveu {_describe(choices)} em 'choices'."
            )
        choice = choices[0]
        if not isinstance(choice, dict):
            raise AIResponseUnparseable("Primeiro item de 'choices' não é objeto.")

        message = choice.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            raise AIResponseUnparseable(
                f"'message.content' ausente ou não é texto ({_describe(content)})."
            )

        if choice.get("finish_reason") == "length":
            raise AIResponseTruncated(
                f"O modelo '{model}' parou por limite de tokens; a resposta veio pela metade."
            )
        return content

    async def _request(
        self, method: str, path: str, json: dict[str, object] | None = None
    ) -> httpx.Response:
        pending: AIProviderError | None = None
        for attempt in range(self._max_retries + 1):
            try:
                response = await self._client.request(method, path, json=json)
            except httpx.TimeoutException as exc:
                pending = AIProviderTimeout(
                    f"O provedor não respondeu {method} {path} dentro de AI_TIMEOUT_S ({exc})."
                )
            # `TimeoutException` é só um ramo de `RequestError`: `ConnectError`,
            # `ReadError` e `RemoteProtocolError` **não** herdam dele. Sem este
            # ramo elas atravessavam o provedor cruas, sem `code` — provedor
            # fora do ar virava 500 sem envelope em vez de erro nomeado. Vem
            # depois do timeout de propósito: o ramo mais específico primeiro.
            except httpx.RequestError as exc:
                pending = AIProviderUnreachable(
                    f"Falha de transporte em {method} {path}: {type(exc).__name__} ({exc}). "
                    "Verifique AI_BASE_URL e se o provedor está no ar."
                )
            else:
                if response.status_code < 400:
                    return response
                if response.status_code in RETRYABLE_STATUS and attempt < self._max_retries:
                    await self._backoff(attempt)
                    continue
                raise AIProviderRefused(
                    f"O provedor respondeu {response.status_code} em {method} {path}.",
                    status_code=response.status_code,
                )

            # Falha de transporte é transiente por natureza (conexão recusada
            # enquanto o provedor reinicia, gateway fechando no meio): repete
            # com o mesmo backoff do timeout.
            if attempt >= self._max_retries:
                raise pending
            await self._backoff(attempt)

        # `range` sempre entra no corpo (max_retries >= 0), então este ponto é
        # inalcançável; fica para o type checker.
        raise AIProviderUnreachable(f"Nenhuma tentativa de {method} {path} foi executada.")

    async def _backoff(self, attempt: int) -> None:
        if self._retry_backoff_s > 0:
            await asyncio.sleep(self._retry_backoff_s * (2**attempt))


def _capacidades_atendidas(
    provider: "OpenAICompatProvider",
) -> tuple[TextCapability, VisionCapability, EmbeddingCapability, ToolChatCapability]:
    """Conformidade com os `Protocol` da `base.py`, conferida pelo type checker.

    Protocolo é estrutural: nada obriga esta classe a continuar batendo com ele.
    Sem esta função, renomear um parâmetro de `stream_chat` — ou trocar o tipo do
    que ele devolve — passaria pelo `mypy` sem uma palavra, e o erro apareceria
    só quando o grafo recebesse o objeto errado, em runtime. `runtime_checkable`
    também não pegaria: ele só olha se o método existe.
    """
    return provider, provider, provider, provider


class _AcumuladorDeToolCalls:
    """Junta os pedaços de `tool_calls` que o streaming entrega fatiados.

    O protocolo da OpenAI manda `id` e `function.name` no primeiro fragmento e
    depois só `function.arguments`, um punhado de caracteres por vez, ligados
    pelo `index`. Quem lê fragmento a fragmento e não acumula fica com o nome da
    tool e um JSON pela metade — que falha na validação da tool, longe da causa.
    """

    def __init__(self) -> None:
        self._por_indice: dict[int, dict[str, str]] = {}

    def absorver(self, fragmentos: object) -> None:
        if not isinstance(fragmentos, list):
            return
        for fragmento in fragmentos:
            if not isinstance(fragmento, dict):
                continue
            indice = fragmento.get("index")
            # `bool` é `int` em Python: `{"index": true}` viraria a posição 1.
            if isinstance(indice, bool) or not isinstance(indice, int):
                indice = 0
            atual = self._por_indice.setdefault(indice, {"id": "", "name": "", "arguments": ""})

            identificador = fragmento.get("id")
            if isinstance(identificador, str) and identificador:
                atual["id"] = identificador

            funcao = fragmento.get("function")
            if not isinstance(funcao, dict):
                continue
            nome = funcao.get("name")
            if isinstance(nome, str) and nome:
                atual["name"] = nome
            argumentos = funcao.get("arguments")
            if isinstance(argumentos, str):
                atual["arguments"] += argumentos

    def resultado(self) -> tuple[ToolCall, ...]:
        # Ordenado por `index`: é ele que define a ordem pedida, e um `dict` de
        # fragmentos fora de ordem inverteria duas chamadas sem nenhum sintoma.
        return tuple(
            ToolCall(
                # Modelo local nem sempre manda `id`. Um id vazio quebra a
                # correlação com o `tool_call_id` da resposta, então o índice
                # vira o id — estável dentro do turno, que é onde ele vale.
                id=dados["id"] or f"call_{indice}",
                name=dados["name"],
                arguments=dados["arguments"],
            )
            for indice, dados in sorted(self._por_indice.items())
            if dados["name"]
        )


def _dado_do_evento_sse(linha: str) -> str | None:
    """O payload de uma linha `data:` de SSE; `None` para tudo que não é dado.

    Linha em branco separa evento, linha iniciada por `:` é comentário
    (keep-alive), e `event:`/`id:` são metadados. Nenhum dos três é JSON, e
    tratá-los como se fossem é o erro que faz o parser estourar no primeiro
    keep-alive de um provedor lento.
    """
    if not linha.startswith("data:"):
        return None
    return linha[len("data:") :].strip()


def _bloco_de_stream(dado: str) -> dict[str, Any]:
    """`{"choices": [{...}]}` → o primeiro choice, ou `{}` quando não há.

    Fragmento sem `choices` é comum e legítimo: alguns gateways abrem o stream
    com um bloco só de `usage` ou de metadados.
    """
    try:
        bruto: object = jsonlib.loads(dado)
    except ValueError as exc:
        raise AIResponseUnparseable(
            f"Fragmento do stream não é JSON: {dado[:120]!r} ({exc})."
        ) from exc
    if not isinstance(bruto, dict):
        raise AIResponseUnparseable(f"Fragmento do stream não é objeto ({_describe(bruto)}).")

    choices = bruto.get("choices")
    if not isinstance(choices, list) or not choices:
        return {}
    primeiro = choices[0]
    return primeiro if isinstance(primeiro, dict) else {}


def _floats(embedding: list[Any]) -> list[float]:
    """Converte o vetor, virando erro nomeado se algum elemento não for número.

    `float("abc")` levanta `ValueError` e `float(None)` levanta `TypeError` —
    nenhum dos dois carrega `code`, e é o mesmo buraco do transporte cru.
    """
    try:
        return [float(value) for value in embedding]
    except (TypeError, ValueError) as exc:
        raise AIResponseUnparseable(f"'embedding' tem elemento não numérico: {exc}.") from exc


def _json_body(response: httpx.Response) -> dict[str, Any]:
    try:
        body: object = response.json()
    except ValueError as exc:
        raise AIResponseUnparseable(
            f"Resposta {response.status_code} não é JSON: {response.text[:120]!r}"
        ) from exc
    if not isinstance(body, dict):
        raise AIResponseUnparseable(f"Corpo JSON não é objeto ({_describe(body)}).")
    return body


def _describe(value: object) -> str:
    return "ausente" if value is None else f"{type(value).__name__}"
