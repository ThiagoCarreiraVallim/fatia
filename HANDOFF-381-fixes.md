# HANDOFF #381 — correções do review

Branch `redesign/381-review-fixes` (worktree `.claude/worktrees/381-review-fixes`), base 5db16542. Sem push.

## Como rodar

- `.env` (fora do git) = `.env` principal com o banco trocado para `fatia_t381f` (migrado e semeado).
- API: `cd apps/api && set -a && . ../../.env && set +a && npx jest <arquivo>`.

## Checklist (cada item: teste vermelho -> correção -> commit)

1. [x] Web: lista de pendentes do treino livre fica velha (usePendingExercises compartilhado)
2. [~] Excluir plano vira "Treino livre" (snapshot planName/wasPlanned + backfill)
3. [ ] Salvar como plano idempotente (WorkoutPlan.fromSessionId, "Ver plano")
4. [ ] Salvar como plano exige sessão concluída (409)
5. [ ] Ordem dos exercícios do plano = resumo; exerciseOrder no treino livre
6. [ ] Cursor do histórico (keyset opaco por usuário)
7. [ ] Mobile: toque duplo em Iniciar treino
8. [ ] Invalidar ['workout','history'] ao terminar/check-in/excluir/sensação

Migração única: `20261116030000_session_plan_snapshot_and_plan_source`.

## Próximo passo

Item 2: API feita (commit "fix(api): sessão guarda retrato do plano"); falta a UI (planActionOf no api-client, junto com o "Ver plano" do item 3). Depois itens 3-6 na API (spec vermelho em history-review.integration.spec.ts; rodar sem diagnóstico TS com o config em scratchpad ou só depois de tipar).
