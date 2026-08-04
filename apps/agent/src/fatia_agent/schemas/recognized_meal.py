"""Saída do reconhecimento de refeição por foto (#139), validada.

O modelo de visão devolve **texto**. Este módulo é a fronteira onde texto vira
dado: nada que não passe por aqui chega ao `apps/api`, e o que não passa vira
`AIResponseUnparseable` — erro nomeado, que o NestJS traduz em "não deu, registre
à mão", e não uma exceção crua no meio da rota.

Duas coisas que a prática com modelo local impôs e que não são preciosismo:

1. **O modo estruturado é irregular entre modelos.** O mesmo pedido volta ora
   como JSON puro, ora embrulhado em ```json, ora com uma frase de cortesia antes
   ("Claro! Aqui está:"). Extrair o primeiro objeto JSON balanceado da resposta
   custa vinte linhas e evita que um modelo educado derrube a funcionalidade.
2. **Confiança auto-relatada por LLM não é calibrada.** Ela é aceita e devolvida
   porque serve para *ordenar* e para *pintar* o item na tela de confirmação —
   nunca para esconder item nem para pular a confirmação. Ver a ADR 004 e o §7 do
   plano da #139.
"""

import json
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator

from ..providers.errors import AIResponseUnparseable

# Uma foto de prato com mais de doze itens é, na prática, alucinação em série —
# e uma lista longa derrota a tela de confirmação, que só protege se for lida.
MAX_ITENS = 12

# Nome maior que isto é frase, não alimento. Corta antes de virar `foodName` de
# 400 caracteres numa busca de catálogo.
MAX_NOME = 120

# 5 kg num prato é erro de unidade do modelo, não porção.
MAX_GRAMAS = 5_000.0


class RecognizedItem(BaseModel):
    """Um alimento candidato, como o modelo o viu. **Ainda não é MealItem.**

    Os macros são a estimativa do modelo e valem só enquanto o item não casar com
    a TACO: quando casa, quem manda é a tabela. O casamento acontece no
    `apps/api`, que é quem tem o catálogo — ver `meal-recognition.service.ts`.
    """

    model_config = {"extra": "ignore"}

    name: str = Field(min_length=1, max_length=MAX_NOME)
    grams: float = Field(gt=0, le=MAX_GRAMAS)
    confidence: float = Field(ge=0.0, le=1.0)

    # Opcionais de propósito: o modelo erra macro com muito mais frequência do
    # que erra "isto é arroz". Item sem macro continua útil — ele casa com a TACO
    # ou cai no formulário manual, que é o caminho que a issue exige existir.
    kcal: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def _sem_espaco_sobrando(cls, valor: str) -> str:
        limpo = " ".join(valor.split())
        if not limpo:
            raise ValueError("nome vazio")
        return limpo


class RecognizedMeal(BaseModel):
    """O que a foto rendeu. `items` vazio é resposta legítima, não erro.

    Foto de gato, de tela de computador ou de prato já lavado devolve lista
    vazia; a rota responde 200 e a UI diz "não identifiquei" e abre o registro
    manual. Erro seria fingir que viu comida.
    """

    model_config = {"extra": "ignore"}

    items: list[RecognizedItem] = Field(default_factory=list, max_length=MAX_ITENS)
    # Frase curta do modelo para a tela de confirmação ("prato parcialmente
    # coberto", "foto escura"). Nunca é instrução, nunca vira dado.
    note: str | None = Field(default=None, max_length=280)


def parse_recognized_meal(texto: str) -> RecognizedMeal:
    """Texto do modelo → `RecognizedMeal`, ou `AIResponseUnparseable`.

    Função pura: é ela que os testes exercitam, sem provedor e sem rede.
    """
    bruto = _primeiro_objeto_json(texto)
    if bruto is None:
        raise AIResponseUnparseable(
            f"O modelo de visão respondeu em prosa, sem nenhum objeto JSON: {texto.strip()[:120]!r}"
        )

    try:
        meal = RecognizedMeal.model_validate(bruto)
    except ValidationError as exc:
        # `error_count` e não o dump inteiro: a mensagem vai para log, e o dump
        # carregaria os nomes dos alimentos — dado de saúde (docs/DATA_RETENTION.md).
        raise AIResponseUnparseable(
            f"O JSON do modelo de visão não tem a forma esperada "
            f"({exc.error_count()} campo(s) inválido(s))."
        ) from exc

    # Do mais confiável para o menos: a tela de confirmação só protege se for
    # lida, e o que está no topo é o que é lido.
    meal.items.sort(key=lambda item: item.confidence, reverse=True)
    return meal


def _primeiro_objeto_json(texto: str) -> dict[str, Any] | None:
    """Primeiro objeto JSON balanceado do texto, ignorando o que vier em volta.

    Não é regex: chave dentro de string (`{"nome": "pão {caseiro}"}`) desbalancea
    qualquer contagem ingênua, e isso aparece com nome de prato de verdade.
    """
    inicio = texto.find("{")
    while inicio != -1:
        fim = _fim_do_objeto(texto, inicio)
        if fim is not None:
            try:
                carregado: object = json.loads(texto[inicio:fim])
            except ValueError:
                carregado = None
            if isinstance(carregado, dict):
                return carregado
        inicio = texto.find("{", inicio + 1)
    return None


def _fim_do_objeto(texto: str, inicio: int) -> int | None:
    """Índice logo após a chave que fecha o objeto aberto em `inicio`."""
    profundidade = 0
    dentro_de_string = False
    escapado = False

    for posicao in range(inicio, len(texto)):
        caractere = texto[posicao]

        if dentro_de_string:
            if escapado:
                escapado = False
            elif caractere == "\\":
                escapado = True
            elif caractere == '"':
                dentro_de_string = False
            continue

        if caractere == '"':
            dentro_de_string = True
        elif caractere == "{":
            profundidade += 1
        elif caractere == "}":
            profundidade -= 1
            if profundidade == 0:
                return posicao + 1

    return None
