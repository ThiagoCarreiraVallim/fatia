# HANDOFF #410 — correções do review do PR #469

Worktree `.claude/worktrees/w410`, branch `redesign/410-boas-vindas` (PR #469, base 06c3a6a2).
Banco de teste: `fatia_t410b` (criado, migrado, seeds). Apagar no fim.
Spec de prova do revisor: scratchpad `specs/rev469-welcome.integration.spec.ts` (casos portados para `welcome-pages.integration.spec.ts`).

- [ ] F1 PUTs concorrentes → 500 (P2002): transação interativa com `SELECT … FOR UPDATE` no Group
- [ ] F2 contagem por grafema (Intl.Segmenter) na API e no api-client; CHECK do banco vira teto (texto 2000, título 600); API recusa acima do teto
- [ ] F3 `avatarUrl` no preview do convite e na capa do onboarding (web e app)
- [ ] F4 tirar NUL e controles C0 (menos \n) de título e texto
- [ ] extra: etapa community sem páginas avança em vez de tela vazia (web e app)
- [ ] REDESIGN_PROGRESS, testes completos, push, relatório
