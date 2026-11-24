import { requireOptionalNativeModule, type NativeModule } from 'expo';

type RestCountdownEvents = {
  /**
   * Toque num botão da notificação do treino: `token` é JSON (ou vazio).
   * `requestId` identifica o broadcast segurado (`goAsync`): devolva em
   * `finishAction` quando terminar de tratar o toque.
   */
  onAction: (event: { action: string; token: string; requestId: string }) => void;
};

declare class RestCountdownNative extends NativeModule<RestCountdownEvents> {
  /**
   * Mostra ou atualiza a notificação do treino. `payload` é o JSON de
   * `nativePayload` (`workout-notification.ts`): o estado de agora, o prazo do
   * descanso e o estado de depois, para onde o nativo troca sozinho no prazo.
   */
  update(payload: string): void;
  /** Tira a notificação e esquece o estado guardado. */
  hide(): void;
  /** Redesenha o último estado (a permissão pode ter sido concedida depois). */
  refresh(): void;
  /** Saída da conta: tira a notificação e descarta os toques guardados. */
  reset(): void;
  /** Toques de "Registrar série" feitos com o app encerrado, desde a última leitura. */
  consumePendingActions(): { action: string; token: string }[];
  /** O toque `requestId` foi tratado: o broadcast segurado pode terminar. */
  finishAction(requestId: string): void;
}

/**
 * A notificação do treino (#472) e a contagem do descanso na tela de bloqueio,
 * ou `null` onde o módulo não existe: iOS (lá isso é Live Activity, que pede
 * extensão de widget) e Expo Go, que não carrega módulo nativo local. Ver
 * `RestCountdownModule.kt` e `docs/NOTIFICACAO_TREINO.md`.
 */
export const RestCountdown = requireOptionalNativeModule<RestCountdownNative>('RestCountdown');
