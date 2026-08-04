"""Foto de refeição → alimentos candidatos (#139).

**Sem LangGraph, e isto é decisão.** A ADR 015 escolheu LangGraph para o agente,
e o plano da #139 previa um grafo de três passos: visão → `search_food` pelo MCP
→ casamento com a TACO. Os dois últimos passos saíram daqui: quem casa com o
catálogo é o `apps/api`, que já tem o Postgres, o `FoodService` e o mesmo
ranqueamento (`common/search-text.ts`) que a busca digitada usa — ver o corpo da
PR. O que sobra é uma chamada e uma validação, em linha reta. Um grafo de um nó
só seria a dependência e a cerimônia sem o benefício, e o LangGraph entra quando
houver ramificação de verdade (#141).

**A imagem não é escrita em lugar nenhum.** Ela chega em memória, vira data URI
dentro do provedor e some com o fim da requisição. Sem arquivo temporário, sem
log do conteúdo, sem cache — ADR 004.
"""

from ..prompts.recognize_meal_pt_br import INSTRUCAO, SISTEMA
from ..providers.base import VisionCapability
from ..schemas.recognized_meal import RecognizedMeal, parse_recognized_meal

# Formatos que um aparelho produz e que os provedores de visão aceitam. HEIC
# fica de fora: o iPhone tira em HEIC por padrão, mas os endpoints
# OpenAI-compatíveis não o aceitam, então a conversão é do lado do app — falhar
# aqui com a lista explícita é melhor que mandar bytes que o provedor recusa com
# um 400 sem explicação.
MEDIA_TYPES_ACEITOS = frozenset({"image/jpeg", "image/png", "image/webp"})


async def recognize_meal(
    provider: VisionCapability,
    image: bytes,
    *,
    media_type: str = "image/jpeg",
) -> RecognizedMeal:
    """Descreve a foto pela capacidade de visão e valida a saída.

    O prompt de sistema e a instrução são passados como um bloco de texto só:
    parte dos endpoints OpenAI-compatíveis ignora `system` quando a mensagem do
    usuário é multimodal, e um prompt de sistema silenciosamente descartado é
    como se perde o "responda apenas JSON" sem nenhum sintoma.
    """
    resposta = await provider.describe(
        image,
        prompt=f"{SISTEMA}\n\n{INSTRUCAO}",
        media_type=media_type,
    )
    return parse_recognized_meal(resposta)
