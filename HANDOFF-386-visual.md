# HANDOFF #386 visual

## Etapa 1: merge de main (worktree)

- [x] git merge origin/main; conflitos: user-isolation.spec.ts (imports dos dois), api-client index (exports dos dois), REDESIGN_PROGRESS (tabela e blocos dos dois)
- [x] migration renomeada: 20261116060000 -> 20261117100000_pro_trial_reminders_community
- [x] pnpm install, lint, typecheck ok; prisma migrate diff sem diferença; api 3206 (1 falha de carga no challenge.integration, passa sozinho 13/13), api-client 951, web 951 (129 arquivos), mobile 502, site check 0 erros + build ok
- [x] commit do merge (antes dos testes; correções vão em commits seguintes)

## Etapa 2: passada visual (checkout principal)

- [ ] estado original do demo registrado
