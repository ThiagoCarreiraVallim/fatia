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

- [ ] schema + migration 20261120600000
- [ ] snapshot v2 + documento (api)
- [ ] envio com ajuste por aluno
- [ ] cópia GET/PUT + isolamento
- [ ] aceite leva trocas
- [ ] api-client
- [ ] web editor + cópia
- [ ] docs / passada visual
