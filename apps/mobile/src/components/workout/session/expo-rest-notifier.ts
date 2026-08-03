import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  isRestNotification,
  REST_CHANNEL_ID,
  REST_NOTIFICATION_KIND,
  type RestNotifier,
} from './rest-notification';

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
 * Com o app aberto o aviso do descanso já é o timer na tela, o háptico e o
 * leitor de tela — uma tarja por cima da sessão cobriria justamente o campo de
 * carga que a pessoa está preenchendo.
 *
 * O handler é global do app e responde por toda notificação em primeiro plano,
 * então ele decide por `content.data` e **não** em bloco: silenciar tudo daqui
 * deixaria mudo, sem aviso nenhum, o push remoto da #148. O padrão é mostrar; o
 * silêncio é a exceção do descanso.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const doDescanso = isRestNotification(notification.request.content.data);
    return {
      shouldShowBanner: !doDescanso,
      shouldShowList: !doDescanso,
      shouldPlaySound: !doDescanso,
      shouldSetBadge: !doDescanso,
    };
  },
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
    await Notifications.cancelScheduledNotificationAsync(id);
  },
};
