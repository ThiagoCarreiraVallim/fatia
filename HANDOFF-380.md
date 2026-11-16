# HANDOFF #380 — circuitos (AMRAP, EMOM, Tabata, For Time)

Worktree: `.claude/worktrees/380-circuitos`, branch `redesign/380-circuitos`. Sem push, sem PR.

## Pranchas
Baixadas do artifact `GvL8GtYkJGjK5e4YovhZ3o` para
`/tmp/claude-1000/-home-thiago-Documentos-pessoal-fatia/0bd027d0-f0c2-42a3-b37f-2f6dd993fad5/scratchpad/artifact-files/80eb4942-0fa7-48ac-acc0-5067fbe6e8b2/project/`
(Al-T22, Al-T4, Al-T4b, Al-T4c, Al-T4d, Al-T4e, Al-T1, Al-T11c). Al-T6 está em `../../../.canvas/project/` (só leitura).
Se sumirem: `Artifact read` com `paths: ["project/<Prancha>.dc.html"]`.

## Desenho (decidido)
- Banco (migration aditiva, timestamp >= 2h depois de `20261116020000`): `WorkoutPlanKind {STRENGTH, CIRCUIT}`,
  `WorkoutPlan.kind @default(STRENGTH)`; `CircuitFormat {AMRAP, EMOM, TABATA, FOR_TIME}`; modelo `CircuitConfig`
  1:1 com o plano (format, durationSeconds, workSeconds, restSeconds, intervals, rounds, restBetweenRoundsSeconds).
  Itens do circuito = `WorkoutPlanExercise` com `repUnit` (REPS/SECONDS) e `targetReps` = número; `targetSets` 1.
  `WorkoutSession.circuit Json?` versionado (v1): snapshot (formato, nome, config, exercícios) + `events` (progresso,
  para retomar) + `result` (no fim).
- Timer: funções puras em `packages/api-client/src/workout/circuit-timer.ts`, por eventos com timestamp
  (mark, round+, round-, skip, pause, resume) e `now`. Nada conta ticks.
- Sessão: "Começar" abre `WorkoutSession` com o plano (mesma regra de uma aberta). Cada toque grava o progresso
  (`PUT /workout/sessions/:id/circuit`, eventos). "Encerrar" → `POST /workout/sessions/:id/circuit/finish` com o
  resultado; o servidor grava `result`, cria `SessionSet` (uma por exercício por round/intervalo) e fecha a sessão.
- MCP: `create_workout_plan` aceita `circuit`; `log_circuit_result` registra um circuito feito; `get_workout_session`
  devolve `circuit`.

## Checklist
- [ ] schema + migration
- [ ] API: plano circuito (CRUD), sessão circuito (progresso, finish), comparação com a última, snapshot/modelos
- [ ] isolamento (`user-isolation.spec.ts`), export/exclusão LGPD, leitura da equipe
- [ ] MCP + docs/MCP_TOOL_SURFACE.md + docs/MCP.md + fingerprint
- [ ] api-client: timer puro + testes; cliente HTTP; copy
- [ ] web: T22, T4, T4b/T4d, T4c/T4e, aba Circuitos no T6, "Circuito" no T1, fim → T5
- [ ] app: idem + keep-awake, som/vibração com fallback
- [ ] REDESIGN_PROGRESS (decisões do dono #380, pendências)
- [ ] lint, typecheck, testes api/api-client/web/mobile

## Comandos
- DB de teste: ver seção abaixo quando montado.

## Próximo passo
Schema + migration.
