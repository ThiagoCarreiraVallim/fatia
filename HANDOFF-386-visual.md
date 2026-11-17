# HANDOFF #386 visual

## Etapa 1: merge de main (worktree)

- [x] git merge origin/main; conflitos: user-isolation.spec.ts (imports dos dois), api-client index (exports dos dois), REDESIGN_PROGRESS (tabela e blocos dos dois)
- [x] migration renomeada: 20261116060000 -> 20261117100000_pro_trial_reminders_community
- [x] pnpm install, lint, typecheck ok; prisma migrate diff sem diferença; api 3206 (1 falha de carga no challenge.integration, passa sozinho 13/13), api-client 951, web 951 (129 arquivos), mobile 502, site check 0 erros + build ok
- [x] commit do merge (antes dos testes; correções vão em commits seguintes)

## Etapa 2: passada visual (checkout principal)

- [ ] estado original do demo registrado
- [x] merge commitado; checkout principal em redesign/386-plano; migration aplicada no banco dev
- [x] pranchas copiadas do .canvas do worktree para .canvas/project (faltavam as 10); renders em ~/.cache/fatia-vis/386/board
- Estado original do demo em ~/.cache/fatia-vis/386/demo-original-state.txt:
  sem UserSubscription, proTrialStartedAt nulo, OWNER do grupo "Fatia" (sem pool), fora da academia-demo;
  pool da academia-demo: SEATS, 3 assentos, ACTIVE, sem programName, currentPeriodEnd 2026-12-05 03:00; BillingReminder vazio.
  Para restaurar: apagar UserSubscription do demo, proTrialStartedAt=null, apagar membership MEMBER do demo na academia-demo (se criada),
  pool academia-demo mode=SEATS programName=null currentPeriodEnd='2026-12-05 03:00', apagar BillingReminder e InboxNotice BILLING criados.
