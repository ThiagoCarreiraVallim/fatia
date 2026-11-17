# HANDOFF #380 final (merge da #382 + hooks + passe visual)

## Checklist

- [x] 1. Merge origin/main (c494fcd4) na redesign/380-circuitos — commit acdf4aa6
- [x] 2. Hooks WORKOUT_FINISHED_HOOKS no fim/log do circuito (vermelho: 3 falhas "Received array: []")
- [x] 3. lint ok, typecheck ok; api 3056/193 suites (community-panel flaky, passa sozinho 12/12), api-client 883, design 228, web 935, mobile 497
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

## Passe visual (em andamento)

- Checkout principal agora em redesign/380-circuitos; migration aplicada no dev; pnpm install --offline (api-client -> @fatia/design); next.config.ts tocado para o Next recarregar.
- Pranchas copiadas para .canvas/project (T22, T4, T4b, T4c, T4d, T4e). Render com clique: scratchpad/render-board-click.mjs "Al-T6-Planos@Circuitos" <nome>
- Dados demo criados (pela tela Novo circuito, script scratchpad/mk-circuits.mjs): AMRAP 12 (213b4565), Tabata de core (4de50725), EMOM 10 (feb87c5c), For Time 3 (d1598fe5).
- Achado: chips do card de circuito cortam em 2 palavras e 3 + "N mais"; a prancha mostra todos com nome inteiro (C() no x-dc).
- Plano: For Time 3 de ponta a ponta (única sessão real); AMRAP/EMOM/Tabata rodando na web por mock de rota.

## Próximo passo

Passe visual. As pranchas T22/T4/T4b/T4c/T4d/T4e não estavam em .canvas/project; copiadas de
/tmp/claude-1000/-home-thiago-Documentos-pessoal-fatia/0bd027d0-f0c2-42a3-b37f-2f6dd993fad5/scratchpad/artifact-files/80eb4942-0fa7-48ac-acc0-5067fbe6e8b2/project.
Checkout principal: `git -C .claude/worktrees/380-circuitos checkout --detach` e `git checkout redesign/380-circuitos` na raiz; migrate deploy no banco dev; touch apps/api/src/main.ts; Metro -c.
