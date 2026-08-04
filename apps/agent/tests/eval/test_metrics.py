"""As métricas do benchmark (#138), com rótulos sintéticos e nenhum modelo.

O que estes testes protegem não é aritmética — é a **honestidade** de cada
número: `n` nunca some, divisão por zero nunca vira 0,0 em silêncio, e foto que
falhou não entra na conta de precisão como se o modelo tivesse errado.
"""

import pytest

from fatia_agent.eval.metrics import (
    ItemSolto,
    ResultadoDaFoto,
    casar_foto,
    identificacao,
    operacional,
    porcao,
    resumir,
)


def foto(
    *,
    id_da_foto: str = "f1",
    previstos: list[tuple[str, float, float | None]] | None = None,
    rotulados: list[tuple[str, float, float | None]] | None = None,
    latencia_s: float = 1.0,
) -> ResultadoDaFoto:
    return casar_foto(
        foto_id=id_da_foto,
        latencia_s=latencia_s,
        previstos=previstos or [],
        rotulados=rotulados or [],
    )


class TestResumir:
    def test_conjunto_vazio_nao_vira_zero(self):
        """Zero é um número, e número entra em decisão. `n = 0` com média `None`
        é a única forma de o relatório dizer "não medi" em vez de "medi 0"."""
        dist = resumir([])
        assert dist.n == 0
        assert dist.media is None
        assert dist.desvio is None
        assert dist.maximo is None

    def test_um_valor_nao_tem_desvio(self):
        dist = resumir([10.0])
        assert dist.n == 1
        assert dist.media == 10.0
        assert dist.desvio is None

    def test_media_desvio_e_maximo(self):
        dist = resumir([10.0, 20.0, 30.0])
        assert dist.media == 20.0
        assert dist.desvio == 10.0
        assert dist.mediana == 20.0
        assert dist.maximo == 30.0


class TestIdentificacao:
    def test_casamento_exato_e_por_sinonimo(self):
        resultados = [
            foto(previstos=[("arroz branco", 100, None)], rotulados=[("arroz branco", 100, None)]),
            foto(
                previstos=[("mandioca frita", 80, None)],
                rotulados=[("macaxeira frita", 80, None)],
            ),
        ]
        ident = identificacao(resultados)
        assert ident.verdadeiros_positivos == 2
        assert ident.falsos_positivos == 0
        assert ident.precisao == 1.0
        assert ident.revocacao == 1.0

    def test_item_inventado_conta_como_alucinacao(self):
        ident = identificacao(
            [
                foto(
                    previstos=[("arroz branco", 100, None), ("picanha", 200, None)],
                    rotulados=[("arroz branco", 100, None)],
                )
            ]
        )
        assert ident.falsos_positivos == 1
        assert ident.precisao == 0.5
        assert ident.taxa_de_alucinacao == 0.5
        assert ident.alucinacoes_por_foto.media == 1.0

    def test_item_faltante_derruba_revocacao_e_nao_a_precisao(self):
        ident = identificacao(
            [
                foto(
                    previstos=[("arroz branco", 100, None)],
                    rotulados=[("arroz branco", 100, None), ("farofa", 30, None)],
                )
            ]
        )
        assert ident.falsos_negativos == 1
        assert ident.revocacao == 0.5
        assert ident.precisao == 1.0

    def test_sem_nada_listado_e_sem_nada_no_prato_nao_vira_zero(self):
        """A foto de controle (prato lavado, resposta vazia) é um acerto do
        modelo. Contá-la como precisão 0 castigaria justamente o comportamento
        que a #139 pede — devolver lista vazia em vez de inventar comida."""
        ident = identificacao([foto(previstos=[], rotulados=[])])
        assert ident.precisao is None
        assert ident.revocacao is None
        assert ident.precisao_por_foto.n == 0

    def test_foto_que_falhou_fica_fora_da_identificacao(self):
        """Provedor fora do ar não é modelo impreciso. Misturar os dois faria a
        precisão cair quando o LM Studio cai."""
        resultados = [
            foto(previstos=[("arroz branco", 100, None)], rotulados=[("arroz branco", 100, None)]),
            ResultadoDaFoto(foto_id="f2", latencia_s=180.0, falha="AI_PROVIDER_TIMEOUT"),
        ]
        ident = identificacao(resultados)
        assert ident.n_fotos == 1
        assert ident.precisao == 1.0
        assert ident.falsos_negativos == 0


class TestPorcao:
    def test_mape_em_gramas_de_um_item(self):
        porc = porcao(
            [foto(previstos=[("arroz branco", 120, None)], rotulados=[("arroz branco", 100, None)])]
        )
        assert porc.mape_gramas.n == 1
        assert porc.mape_gramas.media == 20.0

    def test_sem_nenhum_item_correto_nao_divide_por_zero(self):
        """Modelo que erra tudo tem MAPE **indefinido**, não 0 %. Um MAPE de 0
        num relatório é o melhor resultado possível, e sairia do pior caso."""
        porc = porcao(
            [foto(previstos=[("picanha", 200, None)], rotulados=[("arroz branco", 100, None)])]
        )
        assert porc.mape_gramas.n == 0
        assert porc.mape_gramas.media is None
        assert porc.erro_kcal_refeicao.n == 0

    def test_kcal_do_item_usa_a_tabela_e_nao_o_chute_do_modelo(self):
        """O produto descarta a kcal do modelo quando o item casa com a TACO
        (`meal-recognition.service.ts`). Medir a kcal auto-relatada mediria um
        número que ninguém usa: aqui o modelo diz 999 kcal e o valor não aparece.
        """
        porc = porcao(
            [
                foto(
                    previstos=[("arroz branco", 200, 999.0)],
                    rotulados=[("arroz branco", 100, 128.0)],
                )
            ]
        )
        assert porc.erro_kcal_item.n == 1
        # 100 g a mais de um alimento de 128 kcal/100 g = 128 kcal, e não 999.
        assert porc.erro_kcal_item.media == 128.0

    def test_erro_de_kcal_por_item_distingue_alface_de_oleo(self):
        """O percentual em kcal seria **idêntico** ao percentual em gramas: a
        `kcal_100g` cancela na razão. Duas colunas com o mesmo número seriam
        lidas como duas evidências. O que a kcal acrescenta é a magnitude — 20 %
        a mais de alface e 20 % a mais de óleo custam coisas diferentes."""
        alface = porcao(
            [foto(previstos=[("alface", 120, None)], rotulados=[("alface", 100, 15.0)])]
        )
        oleo = porcao(
            [
                foto(
                    previstos=[("óleo de soja", 120, None)],
                    rotulados=[("óleo de soja", 100, 884.0)],
                )
            ]
        )

        assert alface.mape_gramas.media == oleo.mape_gramas.media == 20.0
        assert alface.erro_kcal_item.media == 3.0
        assert oleo.erro_kcal_item.media == pytest.approx(176.8)

    def test_item_sem_kcal_no_rotulo_fica_de_fora_da_metrica_de_kcal(self):
        porc = porcao(
            [foto(previstos=[("arroz branco", 120, None)], rotulados=[("arroz branco", 100, None)])]
        )
        assert porc.mape_gramas.n == 1
        assert porc.erro_kcal_item.n == 0
        assert porc.fotos_com_kcal == 0

    def test_rotulo_de_zero_grama_nao_vira_erro_zero(self):
        """Erro relativo com real zero não existe. Devolver 0,0 entraria na média
        como o **melhor** resultado possível de um item que ninguém mediu."""
        porc = porcao(
            [foto(previstos=[("arroz branco", 120, None)], rotulados=[("arroz branco", 0, 128.0)])]
        )
        assert porc.mape_gramas.n == 0
        assert porc.mape_gramas.media is None

    def test_controle_negativo_reporta_a_kcal_que_o_modelo_inventou(self):
        """Prato lavado não tem erro percentual — a kcal real é zero e a razão
        não existe. Sem esta linha, um controle que vira 300 kcal ficaria fora de
        toda métrica de kcal, e é kcal que entra no dia da pessoa."""
        porc = porcao(
            [foto(previstos=[("feijoada", 300, 300.0)], rotulados=[], id_da_foto="prato-lavado")]
        )
        assert porc.erro_kcal_refeicao.n == 0
        assert porc.kcal_inventada_em_controle.n == 1
        assert porc.kcal_inventada_em_controle.media == 300.0

    def test_erro_da_refeicao_inclui_o_item_que_o_modelo_esqueceu(self):
        """É o número que a pessoa sente. Um modelo que acerta a grama de tudo
        que viu, mas não viu a farofa, tem erro por item 0 e erro de refeição
        grande — e o segundo é o que descreve o dia dela."""
        resultado = foto(
            previstos=[("arroz branco", 100, None)],
            rotulados=[("arroz branco", 100, 128.0), ("farofa", 50, 400.0)],
        )
        porc = porcao([resultado])
        assert porc.mape_gramas.media == 0.0
        # real = 128 + 200 = 328 kcal; prevista = 128 → erro de 200/328.
        assert porc.erro_kcal_refeicao.media == 200 / 328 * 100

    def test_item_inventado_sem_kcal_marca_a_foto_como_subestimada(self):
        resultado = foto(
            previstos=[("arroz branco", 100, None), ("picanha", 200, None)],
            rotulados=[("arroz branco", 100, 128.0)],
        )
        porc = porcao([resultado])
        assert porc.erro_kcal_refeicao.media == 0.0
        assert porc.fotos_subestimadas == 1

    def test_item_inventado_com_kcal_do_modelo_entra_na_conta(self):
        resultado = foto(
            previstos=[("arroz branco", 100, None), ("picanha", 200, 500.0)],
            rotulados=[("arroz branco", 100, 128.0)],
        )
        porc = porcao([resultado])
        assert porc.erro_kcal_refeicao.media == 500 / 128 * 100
        assert porc.fotos_subestimadas == 0


class TestOperacional:
    def test_taxa_de_falha_por_codigo(self):
        resultados = [
            foto(latencia_s=2.0),
            ResultadoDaFoto(foto_id="f2", latencia_s=180.0, falha="AI_PROVIDER_TIMEOUT"),
            ResultadoDaFoto(foto_id="f3", latencia_s=3.0, falha="AI_RESPONSE_UNPARSEABLE"),
        ]
        oper = operacional(resultados)
        assert oper.taxa_de_falha == 2 / 3
        assert oper.falhas_por_code == {
            "AI_PROVIDER_TIMEOUT": 1,
            "AI_RESPONSE_UNPARSEABLE": 1,
        }

    def test_latencia_inclui_as_fotos_que_falharam(self):
        """Timeout de 180 s é tempo que a pessoa esperou. Tirá-lo da conta é como
        o p95 fica bonito enquanto o produto trava."""
        oper = operacional(
            [
                foto(latencia_s=2.0),
                ResultadoDaFoto(foto_id="f2", latencia_s=180.0, falha="AI_PROVIDER_TIMEOUT"),
            ]
        )
        assert oper.latencia_s.n == 2
        assert oper.latencia_s.maximo == 180.0


class TestCasarFoto:
    def test_faltante_carrega_a_kcal_da_porcao_rotulada(self):
        resultado = foto(previstos=[], rotulados=[("farofa", 50, 400.0)])
        assert resultado.faltantes == (ItemSolto(nome="farofa", gramas=50, kcal=200.0),)
