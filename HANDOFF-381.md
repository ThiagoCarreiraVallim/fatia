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

- [ ] `helpers/session-kind.ts`: tipo derivado (plan | circuit | free); circuito é ponto de extensão da #380
- [ ] `GET /workout/sessions?kind=` e `kind` em cada sessão da lista
- [ ] `GET /workout/history` com totais (sessões, média, volume) + itens resumidos + filtro por tipo
- [ ] Resumo (`sessions/:id/summary`): `kind`, séries por exercício, kcal, recorde com o valor de antes
- [ ] `POST /workout/sessions/:id/plan` (salvar como plano; cardio vira meta de cardio)
- [ ] `GET /workout/records`: recorde de distância do cardio somado por sessão
- [ ] MCP: `save_session_as_plan`, `list_workout_sessions` com tipo e sensação, doc do `start_workout_session`
- [ ] `user-isolation.spec.ts`

### api-client

- [ ] tipos e chamadas; textos do histórico e do detalhe; rotas novas no mapa

### Web / App

- [ ] `/workout/free` (Al-T17b), Livre e Só cardio levam a ela
- [ ] `/workout/history` (Al-T10)
- [ ] `/workout/history/[id]` (Al-T11, Al-T11b; Al-T11c só ponto de extensão)

### Docs

- [ ] REDESIGN_PROGRESS (decisões do dono #381 + pendências), MCP_TOOL_SURFACE

## Decisões

- Cardio = `muscleGroup === 'cardio'` (regra existente, sem campo novo). Dono.
- "Salvar como plano" de cardio grava distância/tempo observados como meta de cardio (#378). Dono.
- Sem migration: tipo derivado de `planId`; plano criado da sessão é um plano comum (export/exclusão já cobrem).

## Próximo passo

Começar pela API (session-kind).
