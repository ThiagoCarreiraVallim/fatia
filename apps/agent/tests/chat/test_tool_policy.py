"""O recorte de tools do agente — o critério, não uma lista de nomes.

O que estes casos protegem é a propriedade que a ADR 021 escreve: **o chat
hospedado só chama tool de leitura**, e quem decide isso é a anotação que o
próprio `/mcp` serve. Uma lista à mão apodrece; um critério derivado não.
"""

import pytest

from fatia_agent.chat.errors import McpToolArgumentsInvalid, McpToolNotAllowed
from fatia_agent.chat.mcp_client import McpToolInfo
from fatia_agent.chat.tool_policy import (
    argumentos_do_modelo,
    camada_read_only,
    exigir_permitida,
    formato_openai,
)


def tool(nome: str, annotations: dict[str, object]) -> McpToolInfo:
    return McpToolInfo(
        name=nome,
        description=f"descrição de {nome}",
        input_schema={"type": "object", "properties": {"date": {"type": "string"}}},
        annotations=annotations,
    )


def test_so_as_de_leitura_entram_no_recorte():
    catalogo = [
        tool("list_meals", {"readOnlyHint": True, "destructiveHint": False}),
        tool("log_meal", {"readOnlyHint": False, "destructiveHint": False}),
        tool("delete_meal", {"readOnlyHint": False, "destructiveHint": True}),
        tool("get_me", {"readOnlyHint": True, "destructiveHint": False}),
    ]

    assert [t.name for t in camada_read_only(catalogo)] == ["list_meals", "get_me"]


@pytest.mark.parametrize(
    "annotations",
    [
        pytest.param({}, id="sem anotação nenhuma"),
        pytest.param({"destructiveHint": False}, id="sem readOnlyHint"),
        pytest.param({"readOnlyHint": None}, id="readOnlyHint nulo"),
        # `"true"` e `1` são o caso que um `if annotations.get(...)` deixaria
        # passar: em Python `1 == True` e string não vazia é verdadeira. A
        # checagem é por identidade com `True` justamente por isso.
        pytest.param({"readOnlyHint": "true"}, id="readOnlyHint como texto"),
        pytest.param({"readOnlyHint": 1}, id="readOnlyHint como inteiro"),
    ],
)
def test_anotacao_ausente_ou_torta_fica_de_fora(annotations: dict[str, object]):
    """Falha fechada: o que não afirma ser leitura não é oferecido."""
    assert camada_read_only([tool("suspeita", annotations)]) == []


def test_o_criterio_nao_e_o_prefixo_do_nome():
    """Guarda do guarda.

    Se o recorte olhasse o prefixo (`get_`, `list_`), `refresh_achievements` —
    que grava, e que o `apps/api` marca `readOnlyHint: false` de propósito —
    entraria, e `explain_*` sairia. O critério é a anotação, e este caso quebra
    se alguém a trocar por um regex de nome.
    """
    catalogo = [
        tool("get_apagado", {"readOnlyHint": False, "destructiveHint": True}),
        tool("refresh_achievements", {"readOnlyHint": True, "destructiveHint": False}),
    ]

    assert [t.name for t in camada_read_only(catalogo)] == ["refresh_achievements"]


def test_traducao_para_o_formato_do_endpoint_de_chat():
    """O `inputSchema` do MCP **já é** JSON Schema — não há tradução a fazer."""
    permitida = tool("list_meals", {"readOnlyHint": True, "destructiveHint": False})

    assert formato_openai([permitida]) == [
        {
            "type": "function",
            "function": {
                "name": "list_meals",
                "description": "descrição de list_meals",
                "parameters": {"type": "object", "properties": {"date": {"type": "string"}}},
            },
        }
    ]


def test_tool_fora_do_recorte_e_recusada_na_hora_da_chamada():
    """Segunda barreira, e não redundância: o modelo inventa nome de função.

    Não oferecer a tool impede o caminho normal; este caso impede o caminho da
    alucinação, que é o único que importa quando o nome inventado é `delete_meal`.
    """
    permitidas = [tool("list_meals", {"readOnlyHint": True, "destructiveHint": False})]

    with pytest.raises(McpToolNotAllowed) as excinfo:
        exigir_permitida("delete_meal", permitidas)

    assert excinfo.value.code == "MCP_TOOL_NOT_ALLOWED"
    assert "delete_meal" in excinfo.value.message
    # A permitida continua passando — senão o caso acima passaria com um
    # `exigir_permitida` que recusasse tudo.
    exigir_permitida("list_meals", permitidas)


@pytest.mark.parametrize(
    ("bruto", "esperado"),
    [
        ("", {}),
        ("   ", {}),
        ('{"date": "2026-08-05"}', {"date": "2026-08-05"}),
    ],
)
def test_argumentos_do_modelo_aceita_o_que_e_objeto(bruto: str, esperado: dict[str, object]):
    assert argumentos_do_modelo(bruto) == esperado


@pytest.mark.parametrize("bruto", ['{"date":', "[1, 2]", '"texto"'])
def test_argumentos_quebrados_viram_erro_recuperavel(bruto: str):
    """Código próprio: "o modelo produziu texto quebrado" e "o recorte barrou"
    são diagnósticos opostos, e o log precisa distingui-los."""
    with pytest.raises(McpToolArgumentsInvalid) as excinfo:
        argumentos_do_modelo(bruto)

    assert excinfo.value.code == "MCP_TOOL_ARGUMENTS_INVALID"


# ------------------------------------------ o contorno do GBNF (llama.cpp)
#
# O reprodutor é o medido contra o LM Studio local, não um inventado: array de
# string **com** `maxLength` derruba a compilação da grammar e a requisição
# inteira é recusada, enquanto o mesmo teto fora de `items` compila. Ver
# `_sem_teto_em_array`.


def _parametros(tool_info: McpToolInfo) -> dict[str, object]:
    return formato_openai([tool_info])[0]["function"]["parameters"]


def test_teto_dentro_de_items_de_array_e_removido():
    """Uma tool assim no catálogo derrubava **todas** as mensagens do chat."""
    tool_info = tool("clone_exercise", {"readOnlyHint": False, "confirmableHint": True})
    tool_info = McpToolInfo(
        name=tool_info.name,
        description=tool_info.description,
        input_schema={
            "type": "object",
            "properties": {
                "instructions": {"type": "array", "items": {"type": "string", "maxLength": 2000}}
            },
        },
        annotations=tool_info.annotations,
    )

    itens = _parametros(tool_info)["properties"]["instructions"]["items"]
    assert itens == {"type": "string"}


def test_teto_fora_de_items_fica_intacto():
    """Corte cirúrgico: o que compila continua restringindo a geração."""
    tool_info = McpToolInfo(
        name="update_me",
        description="atualiza o perfil",
        input_schema={
            "type": "object",
            "properties": {"name": {"type": "string", "maxLength": 200, "minLength": 1}},
        },
        annotations={"readOnlyHint": False, "confirmableHint": True},
    )

    assert _parametros(tool_info)["properties"]["name"] == {
        "type": "string",
        "maxLength": 200,
        "minLength": 1,
    }


def test_o_resto_do_item_sobrevive():
    """Só os dois tetos saem — `enum`, `type` e `description` continuam guiando o modelo."""
    tool_info = McpToolInfo(
        name="clone_exercise",
        description="copia um exercício",
        input_schema={
            "type": "object",
            "properties": {
                "muscles": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["chest", "lats"],
                        "maxLength": 50,
                        "description": "músculo",
                    },
                }
            },
        },
        annotations={"readOnlyHint": True},
    )

    assert _parametros(tool_info)["properties"]["muscles"]["items"] == {
        "type": "string",
        "enum": ["chest", "lats"],
        "description": "músculo",
    }


def test_teto_em_array_aninhado_tambem_sai():
    """Array de array: a descida é recursiva, senão o defeito volta um nível abaixo."""
    tool_info = McpToolInfo(
        name="x",
        description="d",
        input_schema={
            "type": "object",
            "properties": {
                "grid": {
                    "type": "array",
                    "items": {"type": "array", "items": {"type": "string", "maxLength": 10}},
                }
            },
        },
        annotations={"readOnlyHint": True},
    )

    assert _parametros(tool_info)["properties"]["grid"]["items"]["items"] == {"type": "string"}


def test_o_schema_original_nao_e_mutado():
    """O `McpToolInfo` é compartilhado entre as duas camadas e o `exigir_permitida`.

    Mutar no lugar faria o recorte depender da ordem em que alguém chamou
    `formato_openai` — o tipo de defeito que só aparece no segundo turno.
    """
    schema = {
        "type": "object",
        "properties": {"p": {"type": "array", "items": {"type": "string", "maxLength": 5}}},
    }
    tool_info = McpToolInfo(
        name="x", description="d", input_schema=schema, annotations={"readOnlyHint": True}
    )

    formato_openai([tool_info])

    assert schema["properties"]["p"]["items"] == {"type": "string", "maxLength": 5}
