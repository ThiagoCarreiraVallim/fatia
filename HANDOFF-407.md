# HANDOFF #407 — editor de alimentação

Branch `redesign/407-editor-alimentacao`. Banco de teste: `fatia_t407` (URL em `~/.cache/fatia-vis/407/t407.url`).
Pranchas renderizadas: `~/.cache/fatia-vis/407/board/`.

## Decisões

- Plano alimentar segue `NutritionPlan` (#376/ADR 045). Modelo da biblioteca ganha retrato v2 (metas alvo, refeições com hora e opções, grupos de equivalentes).
- Gerar com IA: FORA (ADR 045 proíbe a IA de gerar qualquer parte do plano). Registrar.
- Metas alvo -> faixas: kcal ±5%, macros ±10%.
- Equivalentes: calculados por item (mesma quantidade do macro-chave do grupo), arredondados a medida caseira quando cabe em ±10%.
- Cópia do aluno = versão nova (pendente) pelo fluxo de versão, `baseVersionId`/409; no aceite as trocas e "comi isso" de hoje em diante migram por `key` do item/refeição.

## Status

- [x] schema + migration 20261120600000_nutrition_plan_editor
- [x] snapshot v2 + documento (api) — sharing/nutrition-document.ts, nutrition/helpers/equivalents.ts
- [x] envio com ajuste por aluno (só com porta de Alimentação aberta; trilha `nutrition_plan_adjust`)
- [x] cópia GET/PUT + isolamento (sharing/nutrition-copy.service.ts; user-isolation #407)
- [x] aceite leva trocas e "comi isso" de hoje em diante (carryOver)
- [x] export sem editedById
- [x] api-client (nutrition-plan-editor.ts)
- [ ] web editor + cópia
- [ ] docs / passada visual
