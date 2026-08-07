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
    exigir_permitida,
    formato_openai,
    somente_leitura,
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

    assert [t.name for t in somente_leitura(catalogo)] == ["list_meals", "get_me"]


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
    assert somente_leitura([tool("suspeita", annotations)]) == []


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

    assert [t.name for t in somente_leitura(catalogo)] == ["refresh_achievements"]


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
