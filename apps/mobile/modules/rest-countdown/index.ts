import { requireOptionalNativeModule } from 'expo';

interface RestCountdownNative {
  show(deadlineMs: number, title: string, body: string): void;
  hide(): void;
}

/**
 * A contagem do descanso na tela de bloqueio, ou `null` onde o módulo não
 * existe: iOS (lá isso é Live Activity, que pede extensão de widget) e Expo Go,
 * que não carrega módulo nativo local. Ver `RestCountdownModule.kt`.
 */
export const RestCountdown = requireOptionalNativeModule<RestCountdownNative>('RestCountdown');
