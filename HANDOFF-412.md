# HANDOFF #412 — comunidade de demonstração e primeiros passos

- Branch: `redesign/412-demo` (de origin/main d627faac)
- Portas: API 3112, web 3142
- Banco: `fatia_t412` (descartável; DROP DATABASE fatia_t412 no fim)
- Pranchas: copiadas do artifact para `.canvas/project/` local (Pn-21*); render desktop em ~/.cache/fatia-vis/412/board
- Prints: ~/.cache/fatia-vis/412/{board,web,app}

## Decisões

- Demo = Group `isDemo` + `demoOwnerId`; Ana = User com `demoGroupId` (logtoSub `demo|uuid`, e-mail `.invalid`).
- Fora de listMine, preview/slug/código, listStudents, templates, relatórios, push/e-mail; 9 ações bloqueadas na demo (`DEMO_BLOCKED_ACTIONS`) em 4 portas (guard, requireContentRole, assertAction, assertCan).
- Sessão de demo: token `fatia_demo_…` 30 min, só rotas `@DemoReadable`, só GET. Web: `/demo/<token>` via proxy `/api/demo/*`; app: `app/demo/[token].tsx` direto na API.
- Comunidade ativa = `isCommunityActive(n membros ativos)` (só ela; #372 troca).
- Pn-21b: 4º cartão é Água (sem modelo de hábitos, #390); Avaliação mostra só peso (#383).
- Exclusão de conta: purge de treino próprio antes (bug RESTRICT anterior à #412).
- App: seção `demo` fica em MOBILE_MISSING_SECTIONS (criar/apagar/QR na web; painel no celular é #414).

## Checklist

- [x] API + exclusões + LGPD + testes (vermelhos guardados no scratchpad)
- [x] api-client (demoApi, textos, rodapé/migalha, helpers da sessão)
- [x] web painel, faixa, Configurações, Hoje da Ana
- [x] app demo/[token] + pathPrefix /demo/
- [ ] docs (PERMISSIONS, DATA_RETENTION, MOBILE_PARITY, REDESIGN_PROGRESS)
- [ ] passada visual (board | web | app)
- [ ] lint/typecheck/testes de tudo, PR, CI, apagar HANDOFF, DROP DATABASE fatia_t412

## Estado atual

Código pronto (commit d7ccc839). Falta docs, prints, PR.

## Pausa (2026-11-25)

Pausado a pedido do usuário logo depois do commit dcc48fbf (docs). Árvore limpa. Branch `worktree-agent-a9b837780734dde27` (o nome da branch no worktree; renomear para `redesign/412-demo` ao abrir o PR). O banco `fatia_t412` continua existindo. A API da porta 3112 foi parada. A trava do emulador não estava pega.
Falta: rever o que os commits wip cobrem contra o checklist acima, rodar as suítes completas, lint e typecheck, fazer a passada visual (prancha | web | app em ~/.cache/fatia-vis/412/), abrir o PR e esperar o CI.
