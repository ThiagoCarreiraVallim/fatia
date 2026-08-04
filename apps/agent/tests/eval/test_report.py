"""A guarda de publicação do relatório (#138).

É o teste mais importante deste diretório. O risco desta issue não é errar uma
divisão — é publicar um número medido sobre cinco fotos e vê-lo virar citação
numa decisão de seis meses depois, longe do contexto que o desqualificava. A
recusa mora no gerador, e não na disciplina de quem roda, justamente para poder
ser testada.
"""

from datetime import date

from fatia_agent.eval.metrics import ResultadoDaFoto, identificacao, operacional, porcao
from fatia_agent.eval.report import (
    MINIMO_PUBLICAVEL,
    Cabecalho,
    montar_markdown,
    motivo_de_rascunho,
)

from .test_metrics import foto


def cabecalho(**overrides: object) -> Cabecalho:
    campos: dict[str, object] = {
        "modelo": "google/gemma-4-12b-qat",
        "provedor_host": "localhost",
        "split": "eval",
        "conjunto_sha256": "a" * 64,
        "prompt_sha256": "b" * 64,
        "n_fotos": MINIMO_PUBLICAVEL,
        "data": date(2026, 8, 4),
    }
    campos.update(overrides)
    return Cabecalho(**campos)  # type: ignore[arg-type]


def relatorio(resultados, **overrides: object) -> str:
    return montar_markdown(
        cabecalho(**overrides),
        identificacao(resultados),
        porcao(resultados),
        operacional(resultados),
    )


def rascunho(resultados, **overrides: object) -> str | None:
    return motivo_de_rascunho(cabecalho(**overrides), identificacao(resultados), porcao(resultados))


ACERTO = {
    "previstos": [("arroz branco", 100, None)],
    "rotulados": [("arroz branco", 100, 128.0)],
}
SUFICIENTE = [foto(**ACERTO)] * MINIMO_PUBLICAVEL


class TestCarimboDeRascunho:
    def test_amostra_pequena_nao_produz_veredito(self):
        texto = relatorio([foto(**ACERTO)], n_fotos=5)
        assert "NÃO É RESULTADO PUBLICÁVEL" in texto
        assert "**Sem veredito.**" in texto
        assert "Recomendação: seguir" not in texto
        assert "Recomendação: não seguir" not in texto

    def test_foto_que_nao_respondeu_nao_conta_para_a_amostra(self):
        """A guarda tem de contar o que foi **medido**, e não o que foi tentado.
        Trinta fotos no manifesto com vinte e nove timeouts são uma medida sobre
        uma foto — e é dessa foto que o veredito sairia."""
        resultados = [foto(**ACERTO)] + [
            ResultadoDaFoto(foto_id=f"f{i}", latencia_s=180.0, falha="AI_PROVIDER_TIMEOUT")
            for i in range(MINIMO_PUBLICAVEL - 1)
        ]
        texto = relatorio(resultados)
        assert "NÃO É RESULTADO PUBLICÁVEL" in texto
        assert "**Sem veredito.**" in texto
        assert "Recomendação: seguir" not in texto
        assert f"1 de {MINIMO_PUBLICAVEL} foto(s) renderam resposta utilizável" in texto

    def test_portao_de_kcal_sustentado_por_poucas_fotos_nao_publica(self):
        """O veredito de kcal sai só das fotos com `kcal_100g` em todos os itens.
        Trinta fotos das quais três têm kcal decidem o portão sobre três."""
        com_kcal = [foto(**ACERTO)] * 3
        sem_kcal = [
            foto(
                previstos=[("arroz branco", 100, None)],
                rotulados=[("arroz branco", 100, None)],
            )
        ] * (MINIMO_PUBLICAVEL - 3)
        texto = relatorio(com_kcal + sem_kcal)
        assert "NÃO É RESULTADO PUBLICÁVEL" in texto
        assert "**Sem veredito.**" in texto
        assert "Recomendação: seguir" not in texto
        assert f"3 de {MINIMO_PUBLICAVEL} foto(s) têm `kcal_100g`" in texto

    def test_o_cabecalho_separa_foto_tentada_de_foto_medida(self):
        resultados = [foto(**ACERTO)] * 2 + [
            ResultadoDaFoto(foto_id="f9", latencia_s=180.0, falha="AI_PROVIDER_TIMEOUT")
        ]
        texto = relatorio(resultados, n_fotos=3)
        assert "| fotos tentadas | 3 |" in texto
        assert "| fotos com resposta utilizável | 2 |" in texto

    def test_split_de_ajuste_nunca_publica(self):
        """Medir no `dev` reporta o quanto o prompt decorou as fotos do ajuste.
        O número existe, e é justamente por isso que ele precisa sair carimbado."""
        texto = relatorio(SUFICIENTE, split="dev")
        assert "NÃO É RESULTADO PUBLICÁVEL" in texto
        assert "**Recomendação" not in texto

    def test_execucao_cortada_por_limite_nunca_publica(self):
        texto = relatorio(SUFICIENTE, truncado=True)
        assert "NÃO É RESULTADO PUBLICÁVEL" in texto
        assert "`--limite`" in texto

    def test_amostra_suficiente_no_split_de_avaliacao_publica(self):
        texto = relatorio(SUFICIENTE)
        assert "NÃO É RESULTADO PUBLICÁVEL" not in texto
        assert "**Recomendação: seguir.**" in texto

    def test_uma_foto_a_menos_que_o_minimo_ja_e_rascunho(self):
        assert rascunho(SUFICIENTE[:-1], n_fotos=MINIMO_PUBLICAVEL - 1) is not None
        assert rascunho(SUFICIENTE) is None


class TestVeredito:
    def test_metrica_fora_do_limiar_recomenda_nao_seguir(self):
        """A issue exige publicar o resultado inclusive quando ele é ruim, e o
        relatório precisa dizer "não" com todas as letras — não "atenção"."""
        ruins = [
            foto(
                previstos=[("arroz branco", 100, None)],
                rotulados=[("arroz branco", 100, 128.0), ("farofa", 50, 400.0)],
            )
        ] * MINIMO_PUBLICAVEL
        texto = relatorio(ruins)
        assert "**Recomendação: não seguir" in texto
        assert "vira ADR" in texto

    def test_metrica_nao_medida_nao_passa_no_portao(self):
        """ "Não medido" não pode ser tratado como aprovado — é como um portão
        passa vazio. Aqui o modelo não lista nada em foto nenhuma: a taxa de
        alucinação não tem denominador, e não vira "dentro do limiar"."""
        calado = [foto(previstos=[], rotulados=[("arroz branco", 100, 128.0)])] * MINIMO_PUBLICAVEL
        texto = relatorio(calado)
        assert "não medido" in texto
        assert "**Recomendação: não seguir" in texto


class TestCabecalho:
    def test_grava_contra_o_que_o_numero_foi_medido(self):
        """Um número medido contra o gemma local não transfere para o modelo do
        gateway. Sem este bloco, seis meses depois alguém conclui sobre o modelo
        errado — o risco mais provável desta issue inteira."""
        texto = relatorio([foto(**ACERTO)] * MINIMO_PUBLICAVEL)
        assert "google/gemma-4-12b-qat" in texto
        assert "localhost" in texto
        assert "2026-08-04" in texto
        assert "b" * 16 in texto


class TestDispersao:
    def test_nenhuma_agregacao_sai_sem_n_e_sem_desvio(self):
        """Média sozinha é impressão com aparência de medida. O `±` é o que
        obriga quem lê a ver a dispersão junto do número."""
        variados = [
            foto(previstos=[("arroz branco", g, None)], rotulados=[("arroz branco", 100, 128.0)])
            for g in (80, 100, 120, 140)
        ] * 10
        texto = relatorio(variados)
        assert "±" in texto
        assert "mediana" in texto
        assert "p95" in texto

    def test_limiar_aparece_antes_do_resultado(self):
        """Limiar decidido depois de ver o número não é limiar, é justificativa.
        A ordem no documento é o que torna isso visível para quem lê."""
        texto = relatorio([foto(**ACERTO)] * MINIMO_PUBLICAVEL)
        assert texto.index("Limiar de aceitação") < texto.index("## Identificação")
        assert texto.index("Limiar de aceitação") < texto.index("## Veredito")
