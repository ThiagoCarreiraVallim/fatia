# HANDOFF #384 visual

## Etapa 1 (merge de main, no worktree .claude/worktrees/384-chat)

- [x] merge origin/main: conflitos em account.service(.spec).ts (aiConsents + mcpConnections juntos) e REDESIGN_PROGRESS (tabela única + blocos #384, #386, #388)
- [x] migrations renomeadas: 20261117022522 -> 20261117110000_ai_consent_and_web_search, 20261117030000 -> 20261117110100_chat_photos_in_media_file
- [x] envs: todas já em compose e .env.example
- [x] números MCP: specs passam sem mudança (136 testes)
- [x] lint 7/7, typecheck 11/11; api 3363 (14 em history-review e meal-photo falharam sob carga, passam sozinhas 21/21), api-client 993, web 999, mobile 522, agent pytest 575 (+2 skip), ruff/mypy ok
- [x] commit do merge a23df1bb

## Etapa 2 (passada visual, checkout principal)

- [x] checkout principal em redesign/384-chat; banco dev: a 20261117110100 falhou (colunas já vinham da 20261105120000 antiga do backup) -> resolve --applied (diff só mostra tabelas órfãs Attachment/MessageFeedback do backup)
- [x] demo PRO: UserSubscription id=vis384-sub (apagar no fim). Estado original em ~/.cache/fatia-vis/384/demo-rows.txt
- [x] conversas de demo: ~/.cache/fatia-vis/384/tools/seed.py -> seed.sql; apagar com tools/reset.sql (ids c3840000-/c3841000-)
- [x] pranchas em ~/.cache/fatia-vis/384/board (*.fim.png = estado final das animadas; *.wide.png = IA-Cartoes/IA-Estados a 1700px)
- [ ] capturas web/app e cmp-<prancha>.png
- [x] web: commits 03dfae94 (prévia sem markdown), 7a574d85 e seguinte (cartões, linhas, campo, aceites)
- [ ] app: título da conversa no topo, sem "Fatia", texto antes das linhas, linha em pílula, pendente sem linha, Gravar claro/Ajustar cinza, pergunta azul + Responder, pausa, aceites lime/cinza lado a lado, primeira fala grande, composer, curva com 3 datas, meta 1.700–1.900, Só no app, lista de conversas (Conversas, sem cartão, estado, prévia)
- [ ] correções
- AiConsent criado ao clicar Concordo: apagar no fim (where userId=demo)
