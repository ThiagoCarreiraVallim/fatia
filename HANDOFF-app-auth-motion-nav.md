# HANDOFF — fork nav (itens 4, 5, 6)

Branch `feat/app-auth-motion-nav`, worktree `.claude/worktrees/app-auth-motion-nav`.

## Estado

- Feito e commitado: lógica pura + testes; barra que some (Screen com Animated.ScrollView +
  `useChromeScrollHandler`); pílula líquida e Você com avatar; menu da IA com mola única + Pan/Tap
  no notch; `Tabs` no lugar do Slot (abas montadas, detalhe desmonta, transição shift 180 ms);
  prefetch das abas; providers memorizados; skeletons; metro ancorado no workspaceRoot.
- Validado no emulador: barra some/volta (Você), pílula, menu abre pelo botão.
- Metro do fork: porta 8083 (`script -qfc "npx expo start --port 8083 --lan"`).
- Login no Expo Go é compartilhado entre Metros e cai às vezes (rotação de refresh token);
  `scratchpad/login-nav.sh` loga de novo.

## Próximo passo

- Validar arrasto do menu (sess3.sh), troca de abas (gravar), skeleton; rodar lint/typecheck/testes.
