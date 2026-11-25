import { Platform } from 'react-native';
import { REST_CHANNEL_ID, REST_NOTIFICATION_KIND, type RestNotifier } from './rest-notification';
import { colors } from '@/theme/colors';
// O handler de primeiro plano é global e silencia só o descanso; mora lá.
import '@/notifications/foreground-handler';
import { Notifications } from '@/notifications/native';

/**
 * A ponta que fala com o sistema operacional (#182).
 *
 * Só existe para não deixar `expo-notifications` dentro da lógica de
 * `rest-notification.ts`, que é a parte verificável sem aparelho. Nada aqui é
 * coberto por teste automatizado: módulo nativo não monta no harness em Node, e
 * permissão, canal e entrega em segundo plano se conferem no aparelho — o
 * roteiro está na PR da issue.
 */

/**
 * As ações do aviso do fim do descanso no iOS (#472): lá não há notificação
 * fixa (seria Live Activity), então o aviso que já existe ganha botões. Os ids
 * são os mesmos da notificação do Android e passam pelo mesmo
 * `resolveWorkoutAction` (`workout-notification-sync.tsx`).
 */
export const WORKOUT_REST_CATEGORY = 'workout-rest';

let categoryReady: Promise<void> | null = null;

function ensureCategory(): Promise<void> {
  if (Platform.OS !== 'ios' || !Notifications) return Promise.resolve();
  categoryReady ??= Notifications.setNotificationCategoryAsync(WORKOUT_REST_CATEGORY, [
    {
      identifier: 'log-set',
      buttonTitle: 'Registrar série',
      // Em segundo plano: o sistema acorda o app por alguns segundos.
      options: { opensAppToForeground: false },
    },
    { identifier: 'rest-plus', buttonTitle: '+15 s', options: { opensAppToForeground: false } },
  ])
    .then(() => undefined)
    .catch(() => {
      // Sem categoria o aviso chega sem botões; tenta de novo no próximo.
      categoryReady = null;
    });
  return categoryReady;
}

/** O exercício em foco, que o "Registrar série" do aviso registra. Quem atualiza é a sessão. */
let restExerciseId: number | null = null;

export function setRestNotificationExercise(exerciseId: number | null): void {
  restExerciseId = exerciseId;
}

export const expoRestNotifier: RestNotifier = {
  async ensurePermission() {
    // Expo Go do Android: sem o módulo, o descanso fica só na tela (`native.ts`).
    if (!Notifications) return false;
    if (Platform.OS === 'android') {
      // Antes de pedir a permissão, e não depois: no Android o diálogo é do
      // canal. Sem canal, o sistema entrega o aviso mudo e sem vibrar, que é o
      // mesmo que não entregar para quem está com o celular no bolso.
      await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
        name: 'Descanso do treino',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.primary,
      });
    }

    const atual = await Notifications.getPermissionsAsync();
    if (atual.granted) return true;
    // Recusa definitiva: perguntar de novo não abre diálogo nenhum, só gasta
    // uma ida ao módulo nativo a cada descanso.
    if (!atual.canAskAgain) return false;

    const pedido = await Notifications.requestPermissionsAsync();
    return pedido.granted;
  },

  async schedule(seconds: number) {
    if (!Notifications) throw new Error('Avisos indisponíveis neste app.');
    await ensureCategory();
    return Notifications.scheduleNotificationAsync({
      content: {
        title: 'Descanso terminado',
        body: 'Hora da próxima série.',
        sound: 'default',
        // `kind` é o que o handler de primeiro plano lê para silenciar só este
        // aviso; `exerciseId`, o exercício do "Registrar série".
        data: { kind: REST_NOTIFICATION_KIND, exerciseId: restExerciseId },
        ...(Platform.OS === 'ios' && restExerciseId != null
          ? { categoryIdentifier: WORKOUT_REST_CATEGORY }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
        channelId: REST_CHANNEL_ID,
      },
    });
  },

  async cancel(id: string) {
    await Notifications?.cancelScheduledNotificationAsync(id);
  },
};
