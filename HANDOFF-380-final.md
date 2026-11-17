# HANDOFF #380 final (merge da #382 + hooks + passe visual)

## Checklist

- [x] 1. Merge origin/main (c494fcd4) na redesign/380-circuitos — commit acdf4aa6
- [x] 2. Hooks WORKOUT_FINISHED_HOOKS no fim/log do circuito (vermelho: 3 falhas "Received array: []")
- [ ] 3. lint, typecheck, testes (api em fatia_t380)
- [ ] 4. Passe visual (T22, T4, T4b/T4d, T4c/T4e, T6, T11c, Al-T10)
- [ ] 5. Commit final no checkout principal, sem este HANDOFF

## Arquivos tocados

- merge: superficie.spec.ts (SHA_ENTIDADE regerado), tool-catalog.spec.ts, docs/MCP.md, MCP_TOOL_SURFACE.md, README, ARCHITECTURE, SUBMISSION_CHECKLIST, site claude-connect.astro (153 -> 154), REDESIGN_PROGRESS (os dois lados; linha #380 na tabela da etapa 5)
- hooks: apps/api/src/workout/workout-finished.hook.ts (runWorkoutFinishedHooks), circuit-session.service.ts, workout-session.service.ts, **tests**/circuit-achievements.integration.spec.ts

## Decisões

- MCP: 154 tools no braço A; payload 143,1 k / 119,9 k.
- Ganchos só quando o circuito fecha de fato (não no alreadyFinished), depois da transação.
- Sequência e constância já contavam o circuito (só olham completedAt); teste acrescentado.

## Comandos que funcionam

- DB de teste: `export DATABASE_URL=$(grep ^DATABASE_URL /home/thiago/Documentos/pessoal/fatia/.env | cut -d= -f2- | sed -E 's#/fatia(\?|$)#/fatia_t380\1#')`
- `cd apps/api && npx jest <arquivo>`

## Próximo passo

Rodar pnpm lint, pnpm typecheck e os testes de cada pacote.
