# HANDOFF #381 — Treino livre e histórico

Branch `redesign/381-treino-livre-historico`, worktree `.claude/worktrees/381-treino-livre-historico`.
Não fazer push nem PR.

## Como rodar

- `.env` do worktree (fora do git) = `.env` do checkout principal com o banco trocado para
  `fatia_t381` (já migrado e semeado: `pnpm db:migrate:deploy`, `pnpm db:seed:taco`, `pnpm db:seed:exercises`).
- Testes da API: `cd apps/api && set -a && . ../../.env && set +a && npx jest <arquivo>`.
- Pranchas baixadas em `/home/thiago/Documentos/pessoal/fatia/.canvas/project/` (Al-T17b, Al-T10, Al-T11, Al-T11b, Al-T11c).

## Plano (marcar ao concluir)

### API

- [x] `helpers/session-kind.ts`: tipo derivado (plan | circuit | free); circuito é ponto de extensão da #380
- [x] `GET /workout/sessions?kind=` e `kind` em cada sessão da lista
- [x] `GET /workout/history` com totais (sessões, média, volume) + itens resumidos + filtro por tipo
- [x] Resumo (`sessions/:id/summary`): `kind`, séries por exercício, kcal, recorde com o valor de antes
- [x] `POST /workout/sessions/:id/plan` (salvar como plano; cardio vira meta de cardio)
- [x] `GET /workout/records`: recorde de distância do cardio somado por sessão
- [x] MCP: `save_session_as_plan`, `list_workout_sessions` com tipo e sensação, doc do `start_workout_session`
- [x] `user-isolation.spec.ts`

### api-client

- [x] tipos e chamadas; textos do histórico e do detalhe (`workout/history-copy.ts`); rotas novas no mapa

### Web (commits f15b6e2b, 09a64f67)

- [x] `/workout/free` (Al-T17b), Livre e Só cardio levam a ela (`?add=cardio`)
- [x] `/workout/history` (Al-T10)
- [x] `/workout/history/[id]` (Al-T11, Al-T11b; Al-T11c só ponto de extensão)
- [x] testes (free 5, history 5, detalhe 7); suíte web 911 verde

### App

- [x] `app/(app)/workout/free.tsx` (T17b); WayCards Livre / Só cardio (commit aaba2462)
- [x] `history/index.tsx` (T10, era `history.tsx`) e `history/[id].tsx` (T11/T11b) com volta ao histórico
- [x] `useStartSession` leva `pending`; lógica do treino livre em `addToFreeWorkout`/`freeSuggestions` (api-client, testada)

### Docs

- [x] REDESIGN_PROGRESS (decisões do dono #381 + pendências), MCP_TOOL_SURFACE

## Decisões

- Cardio = `muscleGroup === 'cardio'` (regra existente, sem campo novo). Dono.
- "Salvar como plano" de cardio grava distância/tempo observados como meta de cardio (#378). Dono.
- Sem migration: tipo derivado de `planId`; plano criado da sessão é um plano comum (export/exclusão já cobrem).

## Feito na API (commits defa2fae..fe7c8ccd)

- `helpers/session-kind.ts`, `helpers/plan-from-session.ts`, `session-history.ts` (puros, com spec)
- `WorkoutSessionService.list` (+`kind`, filtro), `.history`; `WorkoutPlanService.createFromSession`
- Resumo: `kind`, `exercises[].setList`, `best.kcalBurned`, `records[].previous`; `orderExercisesLikeSession` exportado
- Recordes: cardio somado por sessão (`listPersonalRecords`)
- Rotas: `GET /workout/history`, `POST /workout/sessions/:id/plan`
- MCP `save_session_as_plan` (152 tools); docs MCP.md/MCP_TOOL_SURFACE e contagens atualizadas; sha da superfície
- Specs: `history.integration.spec.ts`, isolamento, leitura da equipe com `kind`/`feeling`

## Próximo passo

Tudo feito. Checagem final: `pnpm lint` e `pnpm typecheck` verdes; testes api 2930 (182 suítes, banco fatia_t381), api-client 778, web 911, mobile 485.
Falta só a passada visual do dono (sem capturas nesta sessão). Não fazer push nem PR sem o coordenador.
