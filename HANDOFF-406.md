# HANDOFF #406 — Painel: editor de plano de treino

Branch `redesign/406-editor-plano` (de `origin/main` e0a6930b). Retomar: ler isto e `git log`.

## Desenho (decidido)

- **Sessão do plano = um `WorkoutPlan` na conta do aluno** (`WorkoutPlan.sessionIndex`), como a
  issue permite ("sessionId ou sessionIndex"). A sessão de treino, "previous", PR e volume continuam
  por plano/exercício; o app do aluno não muda. O `@@unique([planId, exerciseId])` fica (mesmo
  exercício em sessões diferentes já não colide; repetir dentro da mesma sessão → #418).
- **Snapshot v2** (`version: 2`): `{ name, schedule?, sessions: [{ name, weekday?, items: [exercício |
circuito] }] }`. v1 continua legível (normalizado para v2 numa sessão). `buildPlanSnapshot` (do plano
  do autor) segue v1.
- **Circuito como bloco** (`type: 'circuit'`): AMRAP, EMOM, TABATA, FOR_TIME, ROUNDS (superset = Rounds
  com 2–3 itens). Sessão só com um circuito de formato com timer vira plano `CIRCUIT` (CircuitConfig, o
  timer da #380; ROUNDS vira FOR_TIME). Circuito no meio de sessão de séries vira `WorkoutPlanCircuit` +
  `circuitId` nos exercícios (sem timer; fica para #418).
- **Campos novos na linha**: `warmupBefore`, `loadPercent` (+ `PERCENT_1RM`, `BAND` em PlanLoadMode),
  `MAX`/`METERS` em PlanRepUnit; cardio `CALORIES` (+ `cardioCalories`), `cardioInclinePercent`,
  `cardioZone` (1–5), `cardioPaceSecondsPerKm`, `cardioRpe`. Faixa = `targetReps` "6-8" (já existe).
- **Template**: `tags String[]`, `schedule PlanSchedule?`, `startDate`/`endDate` (YYYY-MM-DD).
- **Cópia do aluno** = a oferta (`PlanOffer`). Salvar = versão nova (fluxo de versão #379/#405), com
  `changeNote` e `PlanOfferVersion.authorId` (quem editou). Exige vínculo ativo + `member.plans` +
  Treino; leitura e escrita gravam `ProfessionalAccessLog`. Sessões feitas nunca são apagadas.
- `% 1RM`: o aluno vê o kg do 1RM estimado; sem 1RM, "sem 1RM".

## Passos

- [ ] schema + migração `20261120500000_workout_plan_editor`
- [ ] snapshot v2 + materializador (N planos por oferta) + agenda/aceite/settle
- [ ] content (template) com documento do editor; rota da cópia do aluno
- [ ] MCP + docs/MCP_TOOL_SURFACE.md
- [ ] api-client
- [ ] web: editor (Pn-09..09e)
- [ ] passada visual, REDESIGN_PROGRESS, merge main

## Estado

(início)
