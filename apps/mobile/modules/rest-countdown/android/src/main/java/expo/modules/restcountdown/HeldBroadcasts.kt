package expo.modules.restcountdown

import android.content.BroadcastReceiver
import android.os.Handler
import android.os.Looper

/**
 * Broadcasts segurados (`goAsync`) enquanto o JS trata o toque. O JS solta com
 * `finishAction`; se não soltar, o tempo limite solta antes dos 10 s que o
 * sistema dá a um broadcast em segundo plano.
 */
internal object HeldBroadcasts {
  private const val TIMEOUT_MS = 9_000L
  private val handler = Handler(Looper.getMainLooper())
  private val held = mutableMapOf<String, BroadcastReceiver.PendingResult>()
  private var counter = 0L

  @Synchronized
  fun hold(result: BroadcastReceiver.PendingResult): String {
    val id = (++counter).toString()
    held[id] = result
    handler.postDelayed({ release(id) }, TIMEOUT_MS)
    return id
  }

  @Synchronized
  fun release(id: String) {
    held.remove(id)?.finish()
  }
}
