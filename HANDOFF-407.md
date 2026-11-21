# HANDOFF #407 — revisão da PR #465

Branch `redesign/407-editor-alimentacao` (PR #465 aberta). Banco de teste: `fatia_t465` (URL em `~/.cache/fatia-vis/407/t465.url`; apagar no fim).
Provas: `apps/api/src/sharing/__tests__/nutrition-review-465.integration.spec.ts` (F1a–F6 vermelhos, P1–P3 sondas verdes).

## Status

- [x] refactor: nomes em inglês na prévia (snapshotGoals, goalsBeforeAndAfter)
- [x] test: provas F1a–F6 vermelhas
- [x] F1a/F1b: cópia salva sem mexer nas metas guarda as faixas do plano
- [x] F2: modelo v1 salvo no editor guarda as faixas
- [x] F3: onboarding lê metas do v2
- [ ] F4: prévia do adopt lê metas do v2
- [ ] F5: autor apagado não bifurca a linhagem
- [ ] F6: carry-over só na mesma linhagem
- [ ] testes, lint, typecheck, push; apagar este arquivo e o banco
