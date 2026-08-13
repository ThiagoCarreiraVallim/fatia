"""Quais tools do catálogo o agente pode chamar — e por que o critério é este.

**Três camadas, derivadas das anotações que o `/mcp` anuncia em toda sessão**:
* `readOnlyHint is True`      → READ_ONLY (executa direto no chat)
* `confirmableHint is True`   → CONFIRMABLE (pausa pra confirmação visual)
* tudo o mais                 → RESTRICTED (nunca oferecida ao modelo)

Nenhum número mora aqui, e nenhuma edição deste arquivo é necessária para uma
tool nova entrar ou sair de um recorte: a classificação é um campo que o
servidor já serve em toda sessão.

## Por que três camadas, e não leitura vs escrita

Ler é reversível; gravar não; apagar não é nem reversível nem confirmável. A
camada do meio existe porque a tela de confirmação passou a existir (ADR 022): é
ela que mantém a propriedade da #139 — o que a IA produz é sugestão, quem grava
é a pessoa — agora que a escrita entrou no chat. A confirmação é obrigatória por
**construção**, não por disciplina: a confirmável nem chega a `agir` sem
aprovação, e `exigir_aprovada` recusa se chegar.

O que fica de fora nas três camadas é o que não tem volta. "Apaga minha refeição
de ontem" dita para um modelo pequeno é um `delete_meal` a uma alucinação de
distância, e um modal não conserta isso — quem clica "confirmar" num modal está
confirmando o que entendeu, não o que a tool vai fazer.

## Por que um critério derivado, e não uma lista

Uma lista de nomes à mão apodrece de duas formas, e as duas são silenciosas:
tool renomeada some do recorte sem aviso (o agente perde a capacidade e ninguém
liga o sintoma à lista), e tool nova nasce fora dele (ou dentro, se a lista for
por exclusão — e aí é escrita liberada por esquecimento). O critério aqui é um
campo que o servidor **já serve em toda sessão** e que o `apps/api` já protege:
`tool-catalog.spec.ts` reprova qualquer tool que não declare `readOnlyHint`,
`destructiveHint` e `confirmableHint`.

## Falha fechada

Tool sem nenhuma anotação clara, ou com `readOnlyHint`/`confirmableHint` que
não é o booleano `True`, entra em **RESTRICTED** (de fora). Em Python
`1 == True`, e um `if anotacoes.get("confirmableHint")` deixaria `"true"` e
`1` entrarem como confirmáveis. As checagens são por identidade com `True`.

Deletora (`delete_...`) é RESTRICTED, mas **quem garante isso é o `apps/api`**, e
não este módulo: o `tool-catalog.spec.ts` exige `destructiveHint: true` para todo
nome com prefixo `delete_` e reprova `destructiveHint` junto de `confirmableHint`.
As duas regras juntas tornam impossível uma deletora chegar aqui anotada como
confirmável. Reimplementar a checagem por prefixo neste arquivo seria trocar o
critério derivado por uma heurística de nome — exatamente o que a seção acima
descarta.
"""

import json
from collections.abc import Iterable
from typing import Any

from .errors import McpToolArgumentsInvalid, McpToolNotAllowed
from .mcp_client import McpToolInfo


def camada_read_only(catalogo: Iterable[McpToolInfo]) -> list[McpToolInfo]:
    """Camada READ_ONLY: ferramentas de leitura pura."""
    return [tool for tool in catalogo if tool.annotations.get("readOnlyHint") is True]


def camada_confirmavel(catalogo: Iterable[McpToolInfo]) -> list[McpToolInfo]:
    """Camada CONFIRMABLE: ferramentas reversíveis/idempotentes com tela de confirmação."""
    return [tool for tool in catalogo if tool.annotations.get("confirmableHint") is True]


def camada_restrita(catalogo: Iterable[McpToolInfo]) -> list[McpToolInfo]:
    """Camada RESTRICTED: tudo que não é leitura e não é confirmável.

    O complemento das outras duas, e escrito assim de propósito: enumerar o que
    é restrito por característica — prefixo `delete_`, por exemplo — deixaria de
    fora a tool que não casa com nenhuma das características listadas, e ela
    sairia da classificação inteira em vez de cair no lado seguro.
    """
    return [
        tool
        for tool in catalogo
        if tool.annotations.get("readOnlyHint") is not True
        and tool.annotations.get("confirmableHint") is not True
    ]


def todas_permitidas(catalogo: Iterable[McpToolInfo]) -> list[McpToolInfo]:
    """União de READ_ONLY e CONFIRMABLE — o que entra no prompt do modelo.

    Uma tool que declare os dois hints como `True` entraria duas vezes; a
    anotação é contraditória (ler não precisa de confirmação) e o
    `tool-catalog.spec.ts` a reprova, mas duplicar no catálogo do prompt seria
    um jeito silencioso de ela passar. A ordem preserva leitura primeiro.
    """
    read_only = camada_read_only(catalogo)
    vistas = {tool.name for tool in read_only}
    return read_only + [tool for tool in camada_confirmavel(catalogo) if tool.name not in vistas]


def formato_openai(catalogo: Iterable[McpToolInfo]) -> list[dict[str, Any]]:
    """Catálogo MCP → o formato `tools` que o endpoint de chat espera.

    O `inputSchema` do MCP **já é** JSON Schema, que é o que vai em `parameters`.
    Não há tradução de formato aqui, e é de propósito: um tradutor entre dois
    formatos que já são o mesmo é onde nasce o dublê que aceita payload que a
    realidade não tem.

    A única alteração é `_sem_teto_em_array`, e ela não é tradução — é
    contorno de uma limitação nomeada do backend. Ver lá.
    """
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": _sem_teto_em_array(tool.input_schema),
            },
        }
        for tool in catalogo
    ]


def _sem_teto_em_array(schema: object) -> object:
    """Remove `maxLength`/`minLength` de dentro de `items` de array.

    **Contorno de um defeito do llama.cpp**, medido contra o LM Studio local:
    `{"type":"array","items":{"type":"string","maxLength":2000}}` faz o conversor
    de JSON Schema para GBNF falhar com

        Failed to initialize samplers: failed to parse grammar

    e a requisição inteira é recusada. Uma tool assim no catálogo derruba **todas**
    as mensagens do chat, não só as que a chamariam — o schema vai junto de todas.
    Foi o que aconteceu quando `clone_exercise` e `update_custom_exercise` entraram
    no recorte com a camada CONFIRMABLE.

    O mesmo teto **fora** de `items` compila sem problema, e por isso o corte é só
    ali: mexer no que funciona seria degradar a restrição de graça.

    **Nada fica sem validação.** O teto continua no Zod da tool, que é quem valida
    de verdade quando a chamada chega ao `/mcp`; o que se perde é a restrição *na
    geração*. Se o modelo passar do limite, a tool responde erro de validação e ele
    lê e corrige — o caminho que `McpToolRejected` já cobre.

    O catálogo servido a cliente MCP externo **não** passa por aqui: ele continua
    com o schema inteiro, porque o problema é do backend de inferência local, não
    do contrato.
    """
    if isinstance(schema, list):
        return [_sem_teto_em_array(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    saida: dict[str, object] = {}
    for chave, valor in schema.items():
        saida[chave] = _sem_teto(valor) if chave == "items" else _sem_teto_em_array(valor)
    return saida


def _sem_teto(schema: object) -> object:
    """O schema de um item de array, sem os tetos de tamanho. Desce recursivamente."""
    if isinstance(schema, list):
        return [_sem_teto(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    saida: dict[str, object] = {}
    for chave, valor in schema.items():
        if chave in ("maxLength", "minLength"):
            continue
        saida[chave] = _sem_teto(valor)
    return saida


def exigir_permitida(nome: str, permitidas: Iterable[McpToolInfo]) -> None:
    """Recusa antes de chamar, quando o modelo pede uma tool fora do recorte.

    Segunda barreira, e não redundância: a primeira é não oferecer a tool ao
    modelo, e modelo pequeno **inventa** nome de função com frequência. Um nome
    inventado que por acaso exista no catálogo de escrita (`delete_meal` é curto
    e óbvio) viraria escrita sem nunca ter sido oferecida.
    """
    nomes = {tool.name for tool in permitidas}
    if nome in nomes:
        return
    raise McpToolNotAllowed(
        f"O modelo pediu a tool '{nome}', que não está no recorte permitido ao agente. "
        "O chat hospedado chama tools de leitura direto e tools confirmáveis só depois "
        "de aprovação na tela (ADR 022); o que apaga continua sendo o caminho manual "
        "do app."
    )


def exigir_aprovada(
    nome: str,
    argumentos: str,
    confirmaveis: Iterable[McpToolInfo],
    aprovadas: Iterable[tuple[str, str]],
) -> None:
    """Recusa a execução de uma tool CONFIRMABLE que não foi aprovada na tela.

    Segunda barreira, como `exigir_permitida`, e pelo mesmo motivo de existir
    duas: a primeira é o grafo rotear a confirmável para `confirmar` em vez de
    `agir`. Se um dia alguém acrescentar uma aresta, mexer no roteamento ou
    inverter uma condição, é **aqui** que a propriedade da ADR 022 não cai — a
    escrita não acontece por caminho de código, ela acontece por aprovação
    presente.

    Compara nome **e** argumentos: aprovar "registrar 200 g de frango" não pode
    autorizar "registrar 2 kg de frango". A comparação é literal sobre o texto
    que o `proposal` mandou e o PWA devolveu, e não sobre o JSON reserializado,
    porque reserializar é onde entra a diferença de ordem de chave que faria
    duas coisas iguais parecerem diferentes.
    """
    if not any(tool.name == nome for tool in confirmaveis):
        return
    if (nome, argumentos) in set(aprovadas):
        return
    raise McpToolNotAllowed(
        f"A tool '{nome}' altera dados e só roda depois de você aprovar na tela. Nada foi gravado."
    )


def argumentos_do_modelo(bruto: str) -> dict[str, Any]:
    """Texto de `function.arguments` → objeto, ou erro nomeado.

    Vazio vira `{}`: tool sem parâmetro obrigatório é chamada assim por vários
    modelos, e recusar seria transformar o caso mais comum em falha.
    """
    texto = bruto.strip()
    if not texto:
        return {}
    try:
        carregado: object = json.loads(texto)
    except ValueError as exc:
        raise McpToolArgumentsInvalid(
            f"O modelo mandou argumentos que não são JSON: {texto[:120]!r} ({exc})."
        ) from exc
    if not isinstance(carregado, dict):
        raise McpToolArgumentsInvalid(
            f"Os argumentos da tool precisam ser um objeto, veio {type(carregado).__name__}."
        )
    return carregado


def classificar_tools(catalogo: Iterable[McpToolInfo]) -> dict[str, list[McpToolInfo]]:
    """Devolve a classificação completa das tools em cada camada.

    Útil para o prompt do sistema e para logging — mostra ao agente quais são
    as ferramentas confirmáveis pendentes que precisam de OK na tela.
    """
    return {
        "read_only": camada_read_only(catalogo),
        "confirmable": camada_confirmavel(catalogo),
        "restricted": camada_restrita(catalogo),
    }


__all__ = [
    "argumentos_do_modelo",
    "camada_confirmavel",
    "camada_read_only",
    "camada_restrita",
    "classificar_tools",
    "exigir_aprovada",
    "exigir_permitida",
    "formato_openai",
    "todas_permitidas",
]
