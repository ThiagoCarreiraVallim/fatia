# HANDOFF #384 visual

## Etapa 1 (merge de main, no worktree .claude/worktrees/384-chat)

- [x] merge origin/main: conflitos em account.service(.spec).ts (aiConsents + mcpConnections juntos) e REDESIGN_PROGRESS (tabela única + blocos #384, #386, #388)
- [x] migrations renomeadas: 20261117022522 -> 20261117110000_ai_consent_and_web_search, 20261117030000 -> 20261117110100_chat_photos_in_media_file
- [x] envs: todas já em compose e .env.example
- [x] números MCP: specs passam sem mudança (136 testes)
- [x] lint 7/7, typecheck 11/11; api 3363 (14 em history-review e meal-photo falharam sob carga, passam sozinhas 21/21), api-client 993, web 999, mobile 522, agent pytest 575 (+2 skip), ruff/mypy ok
- [x] commit do merge a23df1bb

## Etapa 2 (passada visual, checkout principal)

- [ ] ainda não começada
