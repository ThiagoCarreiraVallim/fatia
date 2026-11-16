# HANDOFF #381 — correções do review

Branch `redesign/381-review-fixes` (worktree `.claude/worktrees/381-review-fixes`), base 5db16542. Sem push.

## Como rodar

- `.env` (fora do git) = `.env` principal com o banco trocado para `fatia_t381f` (migrado e semeado).
- API: `cd apps/api && set -a && . ../../.env && set +a && npx jest <arquivo>`.

## Checklist (cada item: teste vermelho -> correção -> commit)

1. [x] Web: lista de pendentes do treino livre fica velha (usePendingExercises compartilhado)
2. [x] Excluir plano vira "Treino livre" (snapshot planName/wasPlanned + backfill)
3. [x] Salvar como plano idempotente (WorkoutPlan.fromSessionId, "Ver plano")
4. [x] Salvar como plano exige sessão concluída (409)
5. [x] Ordem dos exercícios do plano = resumo; exerciseOrder no treino livre
6. [ ] Cursor do histórico (keyset opaco por usuário)
7. [ ] Mobile: toque duplo em Iniciar treino
8. [ ] Invalidar ['workout','history'] ao terminar/check-in/excluir/sensação

Migração única: `20261116030000_session_plan_snapshot_and_plan_source`.

## Próximo passo

Item 6 (cursor): history com cursor opaco keyset (base64url de `startedAt|id`), list
validando o id do cursor contra o usuário (400) e keyset por ele; DTO do history sem
@IsUUID. Testes vermelhos já em history-review.integration.spec.ts. Depois 7 e 8.
