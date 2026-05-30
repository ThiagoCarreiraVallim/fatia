# ADR 009 — Metas de nutrição personalizadas (nutrientes via Json flexível)

**Status:** Accepted
**Data:** 2026-05-30

## Contexto

O tracking de nutrição cobre só **kcal, proteína, carboidrato e gordura** (`Food`,
`MealItem`, `UserGoals`). Usuários querem controlar outros nutrientes — o caso motivador
é **sódio/sal** ("quero limitar meu consumo de sal"), mas também açúcar, fibra, cafeína,
gordura saturada, etc.

`UserGoals` é fixo (macros). O model dinâmico `Goal` (peso, % gordura, frequência,
passos, custom) não deriva de refeições. Nenhum dos dois resolve "meta de nutriente
derivada do que foi comido no dia".

Há duas perguntas de design:

1. **Onde guardar o valor do nutriente por item** (sódio do arroz, etc.)?
2. **Como modelar a meta** do usuário para cada nutriente?

## Decisão

Modelo **genérico de nutrientes**, MCP-first:

1. **Snapshot por item** — `MealItem.nutrients Json?`, mapa flexível
   `{ "sodium_mg": 412, "sugar_g": 9, "fiber_g": 3 }`. Ausente = não rastreado.
2. **Meta por nutriente** — novo model `NutrientTarget` (`userId`, `nutrientKey`,
   `label`, `unit`, `min?`, `max?`, `period` = `daily` na v1), único por
   `(userId, nutrientKey)`. Range min/max segue a filosofia de `UserGoals`/Goals (D6).
3. **Agregação em leitura** — o valor do dia de cada nutriente é a soma de
   `MealItem.nutrients[nutrientKey]` das refeições do dia (no fuso do usuário),
   comparado com `min`/`max` para gerar status (`under` / `ok` / `over`).
4. **MCP-first** — tools desenhadas junto da tela: `set_nutrient_target`,
   `list_nutrient_targets`, `delete_nutrient_target`, `get_nutrient_summary`; e
   `log_meal`/`add_meal_item` aceitam `nutrients` por item.

### Decisões pontuais

- **(a) Json, não colunas fixas.** Nutrientes são open-ended; adicionar coluna por
  nutriente exigiria migration a cada novo. YAGNI > DRY na v1.
- **(b) Lista inicial sugerida na UI:** sódio (mg), açúcar (g), fibra (g), gordura
  saturada (g), cafeína (mg), colesterol (mg), potássio (mg) — além de custom.
- **(c) Período só `daily` na v1.** Semanal fica preparado no campo, implementado depois.
- **(d) TACO sem micronutrientes na v1.** O valor por item é informado pelo Claude (no
  log) ou manualmente. Backfill da TACO com sódio/etc. é um seed futuro, não-bloqueante.

## Consequências

### Positivas

- Qualquer nutriente rastreável sem mudança de schema.
- Consistente com o snapshot histórico de `MealItem` (ADR/D5) e com ranges (D6).
- Cobre o caso "controlar sal" e generaliza para açúcar/fibra/etc.

### Negativas

- `nutrients` Json não é type-safe nem agregável por SQL puro — soma é feita em memória
  (aceitável na escala pessoal).
- Sem catálogo de micronutrientes, depende do Claude/usuário informar valores.

### Neutras

- Migration append-only (coluna nullable + tabela nova), segue D9.

## Alternativas consideradas

- **Colunas fixas por nutriente em Food/MealItem:** type-safe e agregável, mas rígido —
  migration por nutriente novo. Rejeitada por acoplamento e baixa flexibilidade.
- **Estender o model `Goal` com kind `nutrient_daily`:** `Goal` é orientado a métricas
  pontuais (peso, % gordura) com `lastReportedValue`, não a agregação diária de refeições.
  Misturaria responsabilidades. Rejeitada.
