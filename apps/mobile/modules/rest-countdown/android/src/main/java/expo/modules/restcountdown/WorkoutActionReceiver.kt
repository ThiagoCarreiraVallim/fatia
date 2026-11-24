package expo.modules.restcountdown

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * O toque num botão da notificação do treino. Com o JS vivo, vai direto para o
 * evento `onAction`. Sem ele (o processo foi encerrado e o toque o recriou),
 * só o "Registrar série" é guardado: o descanso morreu junto com o processo.
 * Abrir o app daqui é bloqueado no Android 12+ (trampolim de notificação), então
 * o registro guardado é aplicado na próxima vez que o app abrir.
 */
class WorkoutActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.getStringExtra(EXTRA_ACTION) ?: return
    val token = intent.getStringExtra(EXTRA_TOKEN) ?: ""
    val deliver = RestCountdownModule.listener
    if (deliver != null) {
      deliver(action, token)
      return
    }
    if (action == "log-set") PendingWorkoutActions.add(context, action, token)
  }

  companion object {
    const val EXTRA_ACTION = "action"
    const val EXTRA_TOKEN = "token"
  }
}
