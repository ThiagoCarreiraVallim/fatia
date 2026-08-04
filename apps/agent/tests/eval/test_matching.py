"""O casamento entre o previsto e o rotulado (#138) — sem modelo e sem rede."""

import pytest

from fatia_agent.eval.matching import (
    SINONIMOS,
    canonizar,
    mesma_identidade,
    normalizar,
    parear,
)


class TestNormalizar:
    """As equivalências fixadas aqui são as de `packages/db/src/search-text.js`.

    Este é o ponto em que a duplicação entre JavaScript e Python vira falha em
    vez de virar número diferente: se a regra da busca mudar e este arquivo não,
    o teste fica verde e o benchmark passa a medir um casamento que o produto não
    faz. Por isso os casos são os mesmos do original, e não casos inventados.
    """

    @pytest.mark.parametrize(
        ("entrada", "esperado"),
        [
            ("Feijão Tropeiro", "feijao tropeiro"),
            ("AÇAÍ", "acai"),
            ("Arroz, tipo 1, cozido", "arroz tipo 1 cozido"),
            ("Pão de Queijo", "pao de queijo"),
            ("  couve   refogada  ", "couve refogada"),
            ("Manteiga (com sal)", "manteiga com sal"),
        ],
    )
    def test_reduz_a_forma_comparavel(self, entrada, esperado):
        assert normalizar(entrada) == esperado

    def test_pontuacao_vira_espaco_e_nao_some(self):
        # Some, e "arroz tipo 1" deixa de casar com "Arroz, tipo 1, cozido" —
        # é a razão pela qual o original troca por espaço em vez de remover.
        assert normalizar("Arroz,tipo 1") == "arroz tipo 1"


class TestSinonimos:
    def test_chaves_e_valores_ja_estao_normalizados(self):
        """Uma chave com acento nunca casaria, e ninguém perceberia: `canonizar`
        procura no mapa depois de normalizar."""
        for chave, valor in SINONIMOS.items():
            assert normalizar(chave) == chave, chave
            assert normalizar(valor) == valor, valor

    def test_regionalismo_casa(self):
        assert mesma_identidade("mandioca cozida", "macaxeira cozida")

    def test_trecho_mais_longo_vence(self):
        # "pao de sal" tem de virar "pao frances" inteiro; se "sal" fosse
        # considerado sozinho, o nome viraria outro alimento.
        assert canonizar("pão de sal") == ("pao", "frances")


class TestMesmaIdentidade:
    def test_prefixo_de_palavra_casa_nos_dois_sentidos(self):
        assert mesma_identidade("arroz", "arroz branco cozido")
        assert mesma_identidade("arroz branco cozido", "arroz")

    def test_preparo_diferente_nao_casa(self):
        assert not mesma_identidade("frango grelhado", "frango frito")

    def test_nao_casa_por_prefixo_de_caractere(self):
        """ "maçã" → "macaúba" é o bug real que o casamento com a TACO já teve
        (`meal-recognition.service.ts`). Comparar token, e não caractere, é o que
        o impede."""
        assert not mesma_identidade("maçã", "macaúba")

    def test_nome_vazio_nao_casa_com_nada(self):
        assert not mesma_identidade("", "arroz")
        assert not mesma_identidade("!!!", "arroz")


class TestParear:
    def test_casamento_exato_tem_precedencia_sobre_prefixo(self):
        """Sem as duas passadas, o "arroz" genérico consome o rótulo específico e
        o previsto específico fica sem par — dois erros inventados pela ordem."""
        pareamento = parear(
            ["arroz", "arroz branco cozido"],
            ["arroz branco cozido", "arroz integral cozido"],
        )
        assert pareamento.pares == ((0, 1), (1, 0))
        assert pareamento.extras == ()
        assert pareamento.faltantes == ()

    def test_e_um_para_um(self):
        """Modelo que repete "arroz" três vezes num prato com um arroz só tem um
        acerto e dois itens inventados — a repetição é sintoma de alucinação, e
        casamento independente a contaria como três acertos."""
        pareamento = parear(["arroz", "arroz", "arroz"], ["arroz branco cozido"])
        assert len(pareamento.pares) == 1
        assert len(pareamento.extras) == 2
        assert pareamento.faltantes == ()

    def test_item_inventado_vira_extra(self):
        pareamento = parear(["arroz branco", "bife"], ["arroz branco"])
        assert pareamento.extras == (1,)
        assert pareamento.faltantes == ()

    def test_item_esquecido_vira_faltante(self):
        pareamento = parear(["arroz branco"], ["arroz branco", "farofa"])
        assert pareamento.extras == ()
        assert pareamento.faltantes == (1,)

    def test_prato_vazio_com_resposta_vazia(self):
        pareamento = parear([], [])
        assert pareamento.pares == ()
        assert pareamento.extras == ()
        assert pareamento.faltantes == ()
