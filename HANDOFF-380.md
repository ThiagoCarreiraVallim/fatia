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

- [x] schema + migration (`20261116053800_workout_circuits`)
- [x] api-client: `workout/circuit-timer.ts` (18 testes)
- [x] API: `helpers/circuit.ts`, `circuit-session.service.ts`, `WorkoutPlanService.createCircuit/replaceCircuit`,
      rotas `POST/PUT /workout/circuits`, `PUT /workout/sessions/:id/circuit`, `POST .../circuit/finish`,
      `summary().circuit` (testes `circuit.spec.ts`, `circuit.integration.spec.ts`)
- [x] snapshot/modelos/oferta com circuito (plan-snapshot + materializer)
- [x] isolamento (`user-isolation.spec.ts`, 3 testes), export LGPD (`circuit: true`)
- [x] MCP (`create_workout_plan.circuit`, `log_circuit_result`) + docs + fingerprint (SHA novo, 152 tools)
- [x] api-client: `circuit-copy.ts` (13 testes), `workoutApi.createCircuit/updateCircuit/saveCircuitProgress/finishCircuit`,
      rotas em `navigation.ts` (`/workout/circuits/new`, `/workout/circuits/:id`, `/workout/circuit/:id`)
- [x] web: T22 (`components/workout/circuit/circuit-editor.tsx`, `/workout/circuits/new|[id]`), relógio
      (`circuit-run.tsx`, `/workout/circuit/[id]`), aba Circuitos no T6, "Circuito" no T1, T5 com `circuit-result.tsx`,
      barra ativa e `/workout` levando ao relógio. Testes em `components/workout/circuit/__tests__`.
- [x] sessão nasce com `circuit.previous` (última vez) para o selo do T4e
- [x] app: idem + keep-awake, som (`assets/sounds/*.wav` via expo-audio), háptico, avisos agendados no fundo
      (`circuit-alarms.ts` testado, `circuit-feedback.ts`), rota da sessão redireciona circuito aberto
- [x] REDESIGN_PROGRESS (decisões do dono #380, pendências)
- [x] lint, typecheck, testes api (2921) / api-client (799) / web (908) / mobile (489)
- [x] rótulos do cartão de confirmação do chat para os campos novos (`chat/previa/rotulos.ts`)

## Comandos

- DB de teste (já criado e semeado):
  `export DATABASE_URL=$(grep -E "^DATABASE_URL=" /home/thiago/Documentos/pessoal/fatia/.env | cut -d= -f2- | tr -d '"' | sed -E 's#/fatia(\?|$)#/fatia_t380\1#')`
- `cd apps/api && npx jest src/workout/__tests__/circuit` ; `cd packages/api-client && npx vitest run`
- typecheck da api precisa de `pnpm --filter @fatia/design build` (já feito).

## Rodada 2: revisão adversarial + merge da #381

- [x] A merge origin/main (5fff5d31): 153 tools, 84 de escrita, SHA novo, payload regerado
- [x] B1 session-kind circuito + filtro Circuitos
- [x] B2 detalhe do histórico com CircuitResultBlocks (web/app) + Repetir circuito
- [x] B3 log() com fromPlan/planName
- [x] B4 Salvar como plano recusa circuito (400) + esconder botão
- [x] C1 resultado recalculado no servidor / limites sem eventos
- [x] C2 eventos limitados por startedAt
- [ ] C3 finish atômico + exercício pessoal apagado
- [ ] C4 finish genérico não fecha circuito sem resultado; log anexa resultado a sessão fechada sem resultado
- [ ] C5 numeração dos avisos e done sempre
- [ ] C6 corrida no agendamento (app)
- [ ] C7 limite de eventos no finish
- [ ] C8 comparação só com mesma definição
- [ ] C9 apagar este HANDOFF no último commit
- D (conquistas #382) fica para o coordenador.

## Próximo passo

Seguir a lista acima na ordem; um commit por item, teste visto vermelho antes.
