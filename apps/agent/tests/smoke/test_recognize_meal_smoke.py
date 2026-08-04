"""Reconhecimento de refeição contra um modelo de visão de verdade — fora do CI.

```bash
AI_BASE_URL=http://localhost:1234/v1 \
AI_MODEL_VISION=google/gemma-4-12b-qat \
SMOKE_MEAL_PHOTO=~/Imagens/almoco.jpg \
  uv run pytest -m smoke
```

É o único teste que prova que o **prompt** sobrevive a um modelo real: o duplo em
`tests/recognition/` prova o nosso parser, não a disposição do modelo a devolver
JSON em vez de prosa.

**A foto vem de `SMOKE_MEAL_PHOTO` e não do repositório.** Versionar uma foto de
prato aqui seria armazená-la para sempre — o git não esquece —, e o produto
inteiro se apoia na ADR 004, que diz que o Fatia não guarda foto de refeição.
Uma exceção "só no teste" é o tipo de exceção que a política não sobrevive.

**A asserção é fraca de propósito.** Confere que veio JSON parseável, com pelo
menos um item e gramas positivas. Não confere se o alimento está certo — quem
mede acerto é a #138, com conjunto rotulado e provedor de produção. Um smoke que
exigisse "reconheceu arroz" ficaria vermelho por variação de modelo e seria
desligado na semana seguinte.
"""

import os
from pathlib import Path

import pytest

from fatia_agent.providers import build_provider
from fatia_agent.recognition import recognize_meal
from fatia_agent.settings import AgentSettings

FOTO = os.getenv("SMOKE_MEAL_PHOTO", "")

pytestmark = [
    pytest.mark.smoke,
    pytest.mark.skipif(
        not os.getenv("AI_BASE_URL"),
        reason="exige AI_BASE_URL (LM Studio local ou AI Gateway)",
    ),
    pytest.mark.skipif(
        not FOTO or not Path(FOTO).expanduser().is_file(),
        reason="exige SMOKE_MEAL_PHOTO apontando para uma foto de prato (não versionada)",
    ),
]


@pytest.fixture
def provider():
    return build_provider(AgentSettings())


async def test_reconhece_pelo_menos_um_alimento_num_prato(provider):
    imagem = Path(FOTO).expanduser().read_bytes()

    meal = await recognize_meal(provider, imagem, media_type="image/jpeg")

    assert meal.items, "o modelo não devolveu nenhum item para uma foto de prato"
    assert all(item.grams > 0 for item in meal.items)
    assert all(0.0 <= item.confidence <= 1.0 for item in meal.items)
