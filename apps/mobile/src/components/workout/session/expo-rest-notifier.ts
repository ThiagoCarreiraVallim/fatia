import { Platform } from 'react-native';
import { REST_CHANNEL_ID, REST_NOTIFICATION_KIND, type RestNotifier } from './rest-notification';
import { cores } from '@/theme/cores';
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
        lightColor: cores.primary,
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
    return Notifications.scheduleNotificationAsync({
      content: {
        title: 'Descanso terminado',
        body: 'Hora da próxima série.',
        sound: 'default',
        // É o que o handler de primeiro plano lê para silenciar só este aviso.
        data: { kind: REST_NOTIFICATION_KIND },
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
