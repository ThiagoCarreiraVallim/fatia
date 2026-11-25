package expo.modules.restcountdown

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.AlarmManagerCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * A notificação do treino (#472, `docs/NOTIFICACAO_TREINO.md`), desenhada a
 * partir do estado que o JS manda (`nativePayload` em `workout-notification.ts`):
 * `title`, `body`, `actions`, `token`, `restDeadline` e `next` — o estado que
 * entra quando o descanso acaba.
 *
 * A troca no fim do descanso é daqui, não do JS: em segundo plano o RN para os
 * timers do JS (`JavaTimerManager.onHostPause`), e uma troca que esperasse o
 * tique ficaria no descanso, com o cronômetro negativo e sem o "Registrar".
 * Quem acorda no prazo é um alarme do `AlarmManager`, e não um `Handler` do
 * processo: o Android 14 congela o processo em segundo plano, e o `Handler`
 * congela junto; o alarme entrega um broadcast que descongela (ou recria) o
 * processo. É o mesmo agendamento do aviso sonoro do fim do descanso
 * (`ExpoSchedulingDelegate` do `expo-notifications`): exato se o app pode,
 * senão o `setAndAllowWhileIdle`, que o sistema pode atrasar um pouco.
 *
 * O estado fica guardado (SharedPreferences): o alarme e os botões podem
 * chegar com o processo recriado, e a permissão concedida depois redesenha o
 * último estado (`refresh`).
 */
internal object WorkoutNotifications {
  private const val CHANNEL_ID = "workout-rest-countdown"
  private const val NOTIFICATION_ID = 4210
  private const val REQUEST_BASE = 4211
  private const val REQUEST_REST_END = 4220
  private const val ACTION_PREFIX = "br.ia.fat.workout."
  const val ACTION_REST_END = "br.ia.fat.workout.rest-end"
  const val EXTRA_DEADLINE = "deadline"
  private const val PREFS = "fatia-workout-notification"
  private const val KEY = "state"

  /** O estado que o JS mandou. Descanso já vencido entra direto no de depois. */
  @Synchronized
  fun apply(context: Context, payload: String) {
    val state = runCatching { JSONObject(payload) }.getOrNull() ?: return
    show(context, settle(state))
  }

  /** O alarme do fim do descanso. */
  @Synchronized
  fun restEnded(context: Context, deadline: Long) {
    val state = load(context) ?: return
    // Alarme de um descanso que já mudou (±15 s, pular, outro estado): vale o atual.
    if (deadline <= 0 || state.optLong("restDeadline", 0) != deadline) return
    show(context, afterRest(state))
  }

  /** ±15 s no próprio nativo: o desenho muda já, mesmo com o JS parado. */
  @Synchronized
  fun nudgeRest(context: Context, deltaMs: Long) {
    val state = load(context) ?: return
    val deadline = state.optLong("restDeadline", 0)
    if (deadline <= 0) return
    show(context, settle(JSONObject(state.toString()).put("restDeadline", deadline + deltaMs)))
  }

  @Synchronized
  fun skipRest(context: Context) {
    val state = load(context) ?: return
    if (state.optLong("restDeadline", 0) <= 0) return
    show(context, afterRest(state))
  }

  @Synchronized
  fun refresh(context: Context) {
    val state = load(context) ?: return
    show(context, settle(state))
  }

  @Synchronized
  fun hide(context: Context) {
    cancelRestEnd(context)
    prefs(context).edit().remove(KEY).commit()
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
  }

  fun actionIntent(context: Context, index: Int, id: String, token: String): PendingIntent {
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

  private fun settle(state: JSONObject): JSONObject {
    val deadline = state.optLong("restDeadline", 0)
    if (deadline <= 0 || deadline > System.currentTimeMillis()) return state
    return afterRest(state)
  }

  private fun afterRest(state: JSONObject): JSONObject {
    val next = state.optJSONObject("next")
      ?: return JSONObject(state.toString()).put("actions", JSONArray()).put("restDeadline", 0)
    return JSONObject(next.toString()).put("restDeadline", 0)
  }

  private fun show(context: Context, state: JSONObject) {
    // Guarda mesmo sem permissão: concedida depois, o `refresh` desenha.
    prefs(context).edit().putString(KEY, state.toString()).commit()
    val deadline = state.optLong("restDeadline", 0)
    if (deadline > 0) scheduleRestEnd(context, deadline) else cancelRestEnd(context)
    post(context, state)
  }

  private fun post(context: Context, state: JSONObject) {
    val manager = NotificationManagerCompat.from(context)
    // Sem permissão (Android 13+) não há o que mostrar; o treino segue na tela.
    if (!manager.areNotificationsEnabled()) return

    ensureChannel(context)

    val deadline = state.optLong("restDeadline", 0)
    val resting = deadline > System.currentTimeMillis()
    val token = state.optString("token", "")
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(state.optString("title"))
      .setContentText(state.optString("body"))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(if (resting) NotificationCompat.CATEGORY_STOPWATCH else NotificationCompat.CATEGORY_PROGRESS)
      // Público: o treino não é dado sensível, e escondido atrás do "conteúdo
      // oculto" do bloqueio ele não serviria para nada.
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(openAppIntent(context))

    if (resting) {
      builder
        .setWhen(deadline)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
    } else {
      builder.setShowWhen(false)
    }

    // O Android desenha no máximo três botões.
    val actions = state.optJSONArray("actions") ?: JSONArray()
    for (index in 0 until minOf(actions.length(), 3)) {
      val action = actions.optJSONObject(index) ?: continue
      builder.addAction(
        0,
        action.optString("label"),
        actionIntent(context, index, action.optString("id"), token),
      )
    }

    try {
      manager.notify(NOTIFICATION_ID, builder.build())
    } catch (_: SecurityException) {
      // Permissão revogada entre a checagem e o `notify`.
    }
  }

  private fun restEndIntent(context: Context, deadline: Long, flags: Int): PendingIntent? {
    val intent = Intent(context, WorkoutActionReceiver::class.java)
      .setAction(ACTION_REST_END)
      .putExtra(EXTRA_DEADLINE, deadline)
    return PendingIntent.getBroadcast(context, REQUEST_REST_END, intent, PendingIntent.FLAG_IMMUTABLE or flags)
  }

  private fun scheduleRestEnd(context: Context, deadline: Long) {
    val alarm = context.getSystemService(AlarmManager::class.java) ?: return
    val intent = restEndIntent(context, deadline, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm.canScheduleExactAlarms()) {
        AlarmManagerCompat.setExactAndAllowWhileIdle(alarm, AlarmManager.RTC_WAKEUP, deadline, intent)
      } else {
        AlarmManagerCompat.setAndAllowWhileIdle(alarm, AlarmManager.RTC_WAKEUP, deadline, intent)
      }
    } catch (_: SecurityException) {
      // Permissão de alarme exato revogada no meio: fica a troca pelo JS, na volta.
    }
  }

  private fun cancelRestEnd(context: Context) {
    val alarm = context.getSystemService(AlarmManager::class.java) ?: return
    val intent = restEndIntent(context, 0, PendingIntent.FLAG_NO_CREATE) ?: return
    alarm.cancel(intent)
    intent.cancel()
  }

  private fun load(context: Context): JSONObject? {
    val raw = prefs(context).getString(KEY, null) ?: return null
    return runCatching { JSONObject(raw) }.getOrNull()
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun ensureChannel(context: Context) {
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
  private fun smallIcon(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun openAppIntent(context: Context): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    intent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }
}
