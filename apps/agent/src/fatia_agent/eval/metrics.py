"""As métricas do benchmark — funções puras, sem modelo e sem rede (#138).

**Identificação e porção são números separados, e nunca viram uma nota geral.**
Eles falham de formas diferentes e custam coisas diferentes: um item inventado
entra no histórico de quem não reparou; 30 % a mais de arroz custa pouca caloria
e 30 % a mais de óleo custa muita.

**Toda agregação carrega `n` e dispersão.** Um MAPE de 22 % sobre 12 fotos, sem
desvio, é impressão com aparência de medida — e é a forma mais provável de este
benchmark mentir. Por isso `Distribuicao` não tem como devolver só a média, e
`n == 0` devolve `None` em vez de zero: zero é um número, e um número entra em
decisão.
"""

import math
import statistics
from collections.abc import Sequence
from dataclasses import dataclass, field

from .matching import parear


@dataclass(frozen=True)
class ItemPareado:
    """Um alimento que o modelo identificou e o rótulo confirma."""

    previsto: str
    rotulado: str
    gramas_previstas: float
    gramas_rotuladas: float
    kcal_100g: float | None


@dataclass(frozen=True)
class ItemSolto:
    """Um item que ficou sem par: inventado pelo modelo, ou esquecido por ele."""

    nome: str
    gramas: float
    kcal: float | None
    """kcal **da porção**. Do modelo, no item extra; do rótulo, no faltante."""


@dataclass(frozen=True)
class ResultadoDaFoto:
    """O que uma foto rendeu, já casado. É a entrada de todas as métricas."""

    foto_id: str
    latencia_s: float
    pares: tuple[ItemPareado, ...] = ()
    extras: tuple[ItemSolto, ...] = ()
    faltantes: tuple[ItemSolto, ...] = ()
    falha: str | None = None
    """`code` do erro quando a foto não rendeu resposta utilizável (`None` = ok)."""

    @property
    def respondeu(self) -> bool:
        return self.falha is None


@dataclass(frozen=True)
class Distribuicao:
    """Um conjunto de valores resumido sem esconder o tamanho nem a dispersão."""

    n: int
    media: float | None = None
    desvio: float | None = None
    mediana: float | None = None
    p95: float | None = None
    maximo: float | None = None


def resumir(valores: Sequence[float]) -> Distribuicao:
    if not valores:
        # Nem média zero nem desvio zero: `n = 0` com números preenchidos é
        # exatamente como um relatório vazio passa por resultado.
        return Distribuicao(n=0)
    ordenados = sorted(valores)
    return Distribuicao(
        n=len(valores),
        media=statistics.fmean(valores),
        # Desvio **amostral**; com um valor só não existe dispersão, e `None`
        # diz isso melhor que 0.0.
        desvio=statistics.stdev(valores) if len(valores) > 1 else None,
        mediana=statistics.median(valores),
        p95=_percentil(ordenados, 95),
        maximo=ordenados[-1],
    )


def _percentil(ordenados: Sequence[float], percentil: float) -> float:
    """Percentil por **posição mais próxima acima** (`ceil`), sem interpolar.

    Interpolar inventaria um valor entre duas medidas, e com N de dezenas isso
    não muda decisão nenhuma — mas faz o p95 parecer um número que ninguém
    mediu. Aqui o p95 é sempre uma latência que aconteceu de verdade.
    """
    indice = min(len(ordenados) - 1, math.ceil(percentil / 100 * len(ordenados)) - 1)
    return ordenados[max(0, indice)]


@dataclass(frozen=True)
class Identificacao:
    """Acertou **o quê**. Nada aqui fala de quantidade."""

    n_fotos: int
    verdadeiros_positivos: int
    falsos_positivos: int
    falsos_negativos: int
    precisao: float | None
    revocacao: float | None
    taxa_de_alucinacao: float | None
    """Fração dos itens listados que não existem no prato.

    **É o complemento exato da precisão** (`1 - precisao`), e está aqui por outro
    motivo: a issue pede alucinação por nome, e reportar as duas sem dizer isto
    faria alguém contá-las como duas evidências independentes. A informação nova
    está em `alucinacoes_por_foto` — 10 % com doze itens listados é um item
    inventado por foto, 10 % com dois itens é um a cada cinco fotos, e o que
    decide se a tela de confirmação protege é esse número, não a taxa.
    """
    alucinacoes_por_foto: Distribuicao
    precisao_por_foto: Distribuicao
    revocacao_por_foto: Distribuicao


def identificacao(resultados: Sequence[ResultadoDaFoto]) -> Identificacao:
    """Precisão, revocação e alucinação, micro (por item) e por foto.

    **Só sobre as fotos que responderam.** Uma foto que falhou não tem
    identificação ruim, ela não tem identificação — misturar as duas faria a
    precisão cair quando o provedor cai. A taxa de falha é métrica operacional, e
    o relatório avisa que a precisão medida aqui superestima a experiência real
    quando essa taxa não é ~0.
    """
    respondidas = [r for r in resultados if r.respondeu]

    vp = sum(len(r.pares) for r in respondidas)
    fp = sum(len(r.extras) for r in respondidas)
    fn = sum(len(r.faltantes) for r in respondidas)

    por_foto_precisao: list[float] = []
    por_foto_revocacao: list[float] = []
    for r in respondidas:
        listados = len(r.pares) + len(r.extras)
        no_prato = len(r.pares) + len(r.faltantes)
        # Uma foto sem item listado não tem precisão definida, e uma foto de
        # prato vazio não tem revocação definida. Contar 0 nos dois casos
        # castigaria o modelo por acertar o controle negativo.
        if listados:
            por_foto_precisao.append(len(r.pares) / listados)
        if no_prato:
            por_foto_revocacao.append(len(r.pares) / no_prato)

    return Identificacao(
        n_fotos=len(respondidas),
        verdadeiros_positivos=vp,
        falsos_positivos=fp,
        falsos_negativos=fn,
        precisao=_razao(vp, vp + fp),
        revocacao=_razao(vp, vp + fn),
        taxa_de_alucinacao=_razao(fp, vp + fp),
        alucinacoes_por_foto=resumir([float(len(r.extras)) for r in respondidas]),
        precisao_por_foto=resumir(por_foto_precisao),
        revocacao_por_foto=resumir(por_foto_revocacao),
    )


@dataclass(frozen=True)
class Porcao:
    """Errou **quanto**. Só sobre itens corretamente identificados."""

    mape_gramas: Distribuicao
    """Erro percentual absoluto na grama, por item casado."""

    erro_kcal_item: Distribuicao
    """Erro do item **em kcal**, não em percentual, e só com `kcal_100g` no rótulo.

    **Não existe "MAPE em kcal por item" separado do MAPE em gramas.** Como o
    produto calcula a kcal do item casado multiplicando a grama estimada pela
    `kcal_100g` do rótulo, a `kcal_100g` cancela na razão:
    `|k·p - k·r| / (k·r) = |p - r| / r`. Reportar as duas daria dois números
    idênticos com nomes diferentes, e alguém os leria como duas evidências —
    exatamente o erro que a taxa de alucinação já obriga a explicar.

    O que a kcal acrescenta é a **magnitude**: 20 % a mais de alface são 3 kcal e
    20 % a mais de óleo são 177 kcal. Por isso este número é absoluto.
    """

    erro_kcal_refeicao: Distribuicao
    """Erro percentual da refeição inteira — o que a pessoa sente no dia."""

    fotos_com_kcal: int
    """Quantas fotos entraram em `erro_kcal_refeicao`."""

    kcal_inventada_em_controle: Distribuicao = field(default_factory=lambda: Distribuicao(n=0))
    """Kcal que o modelo somou em foto **sem comida nenhuma** no rótulo.

    O controle negativo não tem erro percentual: a kcal real é zero, e dividir por
    ela inventaria um denominador. Sem esta linha ele ficaria fora de toda métrica
    de kcal, e o dano de um prato lavado que vira 300 kcal no dia da pessoa não
    apareceria em lugar nenhum — só a contagem de itens, na identificação.
    """

    fotos_subestimadas: int = 0
    """Fotos em que um item inventado entrou com 0 kcal por o modelo não ter
    dito a caloria dele. O erro de refeição delas é um **piso**, não a medida."""


def porcao(resultados: Sequence[ResultadoDaFoto]) -> Porcao:
    """MAPE em gramas, kcal absoluta por item e erro percentual por refeição.

    A kcal do item casado é calculada **como o produto calcula**: `kcal_100g` do
    rótulo (a entrada da TACO) vezes a grama, prevista de um lado e real do
    outro. Assim o número isola o erro de porção — que é o que o produto não tem
    como corrigir — em vez de medir a kcal auto-relatada pelo modelo, que
    `meal-recognition.service.ts` descarta quando o item casa.
    """
    erros_gramas: list[float] = []
    erros_kcal_item: list[float] = []
    erros_refeicao: list[float] = []
    kcal_em_controle: list[float] = []
    subestimadas = 0

    for r in resultados:
        if not r.respondeu:
            continue

        for par in r.pares:
            erro_gramas = _erro_relativo(par.gramas_previstas, par.gramas_rotuladas)
            if erro_gramas is not None:
                erros_gramas.append(erro_gramas)
            if par.kcal_100g is not None:
                # Absoluto de propósito: o percentual seria o mesmo do de gramas,
                # porque `kcal_100g` cancela na razão. Ver `Porcao.erro_kcal_item`.
                erros_kcal_item.append(
                    abs(par.gramas_previstas - par.gramas_rotuladas) * par.kcal_100g / 100
                )

        if _e_controle_negativo(r):
            # Sem comida no rótulo não há erro percentual — só a kcal que o
            # modelo somou onde não havia nada.
            kcal_em_controle.append(sum(extra.kcal or 0.0 for extra in r.extras))
            continue

        erro_refeicao = _erro_da_refeicao(r)
        if erro_refeicao is None:
            continue
        erros_refeicao.append(erro_refeicao)
        if any(extra.kcal is None for extra in r.extras):
            subestimadas += 1

    return Porcao(
        mape_gramas=resumir(erros_gramas),
        erro_kcal_item=resumir(erros_kcal_item),
        erro_kcal_refeicao=resumir(erros_refeicao),
        fotos_com_kcal=len(erros_refeicao),
        kcal_inventada_em_controle=resumir(kcal_em_controle),
        fotos_subestimadas=subestimadas,
    )


def _e_controle_negativo(resultado: ResultadoDaFoto) -> bool:
    """Foto cujo rótulo não tem alimento nenhum (prato lavado, mesa vazia)."""
    return not resultado.pares and not resultado.faltantes


def _erro_da_refeicao(resultado: ResultadoDaFoto) -> float | None:
    """Erro percentual da kcal total da foto, ou `None` quando não é calculável.

    Inclui o que a métrica por item não vê e a pessoa sente: **o item que o
    modelo esqueceu entra na conta real com a kcal dele**, e o inventado entra na
    prevista. Uma foto em que o modelo acerta a grama de tudo que viu, mas não
    viu a farofa, tem erro por item ~0 e erro de refeição grande — e é o segundo
    que descreve o dia da pessoa.

    Devolve `None` se faltar `kcal_100g` de qualquer item que deveria contar: uma
    refeição meio medida em kcal não é uma medida de refeição.
    """
    real = 0.0
    prevista = 0.0

    for par in resultado.pares:
        if par.kcal_100g is None:
            return None
        real += par.kcal_100g * par.gramas_rotuladas / 100
        prevista += par.kcal_100g * par.gramas_previstas / 100

    for faltante in resultado.faltantes:
        if faltante.kcal is None:
            return None
        real += faltante.kcal

    # Item inventado sem kcal do modelo entra como 0 — o que **subestima** o
    # erro. A foto é contada em `fotos_subestimadas` para o relatório poder
    # dizer, em vez de o número parecer melhor do que é sem explicação.
    prevista += sum(extra.kcal or 0.0 for extra in resultado.extras)

    if real <= 0:
        return None
    return abs(prevista - real) / real * 100


@dataclass(frozen=True)
class Operacional:
    """Quanto custou e quanto demorou. Entra direto no modelo de negócio."""

    n_fotos: int
    falhas: int
    taxa_de_falha: float | None
    falhas_por_code: dict[str, int] = field(default_factory=dict)
    latencia_s: Distribuicao = field(default_factory=lambda: Distribuicao(n=0))


def operacional(resultados: Sequence[ResultadoDaFoto]) -> Operacional:
    """Latência e taxa de resposta inutilizável.

    **Custo por reconhecimento não é medido aqui, e isso é decisão.** O endpoint
    OpenAI-compatível devolve `usage` de forma irregular entre provedores, e um
    custo derivado de contagem de token estimada seria um número inventado num
    relatório cuja razão de existir é não ter números inventados. O que sai daqui
    é o **número de chamadas**; o custo é a fatura do gateway dividida por ele, e
    contra provedor local é zero.
    """
    falhas = [r.falha for r in resultados if r.falha is not None]
    por_code: dict[str, int] = {}
    for code in falhas:
        por_code[code] = por_code.get(code, 0) + 1

    return Operacional(
        n_fotos=len(resultados),
        falhas=len(falhas),
        taxa_de_falha=_razao(len(falhas), len(resultados)),
        falhas_por_code=dict(sorted(por_code.items())),
        # Inclui as que falharam: um timeout de 180 s é latência que a pessoa
        # esperou, e tirá-lo da conta é como o p95 fica bonito.
        latencia_s=resumir([r.latencia_s for r in resultados]),
    )


def casar_foto(
    *,
    foto_id: str,
    latencia_s: float,
    previstos: Sequence[tuple[str, float, float | None]],
    rotulados: Sequence[tuple[str, float, float | None]],
) -> ResultadoDaFoto:
    """`(nome, gramas, kcal)` previstos contra `(nome, gramas, kcal_100g)` rotulados.

    A kcal do previsto é a que o modelo auto-relatou (pode ser `None`) e só é
    usada para o item **inventado**, onde não há `kcal_100g` de rótulo a
    consultar. Nos itens casados quem manda é o rótulo — ver `porcao`.
    """
    pareamento = parear([nome for nome, _, _ in previstos], [nome for nome, _, _ in rotulados])

    pares = tuple(
        ItemPareado(
            previsto=previstos[i][0],
            rotulado=rotulados[j][0],
            gramas_previstas=previstos[i][1],
            gramas_rotuladas=rotulados[j][1],
            kcal_100g=rotulados[j][2],
        )
        for i, j in pareamento.pares
    )
    extras = tuple(
        ItemSolto(nome=previstos[i][0], gramas=previstos[i][1], kcal=previstos[i][2])
        for i in pareamento.extras
    )
    faltantes = tuple(_faltante(rotulados[j]) for j in pareamento.faltantes)
    return ResultadoDaFoto(
        foto_id=foto_id,
        latencia_s=latencia_s,
        pares=pares,
        extras=extras,
        faltantes=faltantes,
    )


def _faltante(rotulado: tuple[str, float, float | None]) -> ItemSolto:
    """O item que o modelo esqueceu, com a kcal **da porção** que estava no prato."""
    nome, gramas, kcal_100g = rotulado
    return ItemSolto(
        nome=nome,
        gramas=gramas,
        kcal=None if kcal_100g is None else kcal_100g * gramas / 100,
    )


def _razao(numerador: int, denominador: int) -> float | None:
    """Divisão que devolve `None` no lugar de dividir por zero em silêncio."""
    return numerador / denominador if denominador else None


def _erro_relativo(previsto: float, real: float) -> float | None:
    """Erro percentual, ou `None` quando o real é zero e a razão não existe.

    Devolver 0,0 aqui seria o pior valor possível: zero é o **melhor** erro que
    existe, e ele entraria na média como um acerto perfeito de um item que
    ninguém mediu — a mesma armadilha que `resumir([])` recusa.
    """
    return abs(previsto - real) / real * 100 if real else None
