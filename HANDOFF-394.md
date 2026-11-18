# HANDOFF #394 — merge da #393 e passada visual

Worktree `.claude/worktrees/394-mural`, branch `redesign/394-mural`. Banco de teste `fatia_t394`
(env no scratchpad `t394.env`; recriado do zero depois do merge).

## Passos

- [x] 1. Merge de `origin/redesign/393-comunidades` (feedSeenAt duplicado: fica o da #393 no
      schema; a migration da #394 usa `ADD COLUMN IF NOT EXISTS`). Números MCP: 160 tools,
      149,1 k, 125,1 k, 8.821, SHA_ENTIDADE 31eb2d59…
- [x] 2. Lint, typecheck e todas as suítes (api no fatia_t394, api-client, web, mobile)
- [ ] 3. Passada visual no checkout principal (worktree em detach; main checkout na branch).
      Prints em `~/.cache/fatia-vis/394/cmp-*.png`, contagens em `demo-rows.txt`.
- [ ] 4. Voltar o checkout principal para a main, reanexar o worktree, apagar este HANDOFF.

## Próximo passo

Passo 3 (passada visual).
