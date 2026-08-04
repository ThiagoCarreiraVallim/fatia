"""Casar o que o modelo listou com o que está rotulado na foto (#138).

Sem isto, "acertou o alimento?" não é uma pergunta respondível: o modelo devolve
"arroz branco cozido" e o rótulo diz "arroz branco". Duas decisões seguram o
número no lugar:

1. **A normalização é a mesma da busca de alimento.** Se o benchmark casasse por
   uma regra própria, ele mediria uma coisa e o produto faria outra — e o número
   passaria a descrever um casamento que ninguém usa.
2. **Nada de fuzzy.** Distância de edição faria "macaúba" casar com "maçã", que é
   exatamente o erro que `meal-recognition.service.ts` existe para não cometer, e
   inflaria a precisão sem deixar rastro. Aqui o casamento é por **identidade de
   tokens**; o que não casa sai listado no relatório para o dono decidir — ou
   crescer o mapa de sinônimos, o que passa por diff.
"""

import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass

# Regionalismo é o caso em que o modelo acerta e a régua diz que errou: quem
# rotulou escreveu "macaxeira" e o modelo respondeu "mandioca". O mapa nasce
# pequeno de propósito — cada linha é uma afirmação de que dois nomes são o
# mesmo alimento, e afirmação errada aqui vira precisão inflada.
#
# **Chave e valor precisam estar já normalizados** (`normalizar`); há teste que
# fixa isso, porque uma chave com acento nunca casaria e ninguém perceberia.
# O mapa de sinônimos regionais completo é trabalho da #141; este é o começo
# dele, e o campo `nao_casados` do relatório é a lista de candidatos a entrar.
SINONIMOS: dict[str, str] = {
    "aipim": "mandioca",
    "macaxeira": "mandioca",
    "jerimum": "abobora",
    "mexerica": "tangerina",
    "bergamota": "tangerina",
    "pao de sal": "pao frances",
    "cacetinho": "pao frances",
    "mamao papaia": "mamao",
    "bolacha": "biscoito",
}

_MAX_TOKENS_SINONIMO = max(len(chave.split()) for chave in SINONIMOS)


def normalizar(valor: str) -> str:
    """Reduz um nome à forma comparável: minúsculo, sem acento, sem pontuação.

    Porte de `packages/db/src/search-text.js`, que é a fonte da verdade — a
    original é JavaScript e é consumida pelo Nest e pelos seeds. Não dá para
    chamá-la daqui, então o que sobra é manter as duas iguais e **fixar as
    equivalências num teste** (`tests/eval/test_matching.py`), que é o que faz a
    divergência aparecer como falha em vez de como número diferente.

    `str.isalnum()` faz o papel de `[^\\p{L}\\p{N}]+` do original, e remover os
    caracteres combinantes depois do `NFD` faz o papel de `\\p{Diacritic}`: são
    equivalentes para o alfabeto latino, que é todo o catálogo da TACO.
    """
    decomposto = unicodedata.normalize("NFD", valor)
    sem_acento = "".join(c for c in decomposto if not unicodedata.combining(c))
    apenas_texto = "".join(c if c.isalnum() else " " for c in sem_acento.lower())
    return " ".join(apenas_texto.split())


def canonizar(nome: str) -> tuple[str, ...]:
    """Nome → tokens normalizados, com os regionalismos já reduzidos.

    O trecho **mais longo** vence: "pao de sal" tem de virar "pao frances" antes
    que "sal" seja considerado sozinho.
    """
    tokens = normalizar(nome).split()
    canonicos: list[str] = []
    posicao = 0
    while posicao < len(tokens):
        for tamanho in range(min(_MAX_TOKENS_SINONIMO, len(tokens) - posicao), 0, -1):
            trecho = " ".join(tokens[posicao : posicao + tamanho])
            substituto = SINONIMOS.get(trecho)
            if substituto is not None:
                canonicos.extend(substituto.split())
                posicao += tamanho
                break
        else:
            canonicos.append(tokens[posicao])
            posicao += 1
    return tuple(canonicos)


def mesma_identidade(previsto: str, rotulado: str) -> bool:
    """`True` quando os dois nomes falam do mesmo alimento.

    A regra é **prefixo de palavra inteira**, nos dois sentidos: "arroz" casa com
    "arroz branco cozido" (o modelo foi menos específico que o rótulo, e ainda
    assim acertou o alimento), "arroz branco" casa com "arroz branco cozido", e
    "frango grelhado" **não** casa com "frango frito" — divergem no segundo
    token, e a diferença entre eles é o dobro da caloria.

    Comparar tokens, e não caracteres, é o que impede "maçã" de casar com
    "macaúba" — o bug real que o casamento com a TACO já teve.

    **O que esta regra deixa passar, e está escrito no relatório:** um modelo
    genérico ("arroz" para tudo) não é penalizado na identificação. Quem paga por
    isso é a métrica de porção, que compara a grama contra o rótulo específico.
    """
    a = canonizar(previsto)
    b = canonizar(rotulado)
    if not a or not b:
        return False
    menor, maior = (a, b) if len(a) <= len(b) else (b, a)
    return maior[: len(menor)] == menor


@dataclass(frozen=True)
class Pareamento:
    """Resultado do casamento de uma foto. Os índices apontam para as listas de
    entrada — quem sabe o que é `grams` e `kcal_100g` é quem chamou."""

    pares: tuple[tuple[int, int], ...]
    """`(índice do previsto, índice do rotulado)`."""

    extras: tuple[int, ...]
    """Previstos que não casaram com nada — os itens **inventados**."""

    faltantes: tuple[int, ...]
    """Rotulados que o modelo não listou."""


def parear(previstos: Sequence[str], rotulados: Sequence[str]) -> Pareamento:
    """Casamento **um-para-um** entre previstos e rotulados.

    Um-para-um e não "cada previsto procura o seu": um modelo que responde
    "arroz" três vezes para um prato com um arroz só teria três acertos com
    casamento independente, e a lista repetida é justamente um sintoma de
    alucinação. Aqui o segundo "arroz" vira item extra.

    Duas passadas, e a ordem importa: primeiro os nomes **idênticos**, depois os
    que só se contêm. Sem isso, um "arroz" genérico consumiria o rótulo "arroz
    branco cozido" e deixaria o "arroz branco cozido" previsto sem par.
    """
    pares: list[tuple[int, int]] = []
    previsto_usado = [False] * len(previstos)
    rotulado_usado = [False] * len(rotulados)

    canon_previstos = [canonizar(nome) for nome in previstos]
    canon_rotulados = [canonizar(nome) for nome in rotulados]

    for i, canon in enumerate(canon_previstos):
        if not canon:
            continue
        for j, alvo in enumerate(canon_rotulados):
            if rotulado_usado[j] or canon != alvo:
                continue
            pares.append((i, j))
            previsto_usado[i] = rotulado_usado[j] = True
            break

    for i, nome_previsto in enumerate(previstos):
        if previsto_usado[i]:
            continue
        for j, nome_rotulado in enumerate(rotulados):
            if rotulado_usado[j] or not mesma_identidade(nome_previsto, nome_rotulado):
                continue
            pares.append((i, j))
            previsto_usado[i] = rotulado_usado[j] = True
            break

    return Pareamento(
        pares=tuple(sorted(pares)),
        extras=tuple(i for i, usado in enumerate(previsto_usado) if not usado),
        faltantes=tuple(j for j, usado in enumerate(rotulado_usado) if not usado),
    )
