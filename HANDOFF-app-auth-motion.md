# HANDOFF app-auth-motion — rodada de correções da revisão

Branch feat/app-auth-motion. Lista do coordenador (itens 1–10 + fim). Cada correção: test(...) vermelho, depois fix(...).
Testes API: DATABASE_URL=postgresql://fatia:fatia_dev@localhost:5432/fatia_tauth (rodar `prisma generate` no worktree).

## Feito

1 troca de e-mail amarrada (ec4610dd), 2 emailChangedAt/iat, 3 unicidade + revert Logto, 9 emailChangeEnabled,
signOut limpa cache, 6 nome provisório (83353ed7), 4 join (659cbb41), 5 virada (540f8f39), 7+8 (a747a31d).

## Próximo

merge main, testes, emulador (10 feito: 3d2015a0 webview, bae47abf vídeo, e204402f barra, 78e31638 chat)
