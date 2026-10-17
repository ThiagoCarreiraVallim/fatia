"""Leitura do conjunto de tarefas do eval da fronteira."""

import re
from datetime import date
from pathlib import Path

import pytest

from fatia_agent.eval.fronteira_tarefas import (
    TAREFAS_PADRAO,
    ConjuntoInvalido,
    carregar,
    impressao_digital,
    valores_aceitos,
)

DOC = Path(__file__).resolve().parents[4] / "docs" / "eval-fronteira-de-tools.md"


def test_carrega_o_conjunto_de_verdade() -> None:
    tarefas = carregar()
    assert len(tarefas) == 43
    assert sum(t.split == "eval" for t in tarefas) == 31


def test_a_impressao_digital_do_eval_e_a_que_o_doc_registra_no_congelamento() -> None:
    # Se esta asserção quebrou, alguém mudou uma tarefa do `eval` depois do congelamento.
    # Antes da primeira medição isso é permitido — atualize o hash no doc no mesmo commit.
    registrada = re.search(r"\n([0-9a-f]{64})\s+\(31 tarefas\)", DOC.read_text(encoding="utf-8"))
    assert registrada is not None
    assert impressao_digital(TAREFAS_PADRAO, "eval") == registrada.group(1)


def test_a_impressao_digital_do_eval_nao_muda_quando_o_dev_muda(tmp_path: Path) -> None:
    original = TAREFAS_PADRAO.read_text(encoding="utf-8")
    linhas = original.splitlines()
    dev = next(i for i, linha in enumerate(linhas) if '"split": "dev"' in linha)
    linhas[dev] = linhas[dev].replace('"pedido": "', '"pedido": "Oi. ')
    alterado = tmp_path / "t.jsonl"
    alterado.write_text("\n".join(linhas) + "\n", encoding="utf-8")

    assert impressao_digital(alterado, "eval") == impressao_digital(TAREFAS_PADRAO, "eval")
    assert impressao_digital(alterado, "dev") != impressao_digital(TAREFAS_PADRAO, "dev")


def test_recusa_campo_desconhecido(tmp_path: Path) -> None:
    primeira = TAREFAS_PADRAO.read_text(encoding="utf-8").splitlines()[0]
    arquivo = tmp_path / "t.jsonl"
    arquivo.write_text(primeira.replace('"pedido"', '"pedidoo"', 1) + "\n", encoding="utf-8")

    with pytest.raises(ConjuntoInvalido, match="pedidoo"):
        carregar(arquivo)


def test_terca_e_a_mais_recente_antes_de_hoje() -> None:
    quarta = date(2026, 9, 23)
    assert valores_aceitos("<terca>", quarta, "A") == {"2026-09-22"}


def test_numa_terca_hoje_tambem_vale() -> None:
    terca = date(2026, 9, 22)
    assert valores_aceitos("<terca>", terca, "A") == {"2026-09-15", "2026-09-22"}


def test_o_braco_b_aceita_o_literal_que_o_servidor_resolve() -> None:
    hoje = date(2026, 9, 24)
    assert valores_aceitos("<ontem>", hoje, "A") == {"2026-09-23"}
    assert valores_aceitos("<ontem>", hoje, "B") == {"2026-09-23", "yesterday"}
