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

- [x] schema + migração `20261120500000_workout_plan_editor`
- [x] snapshot v2 + materializador (N planos por oferta) + agenda/aceite/settle
- [x] content (template) com documento do editor; rota da cópia do aluno
- [x] MCP + docs/MCP_TOOL_SURFACE.md
- [x] api-client (plan-editor.ts: tipos, planCopyApi, textos e conferências)
- [x] web: editor (Pn-09..09e) — ee3058e7 (components/org/plan-editor, página da cópia, link na ficha)
- [ ] passada visual, REDESIGN_PROGRESS, merge main

## Estado

- API: plan-snapshot-v2.ts, plan-document.ts, plan-materializer (N planos), plan-offer
  (aceite/settle multi-sessão, writeTeamVersion), plan-offer-diff (v2), content.service
  (document/tags/schedule/datas), PlanCopyService + rotas
  `groups/:g/members/:m/plan-offers/:o/copy` (GET/PUT).
- RED-FIRST feito (test 0f2be0f8 vermelho → feat). Stubs removidos.
- Banco de teste: `bash ~/.cache/fatia-vis/406/resetdb.sh`; jest com
  `DATABASE_URL=$(cat ~/.cache/fatia-vis/406/tdb.url) npx jest <spec> --maxWorkers=4`.
- Feito (API): consumidores multi-plano (offerProgress com planIds, ficha, enviados, agenda com
  rodízio no flexível e remarcar por qualquer sessão), percentLoadKg na sessão, campos novos no DTO
  do plano da pessoa (+ regras: calorias, uma intensidade, loadPercent só em PERCENT_1RM).
- Pendentes: passada visual (vis.env, portas livres, demo-rows antes/depois), REDESIGN_PROGRESS, merge main.
