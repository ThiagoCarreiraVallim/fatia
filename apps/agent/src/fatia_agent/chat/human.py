"""`ask_user`: a única tool local, e a única que para para ouvir a pessoa.

Existe porque o prompt sempre pediu ao modelo que perguntasse quando faltasse o
essencial ("200 g ou uma porção?"), e perguntar por texto fecha o turno: a
resposta chega como mensagem nova, sem nada que a amarre à pergunta. Com a tool,
a pergunta vira uma pausa do grafo (ADR 023) com campos tipados, e a resposta
volta para o **mesmo** ponto do trabalho.

A tool em si não faz nada: ela devolve um resultado sentinela, e quem para é o
nó `portao`. Interromper dentro da execução de tools reexecutaria o lote inteiro
na retomada — ver o docstring de `graph.py`.
"""

import json
from typing import Any, Literal, TypedDict

NOME = "ask_user"

TIPOS_DE_CAMPO = ("text", "number", "date", "select", "boolean")


class CampoDaPergunta(TypedDict, total=False):
    """Um campo do formulário. Objeto, e não string: string não carrega rótulo,
    tipo nem obrigatoriedade, e a tela não monta formulário a partir dela."""

    name: str
    label: str
    type: Literal["text", "number", "date", "select", "boolean"]
    required: bool
    options: list[str]


DEFINICAO: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": NOME,
        "description": (
            "Pergunta algo à pessoa e espera a resposta antes de continuar. Use quando faltar "
            "um dado essencial para consultar ou registrar — a quantidade de um alimento, qual "
            "de duas refeições, a data. Não use para pedir confirmação de registro: a tela já "
            "pede. Uma pergunta por vez, curta."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "A pergunta, em uma frase."},
                "fields": {
                    "type": "array",
                    "description": "Campos do formulário. Omita para uma resposta livre.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "label": {"type": "string"},
                            "type": {"type": "string", "enum": list(TIPOS_DE_CAMPO)},
                            "required": {"type": "boolean"},
                            "options": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["name", "label"],
                    },
                },
            },
            "required": ["prompt"],
        },
    },
}


def pergunta_dos_argumentos(argumentos: dict[str, Any]) -> dict[str, Any]:
    """Os argumentos do modelo como a pergunta que a tela vai mostrar.

    Tolerante de propósito: modelo pequeno manda `fields` como lista de string,
    ou `type` que não existe. Um campo torto vira campo de texto em vez de
    derrubar a pergunta — perguntar mal é melhor que não perguntar.
    """
    prompt = argumentos.get("prompt")
    campos: list[CampoDaPergunta] = []
    for indice, bruto in enumerate(argumentos.get("fields") or []):
        if isinstance(bruto, str):
            campos.append({"name": f"campo_{indice}", "label": bruto, "type": "text"})
            continue
        if not isinstance(bruto, dict):
            continue
        tipo = bruto.get("type")
        campo: CampoDaPergunta = {
            "name": str(bruto.get("name") or f"campo_{indice}"),
            "label": str(bruto.get("label") or bruto.get("name") or "Resposta"),
            "type": tipo if tipo in TIPOS_DE_CAMPO else "text",
            "required": bruto.get("required") is True,
        }
        opcoes = bruto.get("options")
        if isinstance(opcoes, list):
            campo["options"] = [str(opcao) for opcao in opcoes]
        campos.append(campo)
    return {"prompt": str(prompt or "Pode me dar mais um detalhe?"), "fields": campos}


def resposta_em_texto(resposta: object) -> str:
    """O que voltou da pessoa, no texto que o modelo lê como resultado da tool.

    Formulário vira "campo: valor"; resposta livre vai como veio. Ausência não
    vira string vazia: um resultado vazio faz o modelo achar que a tool falhou.
    """
    if isinstance(resposta, dict):
        if "value" in resposta:
            return resposta_em_texto(resposta["value"])
        partes = [f"{chave}: {valor}" for chave, valor in resposta.items()]
        return "; ".join(partes) or "(a pessoa não respondeu)"
    if resposta is None or resposta == "":
        return "(a pessoa não respondeu)"
    if isinstance(resposta, bool):
        return "sim" if resposta else "não"
    return str(resposta)


def sentinela(pergunta: dict[str, Any]) -> str:
    """O conteúdo do resultado pendente, enquanto a pessoa não responde.

    Ele não é lido pelo modelo — o portão troca a mensagem antes da volta
    seguinte. Existe porque todo `tool_call` precisa de resposta no histórico, e
    uma retomada que falhe no meio deixaria a pergunta legível no checkpoint.
    """
    return "Aguardando a resposta da pessoa: " + json.dumps(pergunta, ensure_ascii=False)


__all__ = [
    "DEFINICAO",
    "NOME",
    "TIPOS_DE_CAMPO",
    "CampoDaPergunta",
    "pergunta_dos_argumentos",
    "resposta_em_texto",
    "sentinela",
]
