# HANDOFF #472 (frente B, PR 2)

- Branch: `feat/472-notificacao-treino`, criada SOBRE `fix/471-sessao-treino` (PR #491 ainda não mergeado).
- Portas: API 3115, web 3145. Banco `fatia_t471`. Trava: frente-B (liberada).
- PR 1: https://github.com/ThiagoCarreiraVallim/fatia/pull/491

## Decisões

- Android: o módulo nativo `modules/rest-countdown` vira a notificação do treino (mesmo id 4210): título com exercício e série, meta, cronômetro do descanso e ações (até 3 botões no Android): descansando = −15 s, +15 s, Pular; trabalhando = Registrar série.
- As ações vão por BroadcastReceiver -> evento `onAction` para o JS (app vivo, inclusive em segundo plano). Com o processo morto: guarda em SharedPreferences, e o JS aplica ao abrir (`consumePendingActions`), se ainda valer.
- Idempotência: clientKey determinística `ntf:<exerciseId>:<setNumber>` + checagem de que o número da série ainda é o próximo (senão ignora: "stale").
- Prefill: `predictedSet` = rascunho da série (`restoreSetDraft`) ou `prefillForNextSet` com a última série/prescrição do cache.
- iOS: categoria do expo-notifications no aviso do fim do descanso ("Registrar série", em segundo plano). Live Activity é follow-up.
- Expo Go: o módulo é null; segue o aviso atual.

## Checklist

- [ ] docs/NOTIFICACAO_TREINO.md (proposta)
- [ ] lógica pura + testes (vermelho -> verde)
- [ ] Kotlin + index.ts
- [ ] controlador JS
- [ ] compilar o módulo (gradle)
- [ ] lint/typecheck/test, PR

## Estado

Começando.
