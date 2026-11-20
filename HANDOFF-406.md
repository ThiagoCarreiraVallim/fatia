# HANDOFF #406: correções da revisão do PR #462

Branch `redesign/406-editor-plano`. A revisão achou 4 defeitos (D1-D4) e 2 problemas (P1, P2).
Cada um sai com um commit de teste vermelho e depois a correção.

- Banco descartável: `bash ~/.cache/fatia-vis/406/resetdbb.sh` (cria `fatia_t406b`).
  Jest: `DATABASE_URL=$(cat ~/.cache/fatia-vis/406/tdbb.url) npx jest <spec> --maxWorkers=4`.
- Testes da revisão: `apps/api/src/sharing/__tests__/plan-editor-review.integration.spec.ts`,
  adaptados de `scratchpad/specs/rev406.spec.ts`.
- A migration `20261120500000_workout_plan_editor` pode ser editada no lugar: o PR não foi mergeado.

## Passos

- [x] D1: loadPercent guardado + loadMode WEIGHT dá 400 (assertConfig)
- [x] D2: aceite com início no futuro espalha datas pelos planos que saíram; settle só refaz quando entram sessões
- [x] D3: regras de cardio fora do superRefine v2
- [x] D4: sessionKey estável (snapshot, editor, WorkoutPlan) em vez do sessionIndex
- [x] P1: baseVersionId no PUT da cópia → 409; a web manda e mostra a mensagem
- [x] P2: no mapa adoptedOf, ordenar por sessionIndex e ficar com o primeiro
- [x] REDESIGN_PROGRESS: editar a cópia (member.plans + porta de leitura) × tirar (autor/dono)
- [ ] lint, tsc e testes; merge main; push; dropar fatia_t406b; apagar este arquivo
