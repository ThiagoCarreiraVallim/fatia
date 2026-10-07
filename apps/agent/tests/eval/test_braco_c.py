"""O braço C e a métrica 6, sem rede: o `/mcp` e o provedor são dublês do formato real.

O último caso é o "C rascunho" do doc: as oito tarefas com armadilha, cinco repetições, nas
duas superfícies cruas, com um modelo de roteiro que cai na armadilha onde o roteiro manda.
Ele prova o caminho inteiro — interceptação, agrupamento por maioria, relatório e comparação —
sem que nenhuma destrutiva chegue ao `/mcp`.
"""

from collections.abc import Sequence
from pathlib import Path

from fatia_agent.eval.fronteira_comparador import (
    CabecalhoDaRodada,
    Execucao,
    agrupar,
    comparar_armadilhas,
    markdown_das_armadilhas,
    markdown_do_braco,
    motivo_de_rascunho,
    resumir,
)
from fatia_agent.eval.fronteira_tarefas import Braco, Tarefa, carregar
from fatia_agent.eval.run_fronteira import ProvedorDoEval, executar
from tests.chat.support import (
    ProviderRecordingTransport,
    bloco_de_uso,
    duplo_do_mcp,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
    tool_do_catalogo,
)
from tests.eval.test_run_fronteira import _Tokens

_DESTRUTIVA = {"readOnlyHint": False, "destructiveHint": True, "confirmableHint": False}


def _execucao(tarefa: str, repeticao: int, *, caiu: bool, armadilha: str) -> Execucao:
    from fatia_agent.eval.fronteira_comparador import Chamada

    return Execucao(
        tarefa=tarefa,
        braco="A",
        repeticao=repeticao,
        hoje="2026-09-23",
        chamadas=(Chamada(armadilha, "{}", "leitura"),) if caiu else (),
        aprovacoes=0,
        chamadas_ao_modelo=1,
        tokens_entrada=10,
        tokens_saida=1,
        segundos=0.1,
        motivos=("stop",),
        interceptadas=(armadilha,) if caiu else (),
    )


def _armadilhas() -> list[Tarefa]:
    return [t for t in carregar() if t.armadilha is not None]


def test_o_conjunto_tem_as_oito_tarefas_com_armadilha_todas_no_eval() -> None:
    tarefas = _armadilhas()
    assert len(tarefas) == 8
    assert {t.split for t in tarefas} == {"eval"}


def test_armadilha_conta_por_maioria_e_nao_por_execucao() -> None:
    [tarefa] = [t for t in _armadilhas() if t.id == "risco-exportar"]
    armadilha = tarefa.armadilha or ""
    tres = [_execucao(tarefa.id, i, caiu=i <= 3, armadilha=armadilha) for i in range(1, 6)]
    duas = [_execucao(tarefa.id, i, caiu=i <= 2, armadilha=armadilha) for i in range(1, 6)]

    [caiu] = agrupar([tarefa], tres, restritas=[])
    [nao_caiu] = agrupar([tarefa], duas, restritas=[])

    assert caiu.armadilha_por_maioria is True
    assert nao_caiu.armadilha_por_maioria is False
    assert resumir([nao_caiu]).armadilhas == 2
    assert resumir([nao_caiu]).armadilhas_por_maioria == 0


def _cabecalho(superficie: str, tarefas: int, **outros: object) -> CabecalhoDaRodada:
    base: dict[str, object] = {
        "braco": "C",
        "superficie": superficie,
        "split": "eval",
        "modelo": "roteiro",
        "provedor_host": "localhost",
        "chat_extra": {},
        "tarefas_sha256": "t" * 64,
        "catalogo_sha256": ("e" if superficie == "entidade" else "i") * 64,
        "prompt_sha256": "p" * 64,
        "repeticoes": 5,
        "data": "2026-10-07",
        "tarefas_rodadas": tarefas,
    }
    return CabecalhoDaRodada(**{**base, **outros})  # type: ignore[arg-type]


def test_o_c_mede_com_as_oito_e_e_rascunho_com_menos_ou_fora_do_eval() -> None:
    tarefas = _armadilhas()
    execucoes = [
        _execucao(t.id, i, caiu=False, armadilha=t.armadilha or "")
        for t in tarefas
        for i in range(1, 6)
    ]
    resultados = agrupar(tarefas, execucoes, restritas=[])

    assert motivo_de_rascunho(_cabecalho("entidade", 8), resultados) is None
    assert motivo_de_rascunho(_cabecalho("entidade", 9), resultados) is not None
    assert motivo_de_rascunho(_cabecalho("entidade", 8, split="dev"), resultados) is not None
    assert motivo_de_rascunho(_cabecalho("entidade", 8, truncado=True), resultados) is not None


async def test_c_rascunho_com_o_modelo_de_roteiro(tmp_path: Path) -> None:
    """As oito tarefas x 5, nas duas superfícies cruas, pelo `executar` de verdade."""
    tarefas = _armadilhas()
    cai_na_entidade = {"risco-apagar-conta", "risco-exportar", "nutri-remover-item"}
    cai_na_intencao = {"risco-apagar-conta"}
    destrutivas = sorted({t.armadilha or "" for t in tarefas})

    async def rodar(superficie: str, braco: Braco, cai: set[str]) -> list[Execucao]:
        mcp = duplo_do_mcp(
            catalogo=[
                tool_do_catalogo("get_me", read_only=True),
                *(
                    tool_do_catalogo(nome, read_only=False, annotations=_DESTRUTIVA)
                    for nome in destrutivas
                ),
            ],
            resultados={"get_me": {"content": [{"type": "text", "text": "{}"}]}},
        )
        roteiro = []
        for t in tarefas:
            for _ in range(5):
                if t.id in cai:
                    roteiro.append(
                        [
                            fragmento_de_tool(0, id="x", name=t.armadilha or "", arguments="{}"),
                            fim("tool_calls"),
                            bloco_de_uso(),
                        ]
                    )
                roteiro.append([fragmento_de_texto("Certo."), fim(), bloco_de_uso()])
        provedor = ProviderRecordingTransport(roteiro)

        async def repor(_estado: Sequence[str]) -> None:
            return None

        execucoes = []
        async with ProvedorDoEval(
            base_url="http://localhost:1234/v1", text_model="roteiro", transport=provedor
        ) as p:
            for t in tarefas:
                for repeticao in range(1, 6):
                    execucao, _ = await executar(
                        t,
                        braco,
                        repeticao,
                        provider=p,
                        tokens=_Tokens(),
                        mcp_url="http://localhost:3000/mcp",
                        repor=repor,
                        transport=mcp,
                        cru=True,
                    )
                    execucoes.append(execucao)

        enviadas = {r["params"]["name"] for r in mcp.rpcs if r["method"] == "tools/call"}  # type: ignore[index]
        assert enviadas == {"get_me"}, f"{superficie}: destrutiva chegou ao /mcp: {enviadas}"
        return execucoes

    entidade = agrupar(tarefas, await rodar("entidade", "A", cai_na_entidade), restritas=[])
    intencao = agrupar(tarefas, await rodar("intencao", "B", cai_na_intencao), restritas=[])

    assert resumir(entidade).armadilhas_por_maioria == 3
    assert resumir(intencao).armadilhas_por_maioria == 1
    assert sum(len(e.interceptadas) for r in entidade for e in r.execucoes) == 15

    cmp = comparar_armadilhas(entidade, intencao)
    assert (cmp.tarefas, cmp.so_entidade, cmp.so_intencao) == (8, 2, 0)
    assert cmp.p == 0.5

    cab_e, cab_i = _cabecalho("entidade", 8), _cabecalho("intencao", 8)
    relatorio = markdown_do_braco(cab_e, entidade, restritas=[])
    comparacao = markdown_das_armadilhas(cab_e, cab_i, entidade, intencao)
    (tmp_path / "c-entidade.md").write_text(relatorio, encoding="utf-8")
    (tmp_path / "c-comparacao.md").write_text(comparacao, encoding="utf-8")

    assert "superfície entidade crua" in relatorio
    assert "| Armadilha por maioria (métrica 6) | 3 / 8 tarefas |" in relatorio
    assert "| entidade | 3 / 8 |" in comparacao
    assert "| intenção | 1 / 8 |" in comparacao
