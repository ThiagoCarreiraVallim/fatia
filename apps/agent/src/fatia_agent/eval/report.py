"""O relatório — e a guarda que impede uma amostra pequena de virar citação (#138).

Um benchmark que publica um número medido sobre cinco fotos escolhidas por quem
escreveu o código é **pior que benchmark nenhum**: ele some do contexto e
sobrevive como "a precisão é 78 %" numa decisão de seis meses depois. Por isso a
regra de publicação mora aqui, no gerador, e não na disciplina de quem roda:

- abaixo de `MINIMO_PUBLICAVEL` fotos, ou fora do split de avaliação, o
  documento nasce com o carimbo de rascunho e **sem veredito**;
- o cabeçalho grava `model`, host, data e a impressão digital do prompt, porque
  um número medido contra o gemma local não transfere para o modelo do gateway —
  e essa confusão é o erro mais provável desta issue inteira;
- o limiar é impresso **antes** do resultado, porque limiar decidido depois de
  ver o número não é limiar, é justificativa.
"""

from dataclasses import dataclass
from datetime import date

from .metrics import Distribuicao, Identificacao, Operacional, Porcao

# Mínimo de fotos no split de avaliação para o relatório sair publicável.
#
# Não é um número redondo por acaso: abaixo disto o intervalo de confiança de uma
# proporção fica largo o bastante para conter tanto "aprova" quanto "reprova" no
# limiar de revocação — o relatório sairia com um veredito que a amostra não
# sustenta. Ver §"Amostra" de `docs/benchmark-reconhecimento-refeicao.md`.
MINIMO_PUBLICAVEL = 30

CARIMBO_RASCUNHO = (
    "> ⚠️ **RASCUNHO — NÃO É RESULTADO PUBLICÁVEL. NÃO CITE ESTES NÚMEROS.**\n"
    ">\n"
    "> {motivo}\n"
    ">\n"
    "> Os números abaixo existem para verificar que o arcabouço roda, e só. Um\n"
    "> número medido sobre amostra insuficiente vira citação em decisão futura,\n"
    "> que é o dano que este benchmark existe para evitar."
)


@dataclass(frozen=True)
class Limiares:
    """O portão de decisão, fixado **antes** de medir (plano da #138)."""

    revocacao_minima: float = 0.80
    alucinacao_maxima: float = 0.10
    mape_kcal_refeicao_maximo: float = 25.0


@dataclass(frozen=True)
class Cabecalho:
    """Contra o que este número foi medido. Sem isto o relatório não vale nada."""

    modelo: str
    provedor_host: str
    split: str
    manifesto_sha256: str
    prompt_sha256: str
    n_fotos: int
    data: date
    truncado: bool = False
    """`True` quando `--limite` cortou o conjunto — nunca publicável."""


def motivo_de_rascunho(cabecalho: Cabecalho) -> str | None:
    """Por que este relatório não é publicável; `None` quando ele é."""
    if cabecalho.truncado:
        return (
            "A execução foi cortada por `--limite`: o conjunto medido não é o "
            "conjunto declarado no manifesto."
        )
    if cabecalho.split != "eval":
        return (
            f"Split `{cabecalho.split}`. O número publicável sai do split `eval`; "
            "`dev` é o conjunto contra o qual o prompt é ajustado, e medir nele "
            "reporta o quanto o ajuste decorou as fotos do ajuste."
        )
    if cabecalho.n_fotos < MINIMO_PUBLICAVEL:
        return (
            f"{cabecalho.n_fotos} foto(s) no split de avaliação, e o mínimo é "
            f"{MINIMO_PUBLICAVEL}. Abaixo disso o intervalo contém aprovação e "
            "reprovação ao mesmo tempo."
        )
    return None


def montar_markdown(
    cabecalho: Cabecalho,
    ident: Identificacao,
    porc: Porcao,
    oper: Operacional,
    limiares: Limiares | None = None,
    nao_casados: list[tuple[str, str]] | None = None,
) -> str:
    """O relatório inteiro em Markdown, pronto para virar arquivo."""
    limiares = limiares or Limiares()
    motivo = motivo_de_rascunho(cabecalho)

    linhas: list[str] = ["# Benchmark de reconhecimento de refeição — execução", ""]
    if motivo is not None:
        linhas += [CARIMBO_RASCUNHO.format(motivo=motivo), ""]

    linhas += _bloco_cabecalho(cabecalho)
    linhas += _bloco_limiares(limiares)
    linhas += _bloco_identificacao(ident)
    linhas += _bloco_porcao(porc)
    linhas += _bloco_operacional(oper)
    linhas += _bloco_nao_casados(nao_casados)

    linhas += ["", "## Veredito", ""]
    if motivo is not None:
        linhas += [
            f"**Sem veredito.** {motivo}",
            "",
            "A recomendação de seguir ou não com o reconhecimento por foto depende de uma",
            "medida, e esta execução não é uma. Ver",
            "`docs/benchmark-reconhecimento-refeicao.md` para o que falta.",
        ]
    else:
        linhas += _veredito(ident, porc, limiares)

    return "\n".join(linhas) + "\n"


def _bloco_cabecalho(cabecalho: Cabecalho) -> list[str]:
    return [
        "## Contra o que isto foi medido",
        "",
        "Um número medido contra um modelo **não transfere** para outro. Este bloco é o",
        "que impede alguém de ler o resultado abaixo como se fosse sobre o modelo de",
        "produção.",
        "",
        "| campo | valor |",
        "| --- | --- |",
        f"| modelo | `{cabecalho.modelo}` |",
        f"| host do provedor | `{cabecalho.provedor_host}` |",
        f"| split | `{cabecalho.split}` |",
        f"| fotos | {cabecalho.n_fotos} |",
        f"| sha256 do manifesto | `{cabecalho.manifesto_sha256[:16]}…` |",
        f"| sha256 do prompt | `{cabecalho.prompt_sha256[:16]}…` |",
        f"| data | {cabecalho.data.isoformat()} |",
        "",
    ]


def _bloco_limiares(limiares: Limiares) -> list[str]:
    return [
        "## Limiar de aceitação, fixado antes de medir",
        "",
        "| métrica | limiar |",
        "| --- | --- |",
        f"| revocação de identificação | ≥ {limiares.revocacao_minima:.2f} |",
        f"| taxa de alucinação | ≤ {limiares.alucinacao_maxima:.2f} |",
        f"| erro de kcal por refeição | ≤ {limiares.mape_kcal_refeicao_maximo:.0f} % |",
        "",
    ]


def _bloco_identificacao(ident: Identificacao) -> list[str]:
    listados = ident.verdadeiros_positivos + ident.falsos_positivos
    no_prato = ident.verdadeiros_positivos + ident.falsos_negativos
    return [
        "## Identificação — acertou *o quê*",
        "",
        f"Sobre as {ident.n_fotos} foto(s) que renderam resposta utilizável.",
        "",
        "| métrica | valor | n |",
        "| --- | --- | --- |",
        f"| precisão (por item) | {_pct(ident.precisao)} | {listados} itens listados |",
        f"| revocação (por item) | {_pct(ident.revocacao)} | {no_prato} itens no prato |",
        f"| taxa de alucinação | {_pct(ident.taxa_de_alucinacao)} | idem |",
        _linha_dist("itens inventados por foto", ident.alucinacoes_por_foto),
        _linha_dist("precisão por foto", ident.precisao_por_foto, fator=100, unidade=" %"),
        _linha_dist("revocação por foto", ident.revocacao_por_foto, fator=100, unidade=" %"),
        "",
        "**A taxa de alucinação é `1 - precisão`**, não uma segunda evidência. O que ela",
        "acrescenta está na linha seguinte: quantos itens inventados a pessoa precisa",
        "notar na tela de confirmação, por foto.",
        "",
    ]


def _bloco_porcao(porc: Porcao) -> list[str]:
    linhas = [
        "## Porção — errou *quanto*",
        "",
        "Só sobre os itens corretamente identificados. A kcal é calculada como o produto",
        "calcula: `kcal_100g` da TACO (do rótulo) vezes a grama que o modelo estimou.",
        "",
        "| métrica | valor | n |",
        "| --- | --- | --- |",
        _linha_dist("MAPE em gramas (item)", porc.mape_gramas, unidade=" %"),
        _linha_dist("MAPE em kcal (item)", porc.mape_kcal_item, unidade=" %"),
        _linha_dist("erro de kcal (refeição)", porc.erro_kcal_refeicao, unidade=" %"),
        "",
        "O erro por refeição inclui o item que o modelo **esqueceu** — ele entra na conta",
        "real com a kcal do rótulo — porque é isso que a pessoa vê no total do dia.",
    ]
    if porc.fotos_subestimadas:
        linhas += [
            "",
            f"⚠️ {porc.fotos_subestimadas} foto(s) tiveram item inventado **sem** kcal do",
            "modelo, contado como 0. Nelas o erro de refeição é um piso, não a medida.",
        ]
    return [*linhas, ""]


def _bloco_operacional(oper: Operacional) -> list[str]:
    linhas = [
        "## Operacional",
        "",
        "| métrica | valor |",
        "| --- | --- |",
        f"| fotos processadas | {oper.n_fotos} |",
        f"| respostas inutilizáveis | {oper.falhas} ({_pct(oper.taxa_de_falha)}) |",
        f"| por código | {_codes(oper.falhas_por_code)} |",
        f"| latência (s) | {_dist(oper.latencia_s)} |",
        "",
        "**Custo por reconhecimento não sai deste runner.** Contra provedor local é zero;",
        f"contra gateway é a fatura do período dividida pelas {oper.n_fotos} chamadas",
        "desta execução. Derivar custo de contagem estimada de token seria inventar um",
        "número num relatório que existe para não ter números inventados.",
    ]
    if oper.falhas:
        linhas += [
            "",
            "As métricas de identificação e porção **excluem** as fotos que falharam. Com",
            f"taxa de falha em {_pct(oper.taxa_de_falha)}, elas descrevem a qualidade do",
            "modelo quando ele responde, e **superestimam** a experiência de quem usa o",
            "produto.",
        ]
    return [*linhas, ""]


def _bloco_nao_casados(nao_casados: list[tuple[str, str]] | None) -> list[str]:
    if not nao_casados:
        return []
    return [
        "## Pares que não casaram",
        "",
        "Candidatos a sinônimo regional (`eval/matching.py`) ou erro real do modelo.",
        "Cada linha é uma decisão do dono, não do runner.",
        "",
        "| o modelo disse | o rótulo diz |",
        "| --- | --- |",
        *[f"| {previsto} | {rotulado} |" for previsto, rotulado in nao_casados[:20]],
    ]


def _veredito(ident: Identificacao, porc: Porcao, limiares: Limiares) -> list[str]:
    """Compara com o limiar e recomenda — inclusive quando a recomendação é não."""
    checagens: list[tuple[str, float | None, float, str]] = [
        ("revocação", ident.revocacao, limiares.revocacao_minima, "≥"),
        ("alucinação", ident.taxa_de_alucinacao, limiares.alucinacao_maxima, "≤"),
        (
            "erro de kcal por refeição",
            porc.erro_kcal_refeicao.media,
            limiares.mape_kcal_refeicao_maximo,
            "≤",
        ),
    ]

    linhas = ["| métrica | medido | limiar | passa? |", "| --- | --- | --- | --- |"]
    todas_passam = True
    for nome, medido, limiar, sentido in checagens:
        if medido is None:
            passa = False
            resultado = "não medido"
        else:
            passa = medido >= limiar if sentido == "≥" else medido <= limiar
            resultado = "sim" if passa else "**não**"
        todas_passam = todas_passam and passa
        linhas.append(f"| {nome} | {_num(medido)} | {sentido} {limiar} | {resultado} |")

    linhas.append("")
    if todas_passam:
        linhas.append(
            "**Recomendação: seguir.** As três métricas do portão ficaram dentro do "
            "limiar fixado antes de medir."
        )
    else:
        linhas.append(
            "**Recomendação: não seguir com o reconhecimento por foto como está.** Pelo "
            "menos uma métrica do portão ficou fora do limiar fixado antes de medir. "
            "Isto vira ADR, e o resultado é publicado como está — a issue exige "
            "publicar inclusive quando é ruim."
        )
    return linhas


def _pct(valor: float | None) -> str:
    return "—" if valor is None else f"{valor * 100:.1f} %"


def _num(valor: float | None) -> str:
    return "—" if valor is None else f"{valor:.3g}"


def _linha_dist(rotulo: str, dist: Distribuicao, *, fator: float = 1.0, unidade: str = "") -> str:
    return f"| {rotulo} | {_dist(dist, fator=fator, unidade=unidade)} | {dist.n} |"


def _dist(dist: Distribuicao, *, fator: float = 1.0, unidade: str = "") -> str:
    """Média ± desvio, com mediana e máximo. **Nunca só a média.**"""
    if dist.n == 0 or dist.media is None:
        return "— (n = 0)"
    desvio = "—" if dist.desvio is None else f"{dist.desvio * fator:.3g}"
    return (
        f"{dist.media * fator:.3g}{unidade} ± {desvio} "
        f"(mediana {_num(_escalar(dist.mediana, fator))}, "
        f"p95 {_num(_escalar(dist.p95, fator))}, "
        f"máx {_num(_escalar(dist.maximo, fator))})"
    )


def _escalar(valor: float | None, fator: float) -> float | None:
    return None if valor is None else valor * fator


def _codes(por_code: dict[str, int]) -> str:
    return "—" if not por_code else ", ".join(f"`{code}`: {n}" for code, n in por_code.items())
