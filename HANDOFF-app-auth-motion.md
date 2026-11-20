# HANDOFF app-auth-motion — rodada de correções da revisão

Branch feat/app-auth-motion. Lista do coordenador (itens 1–10 + fim). Cada correção: test(...) vermelho, depois fix(...).
Testes API: DATABASE_URL=postgresql://fatia:fatia_dev@localhost:5432/fatia_tauth (rodar `prisma generate` no worktree).

## Feito

1 troca de e-mail amarrada (ec4610dd), 2 emailChangedAt/iat, 3 unicidade + revert Logto, 9 emailChangeEnabled,
signOut limpa cache, 6 nome provisório (83353ed7; app pede nome no composer e na entrada do desafio).

## Próximo

4 join, 5 virada do dia, 7 rascunho, 8 id inválido, 10 suspeitos (webview, vídeo expirado, barra, chat key); depois merge main, testes, emulador
