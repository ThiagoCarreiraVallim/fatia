package expo.modules.restcountdown

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Contagem do descanso na notificação — e, por ela, na tela de bloqueio.
 *
 * Quem conta é o cronômetro do próprio sistema (`setUsesChronometer` com
 * `setChronometerCountDown`): o app só diz quando o descanso acaba. Atualizar a
 * notificação a cada segundo pelo JS não serviria, porque com a tela bloqueada
 * o JS é estrangulado ou parado, e a contagem congelaria justamente onde a
 * pessoa olha.
 *
 * O aviso sonoro do fim continua sendo o agendado pelo `expo-notifications`
 * (`expo-rest-notifier.ts`); este aqui é silencioso e some sozinho no fim
 * (`setTimeoutAfter`), para não ficar marcando 0:00.
 */
class RestCountdownModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context indisponível" }

  override fun definition() = ModuleDefinition {
    Name("RestCountdown")

    Function("show") { deadlineMs: Double, title: String, body: String ->
      show(deadlineMs.toLong(), title, body)
    }

    Function("hide") {
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }
  }

  private fun show(deadline: Long, title: String, body: String) {
    val manager = NotificationManagerCompat.from(context)
    val remaining = deadline - System.currentTimeMillis()
    if (remaining <= 0) {
      manager.cancel(NOTIFICATION_ID)
      return
    }
    // Sem permissão (Android 13+) não há o que mostrar; o descanso segue na tela.
    if (!manager.areNotificationsEnabled()) return

    ensureChannel()

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon())
      .setContentTitle(title)
      .setContentText(body)
      .setWhen(deadline)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      // Público: o tempo de descanso não é dado sensível, e escondido atrás do
      // "conteúdo oculto" do bloqueio ele não serviria para nada.
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setTimeoutAfter(remaining)
      .setContentIntent(openAppIntent())
      .build()

    try {
      manager.notify(NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // Permissão revogada entre a checagem e o `notify`.
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    // Importância padrão, e não baixa: notificação "silenciosa" some da tela de
    // bloqueio em boa parte dos aparelhos. O som e a vibração saem do canal.
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Contagem do descanso",
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = "Quanto falta do descanso entre as séries, na tela de bloqueio."
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    }
    context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  /** O ícone de notificação do `expo-notifications`, se houver; senão, o do app. */
  private fun smallIcon(): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun openAppIntent(): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    intent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private companion object {
    const val CHANNEL_ID = "workout-rest-countdown"
    const val NOTIFICATION_ID = 4210
  }
}
