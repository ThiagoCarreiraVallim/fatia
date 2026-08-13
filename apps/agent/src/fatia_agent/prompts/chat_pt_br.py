"""Prompt de sistema do chat hospedado, em português do Brasil.

Em constante, e não montado na rota, pelo mesmo motivo do prompt da #139: ele é
parte do que se mede quando alguém for medir a qualidade do chat, e um prompt
remontado em dois lugares deixa de ser o mesmo prompt sem ninguém notar.

O que ele **não** faz: prometer que o modelo obedece. Instrução de prompt não é
mecanismo de segurança — quem garante que nada é gravado sem aprovação é o
recorte de três camadas em `chat/tool_policy.py` (ADR 022): a tool confirmável
sai como proposta e só executa no turno seguinte, com a aprovação da pessoa, e a
tool que apaga não é oferecida. O parágrafo sobre escrita existe para o modelo
**usar** a ferramenta em vez de pedir confirmação por texto — a tela já pergunta,
e um modelo que pergunta antes faz a pessoa confirmar duas vezes.
"""

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DIAS = (
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
)

SISTEMA = (
    "Você é o assistente da Fatia, um app de nutrição e treino. "
    "Fale em português do Brasil, com frases curtas e diretas.\n\n"
    "Você tem ferramentas para CONSULTAR os dados de quem está falando com você: "
    "refeições, alimentos, treinos, peso, metas e progresso. Use-as antes de responder "
    "qualquer pergunta sobre os dados da pessoa — nunca invente número, data ou nome de "
    "alimento. Se uma consulta não trouxer nada, diga que não encontrou.\n\n"
    "Você também tem ferramentas para REGISTRAR e ALTERAR: refeição, treino, série, peso, "
    "água, passos e metas. Elas não gravam na hora — quando você chama uma delas, a pessoa "
    "vê na tela o que você propôs e aprova ou recusa. Então chame a ferramenta em vez de "
    "pedir confirmação por texto: a tela já pergunta, e perguntar duas vezes só atrasa. "
    "Não diga que gravou; diga o que vai gravar, e preencha os campos com o que a pessoa "
    "falou — se faltar algo essencial, como a quantidade, pergunte antes de chamar.\n\n"
    "Você NÃO tem ferramenta para apagar nada. Se pedirem para excluir uma refeição, um "
    "treino ou um registro, explique que isso é feito na tela do app e diga em qual, sem "
    "prometer que você fez.\n\n"
    "Não dê diagnóstico, prescrição médica nem meta calórica apresentada como recomendação "
    "clínica. Você ajuda a entender o que já está registrado."
)


def sistema_com_data(timezone: str | None, agora: datetime | None = None) -> str:
    """`SISTEMA` mais a data de hoje no fuso de quem está conversando.

    Sem isto o modelo não tem como responder "o que eu comi ontem": as tools do
    `/mcp` recebem data em `AAAA-MM-DD`, e um modelo sem relógio inventa o dia —
    silenciosamente, com cara de resposta certa, sobre os dados de outra data.

    **Montado por turno, e não em constante**, ao contrário de `SISTEMA`: a data
    muda, e um prompt com "hoje" congelado na hora em que o processo subiu erra
    a partir da meia-noite — num serviço que fica semanas de pé.

    Fuso ausente ou desconhecido devolve o prompt sem a linha, em vez de assumir
    um: o `apps/api` manda o fuso do perfil, e chutar o do servidor faria a data
    errar por um dia para quem está do outro lado do mundo — que é pior que o
    modelo saber que não sabe.

    **Sem a hora do relógio**, e isso é observação de campo e não estilo: com
    "são 23:27" na mesma frase, o `ornith-1.0-9b` local respondeu "hoje é
    23/08/2026" — leu o horário como dia. A hora não ajuda a resolver "ontem" (a
    tool recebe data, não instante) e cada número a mais na linha é uma chance a
    mais de o modelo pequeno pegar o errado.
    """
    zona = _zona(timezone)
    if zona is None:
        return SISTEMA

    hoje = agora.astimezone(zona) if agora is not None else datetime.now(zona)
    return SISTEMA + (
        f"\n\nHoje é {DIAS[hoje.weekday()]}, {hoje:%Y-%m-%d} (fuso {timezone}). "
        "As ferramentas esperam data neste formato, AAAA-MM-DD. Use esta data para "
        "resolver 'hoje', 'ontem' e 'esta semana', e nunca chute uma data — se a "
        "pergunta é sobre um dia específico, passe o parâmetro de data na ferramenta."
    )


def _zona(timezone: str | None) -> ZoneInfo | None:
    if not timezone:
        return None
    try:
        return ZoneInfo(timezone)
    # `ZoneInfoNotFoundError` é o caso esperado (fuso que não existe na base do
    # sistema); `ValueError` cobre o nome malformado, que o construtor recusa
    # antes de procurar. Nenhum dos dois pode derrubar uma conversa.
    except (ZoneInfoNotFoundError, ValueError):
        return None


__all__ = ["SISTEMA", "sistema_com_data"]
