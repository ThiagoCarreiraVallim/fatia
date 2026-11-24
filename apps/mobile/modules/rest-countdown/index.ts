import { requireOptionalNativeModule, type NativeModule } from 'expo';

type RestCountdownEvents = {
  /** Toque num botão da notificação do treino: `token` é JSON (ou vazio). */
  onAction: (event: { action: string; token: string }) => void;
};

declare class RestCountdownNative extends NativeModule<RestCountdownEvents> {
  /**
   * Mostra ou atualiza a notificação do treino. `restDeadlineMs` 0: sem
   * descanso. `actionIds` e `actionLabels` andam juntos (no máximo 3).
   */
  update(
    title: string,
    body: string,
    restDeadlineMs: number,
    actionIds: string[],
    actionLabels: string[],
    token: string,
  ): void;
  hide(): void;
  /** Toques de "Registrar série" feitos com o app encerrado, desde a última leitura. */
  consumePendingActions(): { action: string; token: string }[];
}

/**
 * A notificação do treino (#472) e a contagem do descanso na tela de bloqueio,
 * ou `null` onde o módulo não existe: iOS (lá isso é Live Activity, que pede
 * extensão de widget) e Expo Go, que não carrega módulo nativo local. Ver
 * `RestCountdownModule.kt` e `docs/NOTIFICACAO_TREINO.md`.
 */
export const RestCountdown = requireOptionalNativeModule<RestCountdownNative>('RestCountdown');
