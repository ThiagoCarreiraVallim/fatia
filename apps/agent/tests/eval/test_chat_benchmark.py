"""O benchmark do chat mede o que diz medir.

Com um modelo roteirizado no lugar do provedor: o que se afirma aqui é o runner e
os checks — que um caso bem resolvido passa, que um número inventado reprova, e
que a escrita só conta como executada depois do sim.
"""

import json
from collections.abc import Callable

import pytest

from fatia_agent.eval.chat import __main__ as cli
from fatia_agent.eval.chat.casos import CASOS, selecionar
from fatia_agent.eval.chat.runner import ResultadoDoCaso, resumo_em_markdown, rodar_caso
from fatia_agent.providers import build_provider
from fatia_agent.settings import AgentSettings

from ..chat.support import (
    ProviderRecordingTransport,
    bloco_de_uso,
    fim,
    fragmento_de_texto,
    fragmento_de_tool,
)


def _tool(nome: str, argumentos: dict[str, object], chamada: str = "c1") -> list[dict[str, object]]:
    return [
        fragmento_de_tool(0, id=chamada, name=nome, arguments=json.dumps(argumentos)),
        fim("tool_calls"),
        bloco_de_uso(),
    ]


def _texto(texto: str) -> list[dict[str, object]]:
    return [fragmento_de_texto(texto), fim(), bloco_de_uso()]


async def _rodar(
    settings_factory: Callable[..., AgentSettings],
    caso_id: str,
    roteiro: list[list[dict[str, object]]],
) -> ResultadoDoCaso:
    provider = build_provider(settings_factory(), transport=ProviderRecordingTransport(roteiro))
    try:
        return await rodar_caso(selecionar([caso_id])[0], provider)
    finally:
        await provider.aclose()


def _falhas(resultado: ResultadoDoCaso) -> list[str]:
    return [check.nome for check in resultado.checks if not check.ok]


async def test_leitura_bem_resolvida_passa(settings_factory: Callable[..., AgentSettings]) -> None:
    resultado = await _rodar(
        settings_factory,
        "leitura-resumo-de-hoje",
        [
            _tool("get_today_summary", {}),
            _texto("Hoje você comeu 1.832 kcal, dentro da meta de 1.800 a 2.200."),
        ],
    )

    assert _falhas(resultado) == []
    assert resultado.unidades == {"inputUnits": 812 * 2, "outputUnits": 96 * 2}


async def test_numero_inventado_reprova(settings_factory: Callable[..., AgentSettings]) -> None:
    resultado = await _rodar(
        settings_factory,
        "leitura-resumo-de-hoje",
        [_tool("get_today_summary", {}), _texto("Hoje você comeu 1.832 kcal, e 1.950 ontem.")],
    )

    falhou = {c.nome: c.detalhe for c in resultado.checks if not c.ok}
    assert list(falhou) == ["números da resposta existem nos dados"]
    assert "1950" in falhou["números da resposta existem nos dados"]


_ESCRITA = [
    _tool("search_food", {"query": "arroz branco"}),
    _tool("log_meal", {"mealType": "LUNCH", "items": [{"foodId": 312, "grams": 150}]}, "c2"),
    _texto("Pronto, registrei 150 g de arroz no almoço."),
]


async def test_escrita_aprovada_executa_uma_vez(
    settings_factory: Callable[..., AgentSettings],
) -> None:
    resultado = await _rodar(settings_factory, "escrita-pausa-e-aprova", _ESCRITA)

    assert _falhas(resultado) == []
    assert [c.nome for c in resultado.traco.executadas] == ["search_food", "log_meal"]


async def test_escrita_recusada_nao_executa(
    settings_factory: Callable[..., AgentSettings],
) -> None:
    resultado = await _rodar(settings_factory, "escrita-recusada-nao-grava", _ESCRITA)

    assert _falhas(resultado) == []
    assert [c.nome for c in resultado.traco.executadas] == ["search_food"]


async def test_caso_que_escreve_sem_pedir_reprova_na_recusa(
    settings_factory: Callable[..., AgentSettings],
) -> None:
    """O cenário de recusa não pode passar com um modelo que nem chama a escrita."""
    resultado = await _rodar(
        settings_factory,
        "escrita-recusada-nao-grava",
        [_texto("Registrei o arroz.")],
    )

    assert "pediu confirmação de log_meal" in _falhas(resultado)


def test_casos_tem_ids_unicos_e_checks() -> None:
    ids = [caso.id for caso in CASOS]
    assert len(ids) == len(set(ids))
    assert all(caso.checks for caso in CASOS)


def test_caso_desconhecido_e_recusado() -> None:
    with pytest.raises(ValueError, match="nao-existe"):
        selecionar(["nao-existe"])


async def test_resumo_nomeia_o_que_falhou(
    settings_factory: Callable[..., AgentSettings],
) -> None:
    resultado = await _rodar(
        settings_factory,
        "leitura-resumo-de-hoje",
        [_tool("get_today_summary", {}), _texto("Você comeu 2.500 kcal.")],
    )

    resumo = resumo_em_markdown([resultado], modelo="roteiro")
    assert "**0 de 1 casos passaram.**" in resumo
    assert "números da resposta existem nos dados" in resumo


def test_cli_recusa_endpoint_remoto_nao_revisado(capsys: pytest.CaptureFixture[str]) -> None:
    codigo = cli.main(["--base-url", "https://nao-revisado.example/v1", "--model", "qualquer"])

    assert codigo == 2
    assert "erro:" in capsys.readouterr().out
