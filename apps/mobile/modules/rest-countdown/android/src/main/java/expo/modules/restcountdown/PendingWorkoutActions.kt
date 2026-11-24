package expo.modules.restcountdown

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Toques de "Registrar série" feitos com o app encerrado, guardados até o JS
 * voltar. O JS decide se ainda valem (a série ainda é a próxima) e a chave fixa
 * da série impede registro dobrado.
 */
internal object PendingWorkoutActions {
  private const val PREFS = "fatia-workout-actions"
  private const val KEY = "pending"
  /** Toque velho demais não vale: o treino daquela notificação já acabou. */
  private const val MAX_AGE_MS = 6 * 60 * 60 * 1000L

  @Synchronized
  fun add(context: Context, action: String, token: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val list = JSONArray(prefs.getString(KEY, "[]"))
    list.put(
      JSONObject()
        .put("action", action)
        .put("token", token)
        .put("at", System.currentTimeMillis()),
    )
    prefs.edit().putString(KEY, list.toString()).apply()
  }

  @Synchronized
  fun drain(context: Context): List<Map<String, String>> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val list = JSONArray(prefs.getString(KEY, "[]"))
    prefs.edit().remove(KEY).apply()
    val now = System.currentTimeMillis()
    return (0 until list.length())
      .map { list.getJSONObject(it) }
      .filter { now - it.optLong("at", 0) < MAX_AGE_MS }
      .map { mapOf("action" to it.optString("action"), "token" to it.optString("token")) }
  }
}
