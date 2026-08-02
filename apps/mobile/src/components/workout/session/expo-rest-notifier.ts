import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { REST_CHANNEL_ID, type RestNotifier } from './rest-notification';

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
 * Com o app aberto o aviso já é o timer na tela, o háptico e o leitor de tela.
 * Uma tarja por cima da sessão em andamento cobriria justamente o campo de
 * carga que a pessoa está preenchendo. Este handler é global do app; quando a
 * #148 (push remoto) trouxer outros tipos de notificação, ele vai precisar
 * decidir por `content.data`, e não em bloco.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export const expoRestNotifier: RestNotifier = {
  async ensurePermission() {
    if (Platform.OS === 'android') {
      // Antes de pedir a permissão, e não depois: no Android o diálogo é do
      // canal. Sem canal, o sistema entrega o aviso mudo e sem vibrar, que é o
      // mesmo que não entregar para quem está com o celular no bolso.
      await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
        name: 'Descanso do treino',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2ce500',
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
    return Notifications.scheduleNotificationAsync({
      content: {
        title: 'Descanso terminado',
        body: 'Hora da próxima série.',
        sound: 'default',
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
    await Notifications.cancelScheduledNotificationAsync(id);
  },
};
