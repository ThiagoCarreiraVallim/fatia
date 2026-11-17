# HANDOFF #382 — Progresso (gráficos, recordes, conquistas, constância, metas)

Branch `redesign/382-progresso` (worktree `.claude/worktrees/382-progresso`). Não fazer push nem PR.

## Comandos que funcionam

```bash
cd /home/thiago/Documentos/pessoal/fatia/.claude/worktrees/382-progresso
# banco descartável (só troca o nome do banco):
export DATABASE_URL="$(grep '^DATABASE_URL=' /home/thiago/Documentos/pessoal/fatia/.env | cut -d= -f2- | sed -E 's#/fatia(\?|$)#/fatia_t382\1#')"
(cd packages/db && npx prisma migrate deploy && pnpm seed:taco && pnpm seed:exercises)
(cd apps/api && npx jest)            # baseline: 178 suites / 2893 testes
(cd packages/api-client && npx vitest run)
(cd apps/web && npx vitest run)
(cd apps/mobile && npx jest)
pnpm lint && pnpm typecheck
```

Pranchas baixadas do artifact para o scratchpad (fora do git):
`/tmp/claude-1000/-home-thiago-Documentos-pessoal-fatia/0bd027d0-f0c2-42a3-b37f-2f6dd993fad5/scratchpad/canvas/project/Al-G*.dc.html`

## Decisões (do dono e minhas)

- Dono: sequência = dia ativo (≥1 área: refeição, treino, água na meta, passos na meta) em todo
  lugar; um cálculo só (`GET /streak`, Hoje, `get_streak`, conquistas leem do mesmo serviço).
- Dono: catálogo de conquistas fechado em 10 (+ `workouts_100`, "100 treinos"); contador N/10.
- Minha: a tolerância de faltas da #147 continua (é o "não pune dia perdido").
- Minha: as sub-sequências (nutrição, treino em semanas, passos) saem do `StreakSummary`.
- Minha: o desafio `ACTIVE_DAYS` da comunidade NÃO muda (é comparação entre pessoas, regra própria).

## Checklist

- [x] API: constância (`GET /progress/consistency`) + streak reescrito (`ConsistencyService`, `streak.service.ts` saiu)
- [x] API: conquista `workouts_100` + migration `20261116050000_achievement_workouts_100` + gancho `WORKOUT_FINISHED_HOOKS` (`workout-hooks.module.ts`)
- [x] API: recordes `{ records, highlight }` com `monthEvolution` (últimos 30 dias)
- [x] API: meta vencida (derivada, `effectiveStatus`) + PATCH com prazo futuro volta a `active`
- [x] MCP: `get_consistency`, `list_personal_records`, `list_achievements`, `update_goal`; docs (MCP.md, MCP_TOOL_SURFACE, totais 152) + SHA
- [x] api-client: tipos, endpoints e `progress-screens.ts` (regras de tela), rotas e Conquistas no menu
- [x] Web: G1, G6, G7 (`body-log-sheet.tsx` + gavetas com `embedded`), G5, G11, G12
- [x] Web: G9, G10 (`components/goals/goals-screen.tsx`, `new-goal-sheet.tsx`; Atualizar para meta manual)
- [x] App: G1, G6, G7, G5, G11, G12, G9, G10 (`app/(app)/progress/*`, `goals.tsx`, `components/progress/body-log-sheet.tsx`, `components/goals/new-goal-sheet.tsx`)
- [x] Docs: REDESIGN_PROGRESS (pendências e decisões do dono #382), MCP_TOOL_SURFACE, MCP.md
- [x] lint, typecheck, testes: api 182/2940, api-client 53/790, web 124/891, mobile 41/485

## Arquivos tocados

- API: `progress/consistency.service.ts`, `progress/helpers/consistency.ts`, `progress/dto/consistency.dto.ts`,
  `progress/mcp/get-consistency.tool.ts`, `progress/mcp/get-streak.tool.ts`, `progress/achievement-catalog.ts`,
  `progress/achievement.service.ts`, `progress/progress.controller.ts|module.ts`, `progress/dashboard.service.ts`,
  `mcp/intent/tools/get-day-overview.tool.ts|get-goals-overview.tool.ts`, `workout/helpers/month-evolution.ts`,
  `workout/session-set.service.ts`, `workout/workout.controller.ts`, `workout/mcp/list-personal-records.tool.ts`,
  `workout/workout-finished.hook.ts`, `workout/workout-session.service.ts` (só o gancho no `finish`),
  `workout-hooks.module.ts`, `app.module.ts`, `goals/goals.service.ts`, `goals/mcp/update-goal.tool.ts`
- DB: `packages/db/prisma/migrations/20261116050000_achievement_workouts_100/` (só dados)
- Docs: MCP.md, MCP_TOOL_SURFACE.md, totais 151→152 em README, ARCHITECTURE, SUBMISSION_CHECKLIST, site

## Próximo passo exato

Issue implementada. Falta só a passada visual do dono (capturas contra as pranchas) e o PR
pelo coordenador. Antes do merge, apagar este HANDOFF.

## Correções do review adversarial (em andamento)

- [x] 1 `mark_goal_done` acha meta vencida (178ff053)
- [x] 2 conquistas: POST refresh ao abrir + nunca "faltam 0" (5429af97)
- [x] 3 evolução do mês só com sessão concluída (8e306fbd)
- [x] 4 ritmo somado só com tempo das séries com distância (5752b26d)
- [x] 5 prazo: passado → 400; só data = fim do dia no fuso (service, REST e MCP)
- [ ] 5/6 notas em REDESIGN_PROGRESS "Pendências da #382" (apagar só arquivada = regra de UI; água/passos retroativos)
- [ ] 7 checagens finais e apagar este HANDOFF no último commit

Ambiente: o worktree resolvia `@prisma/client` no checkout principal (que já tem o schema da #381,
`WorkoutPlan.fromSessionId`). Copiei `node_modules/@prisma` para o worktree e rodei `prisma generate`
em `packages/db` — o cliente agora fica em `node_modules/.prisma` do worktree.
