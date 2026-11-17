# HANDOFF #388 — Conectar sua IA (MCP)

Branch `redesign/388-conectar-ia`, worktree `.claude/worktrees/388-conectar-ia`. Sem push, sem PR.

## Comandos que funcionam

```bash
source <scratchpad>/testenv.sh   # DATABASE_URL com o banco fatia_t388 (ou refaça abaixo)
export DATABASE_URL=$(grep "^DATABASE_URL" ../../../.env | cut -d= -f2- | sed -E 's#/fatia(\?|$)#/fatia_t388\1#')
(cd packages/db && npx prisma migrate deploy)
(cd apps/api && npx jest src/auth src/common/__tests__/user-isolation.spec.ts)
```

Pranchas Al-V6..V6e copiadas para `.canvas/project/` do checkout principal (fora do git).

## Decisões

- Vínculo usuário × cliente: tabela nova `McpOAuthConnection` (userId, clientId, accessTokenHash, lastUsedAt).
  A `McpOAuthAuthorization` é podada 10 min depois (expiresAt), não serve de vínculo durável.
- Serviço dividido: `McpConnectionService` (só banco: link/touch/list/overview, no `McpConnectionsModule`, importado por Auth, Mcp e Users) e `McpConnectionRecorder` (no AuthModule, resolve o dono pelo JWT). Importar o AuthModule no McpModule quebrava os specs do chat (JWKS/guard global).
- Export LGPD ganhou `mcpConnections` (meta-teste do account.service exige).
- Banco de teste precisa de `pnpm seed:taco` e `seed:exercises` (feito no fatia_t388).
- Gravado no `/oauth/token` (code e refresh, com `client_id`), best-effort: falha no vínculo nunca derruba o token.
- "Último acesso": o `/mcp` toca a conexão pelo hash do Bearer (no máximo 1 escrita/min por conexão).
- Endereço: `API_PUBLIC_URL` + `/mcp`, servido pela API em `GET /users/me/mcp-connections` (`serverUrl`). Sem env nova.
- Entrada: Você > IA > Conectar sua IA já existia; web `/profile/connect`, app passa de `/profile/tokens` para `/profile/connect`.

## Checklist

- [x] API: migration `20261117000000_mcp_oauth_connections` + `auth/mcp-connection.service.ts` + `GET /users/me/mcp-connections` (`UsersController`) + toque no `/mcp` (`mcp.controller.ts`); erros do Logto no `/oauth/token` agora saem como `OAuthError` (RFC 6749); `apiPublicUrl` mudou para `common/public-url.ts` (+ `mcpPublicUrl`)
- [x] Isolamento: `user-isolation.spec.ts`, bloco #388 (lista, guard, refresh com client_id alheio, toque)
- [x] api-client: `connect-ai.ts` (provedores, passos, estado, último acesso) + `mcpConnectionsApi`; `tutorialById`; navegação do app → `/profile/connect`
- [x] Web: `components/profile/connect-ai-screen.tsx` em `/profile/connect`; Ajuda abre `?tutorial=`; apagados connect-steps, connect-troubleshooting, copy-line, lib/mcp-url
- [ ] App: tela nova em `/profile/connect`, ajuda abre tutorial por parâmetro
- [ ] Docs: MCP_OAUTH.md, REDESIGN_PROGRESS.md
- [ ] lint, typecheck, testes; HANDOFF apagado no commit final

## Próximo passo

App: tela `apps/mobile/app/(app)/profile/connect.tsx` (réplica da web, expo-clipboard), apagar `tokens.tsx` e `copy-mcp-url.tsx`, `env.mcpUrl`; `go('/profile/tokens')` do ai-menu → `/profile/connect`; Ajuda do app lê `?tutorial=`.
