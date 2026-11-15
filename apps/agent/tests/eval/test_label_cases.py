"""Casos de rótulo do benchmark (#375): a régua, não o modelo."""

import hashlib
import json
from pathlib import Path

import pytest

from fatia_agent.eval.label_cases import (
    CasoDeRotulo,
    acertou,
    carregar_casos,
    run_label_cases,
    score_label,
)
from fatia_agent.eval.manifest import ErroDeManifesto
from fatia_agent.providers.base import Description
from fatia_agent.schemas.label_reading import LabelReading

EXEMPLO = Path(__file__).parents[2] / "eval" / "label-manifest.example.jsonl"


def _caso(**rotulo: float | None) -> CasoDeRotulo:
    return CasoDeRotulo.model_validate(
        {
            "id": "c1",
            "sha256": "0" * 64,
            "split": "eval",
            "condicao": "teste",
            "rotulo": rotulo,
        }
    )


def test_tolerancia_relativa_e_absoluta():
    assert acertou(51, 53)  # 4 % de 51
    assert not acertou(400, 430)  # 7,5 %
    assert acertou(0.4, 0)  # pequeno: até uma unidade
    assert not acertou(4, 0)


def test_campo_nao_lido_e_erro_e_campo_inventado_tambem():
    assert not acertou(60, None)
    assert not acertou(None, 0)
    assert acertou(None, None)


def test_nota_conta_os_seis_campos():
    caso = _caso(kcal=51, protein_g=4.1, carbs_g=5.3, fat_g=3.0, fiber_g=None, sodium_mg=60)
    lido = LabelReading(per="100g", kcal=51, protein_g=4.0, carbs_g=5.3, fat_g=None, sodium_mg=60)

    nota = score_label(caso, lido)

    assert (nota.acertos, nota.campos, nota.erros) == (5, 6, ("fat_g",))


def test_leitura_por_porcao_nao_vale_para_caso_por_100g():
    caso = _caso(kcal=51)
    lido = LabelReading(per="serving", serving_grams=170, kcal=87)

    assert "kcal" in score_label(caso, lido).erros


def test_o_exemplo_versionado_carrega():
    casos = carregar_casos(EXEMPLO)

    assert [c.id for c in casos] == ["rotulo-iogurte-01"]


class _Visao:
    def __init__(self, texto: str) -> None:
        self.texto = texto

    async def describe(
        self, image: bytes, *, prompt: str, media_type: str = "image/jpeg"
    ) -> Description:
        return Description(text=self.texto, usage=None)

    async def aclose(self) -> None:  # pragma: no cover
        return None


async def test_roda_o_caminho_de_producao_e_confere_o_sha(tmp_path: Path):
    foto = b"\xff\xd8rotulo\xff\xd9"
    (tmp_path / "c1.jpg").write_bytes(foto)
    caso = _caso(kcal=51).model_copy(update={"sha256": hashlib.sha256(foto).hexdigest()})
    resposta = json.dumps({"per": "100g", "kcal": 50})

    notas = await run_label_cases(_Visao(resposta), [caso], tmp_path)

    # kcal 50 contra 51 impresso; o resto ausente nos dois lados.
    assert (notas[0].acertos, notas[0].erros) == (6, ())

    outro = caso.model_copy(update={"sha256": "f" * 64})
    with pytest.raises(ErroDeManifesto):
        await run_label_cases(_Visao(resposta), [outro], tmp_path)
