package expo.modules.restcountdown

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Os broadcasts da notificação do treino: o alarme do fim do descanso e o toque
 * num botão.
 *
 * O desenho do descanso (±15 s, Pular) muda aqui mesmo, sem esperar o JS, que
 * pode estar parado; o toque segue para o JS (`onAction`) para o cronômetro da
 * tela acompanhar. Sem JS vivo (o processo foi encerrado e o toque o recriou),
 * só o "Registrar série" é guardado. Abrir o app daqui é bloqueado no Android
 * 12+ (trampolim de notificação), então o registro guardado é aplicado na
 * próxima vez que o app abrir.
 *
 * Com o JS vivo, o broadcast é segurado (`goAsync`) até o JS dizer que terminou
 * (`finishAction`) ou o tempo limite: sem isso o processo volta a ser candidato
 * a congelar assim que o `onReceive` retorna, no meio das chamadas à API.
 */
class WorkoutActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == WorkoutNotifications.ACTION_REST_END) {
      WorkoutNotifications.restEnded(context, intent.getLongExtra(WorkoutNotifications.EXTRA_DEADLINE, 0))
      return
    }

    val action = intent.getStringExtra(EXTRA_ACTION) ?: return
    val token = intent.getStringExtra(EXTRA_TOKEN) ?: ""
    when (action) {
      "rest-minus" -> WorkoutNotifications.nudgeRest(context, -NUDGE_MS)
      "rest-plus" -> WorkoutNotifications.nudgeRest(context, NUDGE_MS)
      "rest-skip" -> WorkoutNotifications.skipRest(context)
    }

    val deliver = RestCountdownModule.listener
    if (deliver == null) {
      if (action == "log-set") PendingWorkoutActions.add(context, action, token)
      return
    }
    val requestId = HeldBroadcasts.hold(goAsync())
    deliver(action, token, requestId)
  }

  companion object {
    const val EXTRA_ACTION = "action"
    const val EXTRA_TOKEN = "token"
    /** O `REST_NUDGE_SECONDS` do JS. */
    private const val NUDGE_MS = 15_000L
  }
}
