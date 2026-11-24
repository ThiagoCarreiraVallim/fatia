package expo.modules.restcountdown

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A notificação do treino (#472, `docs/NOTIFICACAO_TREINO.md`): fixa enquanto
 * há treino em andamento, com o exercício e a meta da série, a contagem do
 * descanso e botões (−15 s, +15 s, Pular; ou Registrar série).
 *
 * O conteúdo é decidido no JS (`workout-notification.ts`) e desenhado por
 * `WorkoutNotifications`, que também troca sozinho para o estado de depois do
 * descanso no prazo. A contagem é do cronômetro do próprio sistema: com a tela
 * bloqueada o JS é estrangulado, e uma contagem atualizada por ele congelaria
 * justamente onde a pessoa olha.
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
      listener = { action, token, requestId ->
        sendEvent("onAction", mapOf("action" to action, "token" to token, "requestId" to requestId))
      }
    }

    OnDestroy {
      listener = null
    }

    Function("update") { payload: String ->
      WorkoutNotifications.apply(context, payload)
    }

    Function("hide") {
      WorkoutNotifications.hide(context)
    }

    Function("refresh") {
      WorkoutNotifications.refresh(context)
    }

    Function("reset") {
      WorkoutNotifications.hide(context)
      PendingWorkoutActions.clear(context)
    }

    Function("consumePendingActions") {
      PendingWorkoutActions.drain(context)
    }

    Function("finishAction") { requestId: String ->
      HeldBroadcasts.release(requestId)
    }
  }

  companion object {
    /** Quem entrega o toque ao JS; `null` sem módulo vivo (processo recém-criado pelo toque). */
    @Volatile
    internal var listener: ((String, String, String) -> Unit)? = null
  }
}
