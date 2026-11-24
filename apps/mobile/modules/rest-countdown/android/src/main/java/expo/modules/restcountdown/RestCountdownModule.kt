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
 * A notificação do treino (#472, `docs/NOTIFICACAO_TREINO.md`): fixa enquanto
 * há treino em andamento, com o exercício e a meta da série, a contagem do
 * descanso e botões (−15 s, +15 s, Pular; ou Registrar série).
 *
 * O conteúdo é decidido no JS (`workout-notification.ts`); aqui só se desenha e
 * se repassa o toque. A contagem é do cronômetro do próprio sistema
 * (`setUsesChronometer` com `setChronometerCountDown`): com a tela bloqueada o
 * JS é estrangulado, e uma contagem atualizada por ele congelaria justamente
 * onde a pessoa olha.
 *
 * Os botões vão para o `WorkoutActionReceiver`, que entrega o toque ao JS pelo
 * evento `onAction` enquanto o processo vive (inclusive em segundo plano). Com
 * o processo encerrado não há JS para chamar a API: o toque de registrar fica
 * guardado (`PendingWorkoutActions`) e o app o aplica ao abrir.
 *
 * O aviso sonoro do fim do descanso continua sendo o do `expo-notifications`
 * (`expo-rest-notifier.ts`); esta notificação é silenciosa.
 */
class RestCountdownModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context indisponível" }

  override fun definition() = ModuleDefinition {
    Name("RestCountdown")

    Events("onAction")

    OnCreate {
      listener = { action, token -> sendEvent("onAction", mapOf("action" to action, "token" to token)) }
    }

    OnDestroy {
      listener = null
    }

    Function("update") {
      title: String,
      body: String,
      restDeadlineMs: Double,
      actionIds: List<String>,
      actionLabels: List<String>,
      token: String ->
      update(title, body, restDeadlineMs.toLong(), actionIds.zip(actionLabels), token)
    }

    Function("hide") {
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    Function("consumePendingActions") {
      PendingWorkoutActions.drain(context)
    }
  }

  private fun update(
    title: String,
    body: String,
    restDeadline: Long,
    actions: List<Pair<String, String>>,
    token: String,
  ) {
    val manager = NotificationManagerCompat.from(context)
    // Sem permissão (Android 13+) não há o que mostrar; o treino segue na tela.
    if (!manager.areNotificationsEnabled()) return

    ensureChannel()

    val resting = restDeadline > System.currentTimeMillis()
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon())
      .setContentTitle(title)
      .setContentText(body)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(if (resting) NotificationCompat.CATEGORY_STOPWATCH else NotificationCompat.CATEGORY_PROGRESS)
      // Público: o treino não é dado sensível, e escondido atrás do "conteúdo
      // oculto" do bloqueio ele não serviria para nada.
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(openAppIntent())

    if (resting) {
      builder
        .setWhen(restDeadline)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
    } else {
      builder.setShowWhen(false)
    }

    // O Android desenha no máximo três botões.
    actions.take(3).forEachIndexed { index, (id, label) ->
      builder.addAction(0, label, actionIntent(index, id, token))
    }

    try {
      manager.notify(NOTIFICATION_ID, builder.build())
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
      "Treino em andamento",
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = "O exercício, a meta da série e o descanso, com botões, na tela de bloqueio."
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

  private fun actionIntent(index: Int, id: String, token: String): PendingIntent {
    val intent = Intent(context, WorkoutActionReceiver::class.java)
      // A ação distinta por botão: o sistema compara intents sem os extras, e
      // com a mesma ação um botão reaproveitaria o PendingIntent do outro.
      .setAction("$ACTION_PREFIX$id")
      .putExtra(WorkoutActionReceiver.EXTRA_ACTION, id)
      .putExtra(WorkoutActionReceiver.EXTRA_TOKEN, token)
    return PendingIntent.getBroadcast(
      context,
      REQUEST_BASE + index,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
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

  companion object {
    private const val CHANNEL_ID = "workout-rest-countdown"
    private const val NOTIFICATION_ID = 4210
    private const val REQUEST_BASE = 4211
    private const val ACTION_PREFIX = "br.ia.fat.workout."

    /** Quem entrega o toque ao JS; `null` sem módulo vivo (processo recém-criado pelo toque). */
    @Volatile
    internal var listener: ((String, String) -> Unit)? = null
  }
}
