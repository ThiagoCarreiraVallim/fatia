# HANDOFF — fork video (item 8)

Branch `feat/app-auth-motion-video`, mergeada depois em `feat/app-auth-motion`.

## Feito (commitado)

- api-client `exercise-video.ts` (fonte do vídeo, embed nocookie, guarda de navegação, capa 16:9,
  meta, rota) + rota `/workout/exercise/:id` (foco, sem top bar) em navigation.
- `react-native-webview` 13.16.1 e `expo-video` 57.0.5 (bundledNativeModules SDK 57).
- `exercise-video-player.tsx`, `exercise-media.tsx` (hero sangrado + HeroFade), `exercise-how-to.tsx`
  (ex-drawer, tela), rota `app/(app)/workout/exercise/[id].tsx`, sessão com header sobre o vídeo e
  pedido de foco antes de abrir o Como fazer; host removido dos 4 lugares + guia da comunidade.
- metro.config: blockList ancorado na raiz (Metro rodava quebrado dentro de .claude/worktrees).

## Validação

- T9 com vídeo: print ok, vídeo toca na WebView (Scott Herman, rT7DgCr-3pg; exercício custom 1878 demo
  e 1879 equipe, criados pela API).
- Pendente: sessão (T3) → Como fazer → voltar (script /tmp/claude-1000/video-fork/all.sh).

## Próximo passo

Rodar o script, comparar prints, apagar este HANDOFF no último commit, devolver relatório.
