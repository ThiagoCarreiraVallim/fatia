# Notificação do treino (#472)

Proposta e decisão para a notificação fixa e interativa durante o treino, no estilo de player de música.

## O que existia

- **Aviso do fim do descanso** (#182): `rest-notification.ts` e `expo-rest-notifier.ts`. É uma notificação local agendada pelo `expo-notifications` e toca mesmo com o JS parado.
- **Contagem na tela de bloqueio** (só Android): o módulo nativo `modules/rest-countdown` mostra uma notificação ongoing com o cronômetro do sistema, sem botões.
- Nada mostrava o exercício atual, a meta da série ou uma ação.

## O que cada plataforma permite

|                                       | Android                                                                     | iOS                                                                                    | Expo Go                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Notificação fixa (ongoing)            | Sim, `setOngoing`.                                                          | Não existe. O equivalente é a Live Activity, que precisa de extensão de widget nativa. | Android: o `expo-notifications` nem carrega (`notifications/native.ts`). iOS: só a notificação comum. |
| Cronômetro do descanso na notificação | Sim, contado pelo sistema (`setUsesChronometer` com contagem regressiva).   | Só na Live Activity.                                                                   | Não.                                                                                                  |
| Botões de ação                        | Até 3 por notificação, via `PendingIntent`.                                 | Ações de categoria (`setNotificationCategoryAsync`) numa notificação comum.            | Não no Android. No iOS, em teoria.                                                                    |
| Ação com o app em segundo plano       | Sim. O `BroadcastReceiver` entrega o evento ao JS enquanto o processo vive. | Sim. O sistema acorda o app por alguns segundos, se ele não foi encerrado.             | —                                                                                                     |
| Ação com o app encerrado              | O receiver roda, mas não há JS para chamar a API.                           | Não entrega ao JS.                                                                     | —                                                                                                     |

## Decisão

### Android (dev build e loja)

O módulo `rest-countdown` vira a **notificação do treino**. É uma só, no mesmo id, e fica fixa enquanto há treino em andamento:

- **Título:** o exercício atual e a série ("Remada curvada · série 2 de 4").
- **Texto:** a meta da série ("10 reps × 62,5 kg"). Ao descansar, também "Descanso", com o cronômetro do sistema.
- **Ações:** o Android mostra no máximo 3 botões.
  - Descansando: **−15 s**, **+15 s** e **Pular**.
  - Na série: **Registrar 10 × 62,5**.
  - Registrar série durante o descanso ficou de fora. Seria o quarto botão, e quem registra a próxima série no meio do descanso pula o descanso de fato: "Pular" e depois "Registrar".

Os toques vão por um `BroadcastReceiver` e chegam ao JS como o evento `onAction` do módulo. Lá, `resolveWorkoutAction` decide o que fazer, e é a mesma lógica com o app aberto ou em segundo plano:

- **Descanso:** `rest.addTime(±15)` ou `rest.stop()`, no cronômetro global (`RestTimerProvider`).
- **Registrar série:**
  - **Valores:** os previstos pela mesma regra da tela. É o rascunho da série em andamento, se houver (`restoreSetDraft`); se não, `prefillForNextSet` com a série da sessão, a última série anterior e a prescrição do cache.
  - **Idempotente:** a `clientKey` é fixa por exercício e número da série (`ntf:<exercício>:<série>`), então dois toques gravam uma série só (a API deduplica por sessão e chave). E a ação leva o número da série que a notificação mostrava: se a série já foi registrada no app, o toque velho é ignorado.
- **App encerrado:** o receiver guarda o toque de registrar e não faz mais nada. Na próxima abertura, o app aplica o toque (`consumePendingActions`), se a série ainda for a mesma. Toques de descanso são descartados, porque o descanso morreu com o processo. Abrir o app direto pelo receiver é bloqueado no Android 12+ (trampolim de notificação).

O aviso sonoro do fim do descanso continua sendo o do `expo-notifications`. A notificação do treino é silenciosa.

### iOS

- **Ações de categoria** no aviso do fim do descanso: **Registrar série** (em segundo plano, sem abrir o app) e **+15 s**. A resposta passa pelo mesmo `resolveWorkoutAction`.
- **Follow-up:** a Live Activity, com o cronômetro e o exercício na tela de bloqueio e na Dynamic Island. Pede uma extensão de widget nativa (Swift, App Group), fora do alcance desta issue.

### Expo Go

O módulo nativo não existe (`requireOptionalNativeModule` devolve `null`). Fica o comportamento de antes: o descanso na tela e o aviso do fim onde o `expo-notifications` funciona.

## Como testar (dev build Android)

1. Comece um treino, registre uma série e bloqueie o celular. A notificação mostra o exercício, a série e a contagem do descanso.
2. Toque em +15 s, −15 s e Pular. A contagem muda, e o app mostra o mesmo ao voltar.
3. Depois do descanso, toque em "Registrar …" duas vezes seguidas com o app em segundo plano. Deve entrar uma série só, com os valores previstos.
4. Registre uma série no app e depois toque no "Registrar" de uma notificação antiga, se ela ainda aparecer. Nada deve entrar.
5. Finalize ou cancele o treino. A notificação some.
