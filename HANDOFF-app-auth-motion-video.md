# HANDOFF — fork video (item 8)

Branch `feat/app-auth-motion-video`, mergeada depois em `feat/app-auth-motion`.

## Estado

- Teste vermelho `packages/api-client/src/__tests__/exercise-video.test.ts` (lógica pura + rota).

## Plano

1. `packages/api-client/src/exercise-video.ts` + rota `/workout/exercise/:id` em navigation (FOCUS_ROUTES, hasTopBar, ROUTES).
2. Instalar `react-native-webview` 13.16.1 e `expo-video` ~57.0.2 (estão no bundledNativeModules do SDK 57).
3. `ExerciseVideoHero` (topo sangrando, gradiente svg), player YouTube nocookie em WebView, expo-video para a comunidade, fallback navegador.
4. Rota `app/(app)/workout/exercise/[id].tsx` (Al-T9); `useOpenExerciseDetail` navega; tirar `ExerciseDetailHost` dos 4 lugares + comunidade.
5. Sessão: antes de abrir, `requestFocus(exerciseId)` para voltar no mesmo exercício.
6. Emulador (Metro 8084), prints em ~/.cache/fatia-vis/app-auth-motion/video/.
