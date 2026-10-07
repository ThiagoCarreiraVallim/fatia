"""O runner do eval da fronteira, sem rede: `/mcp` e provedor são dublês do formato real."""

import ast
import json
from collections.abc import Sequence
from pathlib import Path

import httpx
import pytest

from fatia_agent.eval.contas import ContaDeAvaliacao, TokensDeAvaliacao
from fatia_agent.eval.fronteira_tarefas import Tarefa, carregar
from fatia_agent.eval.run_fronteira import (
    HEADER_SUPERFICIE,
    ConfiguracaoRecusada,
    ProvedorDoEval,
    conferir_catalogo,
    executar,
    exigir_provedor_fixo,
    medir_catalogo,
    sha_do_catalogo,
)
from tests.chat.support import (
    ProviderRecordingTransport,
    bloco_de_uso,
    duplo_do_mcp,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
    tool_do_catalogo,
)
from tests.eval.test_contas import _jwt

SRC = Path(__file__).resolve().parents[2] / "src" / "fatia_agent"


# --- recusas de configuração ----------------------------------------------


def test_openrouter_sem_provedor_fixo_e_recusado() -> None:
    url = "https://openrouter.ai/api/v1"
    with pytest.raises(ConfiguracaoRecusada, match="allow_fallbacks"):
        exigir_provedor_fixo(url, {})
    with pytest.raises(ConfiguracaoRecusada):
        exigir_provedor_fixo(url, {"provider": {"order": ["deepinfra"]}})
    exigir_provedor_fixo(url, {"provider": {"order": ["deepinfra"], "allow_fallbacks": False}})
    exigir_provedor_fixo("http://localhost:1234/v1", {})


def test_braco_b_servido_como_a_e_recusado_antes_de_custar_alguma_coisa() -> None:
    tarefas = carregar()
    catalogo_a = {n for t in tarefas for v in t.gabarito_a for n in v}
    catalogo_b = {n for t in tarefas for v in t.gabarito_b for n in v}

    conferir_catalogo("A", catalogo_a, tarefas)
    conferir_catalogo("B", catalogo_b, tarefas)
    with pytest.raises(ConfiguracaoRecusada, match="ainda não conhece o header"):
        conferir_catalogo("B", catalogo_a | catalogo_b, tarefas)
    with pytest.raises(ConfiguracaoRecusada, match="não tem"):
        conferir_catalogo("A", catalogo_a - {"get_nutrition_goals"}, tarefas)


def test_o_hash_do_catalogo_muda_quando_uma_descricao_muda() -> None:
    from fatia_agent.chat.mcp_client import McpToolInfo

    a = McpToolInfo("x", "uma descrição", {}, {"readOnlyHint": True})
    b = McpToolInfo("x", "outra descrição", {}, {"readOnlyHint": True})
    assert sha_do_catalogo([a]) != sha_do_catalogo([b])


def test_medir_conta_o_catalogo_servido_e_o_recorte_do_chat() -> None:
    from fatia_agent.chat.mcp_client import McpToolInfo

    leitura = {"readOnlyHint": True, "destructiveHint": False, "confirmableHint": False}
    escrita = {"readOnlyHint": False, "destructiveHint": False, "confirmableHint": True}
    restrita = {"readOnlyHint": False, "destructiveHint": True, "confirmableHint": False}
    catalogo = [
        McpToolInfo("get_x", "lê", {"type": "object"}, leitura),
        McpToolInfo("log_x", "grava", {"type": "object"}, escrita),
        McpToolInfo("delete_x", "apaga", {"type": "object"}, restrita),
    ]

    medida = medir_catalogo(catalogo, contar=len)

    assert (medida.servidas, medida.no_chat) == (3, 2)
    # A restrita pesa no catálogo servido e não no do chat.
    assert medida.tokens_servidas > medida.tokens_no_chat > 0
    assert medida.tokens_descricoes_no_chat == len("lê") + len("grava")
    assert medida.sha256 == sha_do_catalogo(catalogo)


def test_o_provedor_sem_revisao_de_destino_nao_e_importado_pelo_produto() -> None:
    """`ProvedorDoEval` pula a revisão da #136. Fora do eval, isso seria dado real saindo."""
    for arquivo in SRC.rglob("*.py"):
        if arquivo.parent.name == "eval":
            continue
        arvore = ast.parse(arquivo.read_text(encoding="utf-8"))
        for no in ast.walk(arvore):
            modulo = getattr(no, "module", None) or ""
            nomes = [a.name for a in getattr(no, "names", [])]
            assert "run_fronteira" not in modulo and "run_fronteira" not in " ".join(nomes), (
                f"{arquivo} importa o runner do eval"
            )


def test_chat_extra_nao_troca_o_modelo() -> None:
    with pytest.raises(ValueError, match="model"):
        ProvedorDoEval(
            base_url="https://openrouter.ai/api/v1", text_model="m", chat_extra={"model": "x"}
        )


# --- uma tarefa, de ponta a ponta -----------------------------------------


class _Tokens(TokensDeAvaliacao):
    def __init__(self) -> None:
        super().__init__(
            logto_endpoint="http://localhost:3001",
            app_id="app",
            app_secret="segredo",
            audience="https://api.fatia.local",
            contas={"usuario": ContaDeAvaliacao("usuario", "sub-u", "pat")},
            transport=httpx.MockTransport(
                lambda _r: httpx.Response(
                    200,
                    json={
                        "access_token": _jwt(sub="sub-u", aud="https://api.fatia.local"),
                        "expires_in": 3600,
                    },
                )
            ),
        )


def _tarefa() -> Tarefa:
    return Tarefa(
        id="nutri-registrar-cafe",
        familia="nutricao",
        persona="usuario",
        split="dev",
        pedido="Registra meu café da manhã: dois ovos.",
        gabarito_a=(("search_food", "log_meal"),),
        gabarito_b=(("record_meal",),),
        passos_min_a=2,
        passos_min_b=1,
    )


async def test_executa_aprova_a_proposta_e_conta_cada_chamada_uma_vez() -> None:
    mcp = duplo_do_mcp(
        catalogo=[
            tool_do_catalogo("search_food", read_only=True),
            tool_do_catalogo("log_meal", read_only=False, confirmable=True),
            tool_do_catalogo("get_me", read_only=True),
        ],
        resultados={
            "get_me": {"content": [{"type": "text", "text": '{"timezone":"America/Cuiaba"}'}]},
        },
    )
    provedor = ProviderRecordingTransport(
        [
            # Rodada 1: busca o alimento.
            [
                fragmento_de_tool(0, id="c1", name="search_food", arguments='{"q":"ovo"}'),
                fim("tool_calls"),
                bloco_de_uso(),
            ],
            # Rodada 2: propõe a escrita — o turno fecha esperando a tela.
            [
                fragmento_de_tool(
                    0, id="c2", name="log_meal", arguments='{"mealType":"BREAKFAST"}'
                ),
                fim("tool_calls"),
                bloco_de_uso(),
            ],
            # Turno "Confirmar": a aprovada executa sem passar pelo modelo; ele só narra.
            [fragmento_de_texto("Registrado."), fim(), bloco_de_uso()],
        ]
    )
    reposicoes: list[Sequence[str]] = []

    async def repor(estado: Sequence[str]) -> None:
        reposicoes.append(estado)

    async with ProvedorDoEval(
        base_url="https://openrouter.ai/api/v1",
        text_model="google/gemma-4-31b-it",
        chat_extra={"temperature": 1, "provider": {"order": ["x"], "allow_fallbacks": False}},
        transport=provedor,
    ) as provider:
        execucao, _ = await executar(
            _tarefa(),
            "B",
            1,
            provider=provider,
            tokens=_Tokens(),
            mcp_url="http://localhost:3000/mcp",
            repor=repor,
            transport=mcp,
        )

    assert reposicoes == [()]
    assert [(c.nome, c.origem) for c in execucao.chamadas] == [
        ("search_food", "leitura"),
        ("log_meal", "proposta"),
    ]
    # A escrita aprovada executou no turno seguinte, e o resultado ficou na proposta.
    assert execucao.chamadas[1].ok is True
    assert execucao.aprovacoes == 1
    assert execucao.motivos == ("awaiting_confirmation", "stop")
    assert execucao.chamadas_ao_modelo == 3
    assert execucao.tokens_entrada == 812 * 3
    assert execucao.hoje

    # A aprovada chegou ao /mcp — é a tela clicando "Confirmar".
    chamadas_mcp = [r["params"]["name"] for r in mcp.rpcs if r["method"] == "tools/call"]  # type: ignore[index]
    assert chamadas_mcp == ["get_me", "search_food", "log_meal"]
    # O braço B pede a superfície de intenção em toda requisição ao /mcp.
    assert {r.headers.get(HEADER_SUPERFICIE) for r in mcp.requests} == {"intencao"}
    # E o corpo extra viaja em toda chamada ao modelo, sem trocar o modelo.
    assert all(
        c["temperature"] == 1 and c["model"] == "google/gemma-4-31b-it" for c in provedor.corpos
    )
    # A retomada não repete o pedido nem a proposta: a escrita aprovada sai do checkpoint,
    # e o modelo só lê o resultado dela.
    ultimo: list[dict[str, object]] = provedor.corpos[-1]["messages"]  # type: ignore[assignment]
    assert [m["role"] for m in ultimo] == [
        "system",
        "user",
        "assistant",
        "tool",
        "assistant",
        "tool",
    ]
    assert json.dumps(ultimo, ensure_ascii=False).count("Registra meu café") == 1


async def test_pergunta_a_pessoa_encerra_a_execucao_sem_virar_chamada() -> None:
    mcp = duplo_do_mcp(
        catalogo=[tool_do_catalogo("get_me", read_only=True)],
        resultados={"get_me": {"content": [{"type": "text", "text": "{}"}]}},
    )
    provedor = ProviderRecordingTransport(
        [
            [
                fragmento_de_tool(
                    0, id="q1", name="ask_user", arguments='{"prompt":"Quantos ovos?"}'
                ),
                fim("tool_calls"),
                bloco_de_uso(),
            ]
        ]
    )

    async def repor(_estado: Sequence[str]) -> None:
        return None

    async with ProvedorDoEval(
        base_url="http://localhost:1234/v1", text_model="m", transport=provedor
    ) as p:
        execucao, _ = await executar(
            _tarefa(),
            "A",
            1,
            provider=p,
            tokens=_Tokens(),
            mcp_url="http://localhost:3000/mcp",
            repor=repor,
            transport=mcp,
        )

    assert execucao.chamadas == ()
    assert execucao.motivos == ("pergunta",)
    assert execucao.chamadas_ao_modelo == 1


async def test_braco_a_nao_manda_header_de_superficie() -> None:
    mcp = duplo_do_mcp(
        catalogo=[tool_do_catalogo("get_me", read_only=True)],
        resultados={"get_me": {"content": [{"type": "text", "text": "{}"}]}},
    )
    provedor = ProviderRecordingTransport([[fragmento_de_texto("Oi."), fim(), bloco_de_uso()]])

    async def repor(_estado: Sequence[str]) -> None:
        return None

    async with ProvedorDoEval(
        base_url="http://localhost:1234/v1", text_model="m", transport=provedor
    ) as p:
        await executar(
            _tarefa(),
            "A",
            1,
            provider=p,
            tokens=_Tokens(),
            mcp_url="http://localhost:3000/mcp",
            repor=repor,
            transport=mcp,
        )

    assert all(HEADER_SUPERFICIE not in r.headers for r in mcp.requests)
