# HANDOFF #388 passada visual

- Branch redesign/388-conectar-ia no checkout principal (worktree em detach).
- Passo 1: setup (migration, metro) — em andamento
- Setup feito (migration aplicada, metro reiniciado com -c). Pranchas em ~/.cache/fatia-vis/388/board.
- DADO DEMO CRIADO (apagar no fim): McpOAuthClient id=vis388-client (clientId vis388_chatgpt, "ChatGPT"); McpOAuthConnection id=vis388-conn.
  Apagar: docker exec fatia-postgres psql -U fatia -d fatia -c "delete from \"McpOAuthConnection\" where id='vis388-conn'; delete from \"McpOAuthClient\" where id='vis388-client';"
- Diferenças achadas: cartão do teste em surface-3 (prancha s2=muted); b2/b3 tamanhos (13/12, faint); h1 peso 700; padding dos cartões 16/18; botão secundário invisível dentro do cartão na web; URL sem mono no app; borda do passo aberto desloca o conteúdo no app.
- Correções aplicadas em web e app (wip commitado); falta: recapturar app (Expo Go reiniciado), montar cmp, testes, lint, apagar demo.
