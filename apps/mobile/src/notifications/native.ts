import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

type NotificationsModule = typeof import('expo-notifications');

/**
 * O `expo-notifications`, ou `null` onde ele não funciona.
 *
 * No Expo Go do Android (SDK 53 em diante) o módulo lança erro **já no import**:
 * o push remoto saiu do Expo Go. Importado no topo, ele derrubava toda rota que
 * dependesse de aviso — o layout `(app)`, o perfil e a sessão de treino — e o
 * app abria em "Something went wrong". Aqui ele só é carregado onde existe; no
 * Expo Go do Android os avisos (comunidade e descanso) ficam desligados, e o
 * resto do app funciona. No dev build e no APK nada muda.
 */
export const notificationsUnavailable =
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const Notifications: NotificationsModule | null = notificationsUnavailable
  ? null
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-notifications') as NotificationsModule);

/** O toque no aviso que abriu o app. Sem o módulo, nunca há. */
export const useLastNotificationResponse: NotificationsModule['useLastNotificationResponse'] =
  Notifications ? Notifications.useLastNotificationResponse : () => null;
