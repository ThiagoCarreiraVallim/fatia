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

#### Em segundo plano o JS não conta tempo

Com a Activity pausada, o React Native para os timers do JS (`JavaTimerManager.onHostPause`), e com eles o `setInterval` do descanso e o aviso do TanStack Query aos observers, que passa por `setTimeout(0)`. Nada que mude a notificação em segundo plano pode esperar por eles:

- **Fim do descanso:** o JS manda, junto do descanso, o estado de depois (`next`: a meta, o "Registrar" e a oferta). O nativo (`WorkoutNotifications.kt`) troca sozinho no prazo.
  - **Por que alarme:** quem acorda é um alarme do `AlarmManager`, e não um `Handler` do processo. O Android 14 congela o processo em segundo plano, e o `Handler` congela junto. O alarme entrega um broadcast que descongela ou recria o processo.
  - **Exato ou não:** é o mesmo agendamento do aviso sonoro do `expo-notifications`. É exato quando o app pode; senão, usa `setAndAllowWhileIdle`, que o sistema pode atrasar um pouco.
  - **Prazo vencido:** estado que chega com o prazo já vencido entra direto no de depois.
- **±15 s e Pular:** o receiver muda o desenho na hora, com a mesma regra do JS (−15 s que passa do fim acaba o descanso), e remarca o alarme. O toque também segue para o JS, para o cronômetro da tela acompanhar.
- **Depois de "Registrar":** a notificação seguinte é calculada da resposta do servidor (`sessionAfterLog` e `workoutNotification`, em `workout-action.ts`) e repostada na hora. A previsão do exercício seguinte é buscada esperando a resposta (`fetchQuery`). O cache recebe a sessão nova por `setQueryData`, e quem renderizar depois lê dela.

#### Os toques

Os toques vão por um `BroadcastReceiver` e chegam ao JS como o evento `onAction` do módulo. Lá, `applyWorkoutAction` (`workout-action.ts`) decide o que fazer, e é a mesma lógica com o app aberto, em segundo plano ou na fila do app encerrado:

- **Descanso:** `rest.addTime(±15)` ou `rest.stop()`, no cronômetro global (`RestTimerProvider`). Com o prazo vencido sem o tique do JS ter rodado, "+15 s" começa um descanso de 15 s.
- **Registrar série:** a ação leva a **oferta** que a notificação mostrava: a sessão, o exercício, o número da série, a última série do exercício naquele momento (`after`) e os valores previstos.
  - **Valores:** são os da oferta, os mesmos do texto do botão. Saem da mesma regra da tela: o rascunho da série em andamento, se houver (`restoreSetDraft`); se não, `prefillForNextSet`. Por isso a fila do app encerrado não recalcula nada com o cache ainda vazio.
  - **Vale só a oferta de agora:** antes de gravar, a sessão é relida do servidor. O toque é ignorado se:
    - a sessão for outra;
    - a série já tiver entrado;
    - a última série do exercício tiver mudado;
    - o exercício estiver encerrado ou completo.
  - **Sessão finalizada** em outro lugar (web, IA): nada é gravado, e a notificação sai.
  - **Idempotente:** a `clientKey` é a da oferta (`ntf:<exercício>:<série>:<última série>`). Dois toques na mesma oferta gravam uma série só, porque a API deduplica por sessão e chave. Apagar uma série anterior gera outra oferta, com outra chave. Uma chave só por número de série repetiria a de uma série que ficou, e a API devolveria aquela sem gravar.
- **Broadcast segurado:** com o JS vivo, o receiver segura o broadcast (`goAsync`) até o JS terminar (`finishAction`), com tempo limite de 9 s. Assim o processo não congela no meio das chamadas à API.
- **App encerrado:** o receiver guarda o toque de registrar. Na próxima abertura, o app aplica o toque (`consumePendingActions`), se a oferta ainda for a desta sessão. Abrir o app direto pelo receiver é bloqueado no Android 12+ (trampolim de notificação). Ao sair da conta, a fila e a notificação são descartadas (`reset`).
- **Permissão concedida depois** (Android 13+): o nativo guarda o último estado mesmo sem permissão e o desenha quando o app volta à frente (`refresh`).

**A API continua aceitando série em sessão finalizada.** O `SessionSetService.create` também atende o `log_set` do MCP, que recebe qualquer `sessionId` e serve para completar treino passado. A checagem fica no cliente.

O aviso sonoro do fim do descanso continua sendo o do `expo-notifications`. A notificação do treino é silenciosa.

### iOS

- **Ações de categoria** no aviso do fim do descanso: **Registrar série** (em segundo plano, sem abrir o app) e **+15 s**. A resposta passa pelo mesmo `resolveWorkoutAction`.
- **Follow-up:** a Live Activity, com o cronômetro e o exercício na tela de bloqueio e na Dynamic Island. Pede uma extensão de widget nativa (Swift, App Group), fora do alcance desta issue.

### Follow-up

- **iOS, app encerrado:** a resposta ao botão do aviso pode chegar antes de existir o listener, que só é registrado depois da leitura da sessão ativa. O toque se perde.
- **iOS, última série do exercício:** o "Registrar série" do aviso agendado logo depois dela fica preso ao exercício que acabou de fechar e é ignorado.
- **Android 14+:** a notificação "ongoing" de app sem serviço em primeiro plano pode ser dispensada com um deslizar. Ela só volta no próximo estado.
- **Toques de descanso com o processo encerrado:** mudam o desenho, mas não remarcam o aviso sonoro do `expo-notifications`, que é do JS.
- **Alarme não exato:** sem a permissão de alarme exato, a troca no fim do descanso pode atrasar alguns segundos, com o cronômetro passando de 0:00.

### Expo Go

O módulo nativo não existe (`requireOptionalNativeModule` devolve `null`). Fica o comportamento de antes: o descanso na tela e o aviso do fim onde o `expo-notifications` funciona.

## Como testar (dev build Android)

1. Comece um treino, registre uma série e bloqueie o celular. A notificação mostra o exercício, a série e a contagem do descanso.
2. Toque em +15 s, −15 s e Pular. A contagem muda, e o app mostra o mesmo ao voltar.
3. Deixe o descanso acabar com o celular bloqueado. A notificação troca sozinha para "Registrar …", sem abrir o app.
4. Toque em "Registrar …" duas vezes seguidas com o app em segundo plano. Deve entrar uma série só, com os valores do botão, e a notificação passa para o descanso da série seguinte.
5. Registre uma série no app e depois toque no "Registrar" de uma notificação antiga, se ela ainda aparecer. Nada deve entrar.
6. Finalize ou cancele o treino, ou saia da conta. A notificação some.
