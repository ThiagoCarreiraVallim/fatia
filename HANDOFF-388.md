# HANDOFF #388 — correções da revisão adversarial (sobre 5cd72f17)

Branch `redesign/388-conectar-ia`, worktree `.claude/worktrees/388-conectar-ia`. Sem push, sem PR.

## Comandos

```bash
export DATABASE_URL=$(grep "^DATABASE_URL" ../../../.env | cut -d= -f2- | sed -E 's#/fatia(\?|$)#/fatia_t388\1#')
(cd packages/db && npx prisma migrate deploy)   # migration própria editada: ver abaixo
(cd apps/api && npx jest src/auth src/common src/mcp/__tests__/mcp-controller-touch.spec.ts)
```

Migration `20261117000000_mcp_oauth_connections` é editada (não mergeada): no fatia_t388, apagar a
linha dela em `_prisma_migrations` e as tabelas antes do `migrate deploy`.

## Checklist

- [x] 1. Logto fora do ar não vira `invalid_grant` (server_error / temporarily_unavailable)
- [x] 3. Gravar a conexão não atrasa o `/oauth/token` (fire-and-forget, `flush()` para testes)
- [x] 4/5. Conexão presa aos tokens: hash do refresh, vários access tokens com validade, `client_id` do corpo não manda
- [x] 2. "Conectado" só nos últimos 30 dias; teste e "Não funcionou?" sempre acessíveis
- [x] 6. `?tutorial=` marca visto e some da URL ao fechar; clipboard do app com falha; MOBILE_PARITY.md
- [ ] Docs (REDESIGN_PROGRESS, MCP_OAUTH), lint, typecheck, testes; HANDOFF apagado

## Próximo passo

Docs (REDESIGN_PROGRESS #388, MCP_OAUTH), depois lint, typecheck e testes completos (api em fatia_t388, api-client, web, mobile).

## Decisões (itens 3 e 4/5)

- `McpOAuthConnectionToken` (kind access|refresh, hash único, expiresAt). Migration própria editada; `accessTokenHash` saiu.
- Conexão só nasce na troca do code (cliente da autorização). Refresh acha a conexão pelo hash do refresh apresentado, confere o `sub` do token novo, soma tokens e apaga o refresh velho na rotação. `client_id` do corpo só vai para o log.
- Recorder: `recordExchange`/`recordRefresh` devolvem void (sem await no facade); `flush()` para testes.
- Conexões antigas (sem tokens na tabela) voltam a renovar só depois de reconectar.
