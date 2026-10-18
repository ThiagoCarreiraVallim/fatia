import * as Notifications from 'expo-notifications';
import { isRestNotification } from '@/components/workout/session/rest-notification';

/**
 * O que fazer com uma notificação que chega com o app aberto. O handler é
 * global, então mora aqui e é importado por quem usa notificação — o aviso do
 * descanso (#182) e o push da comunidade (Fase 8c) — em vez de um sobrescrever
 * o outro.
 *
 * Com a sessão de treino aberta, o aviso do descanso já é o timer na tela, o
 * háptico e o leitor de tela: uma tarja por cima cobriria o campo de carga.
 * Todo o resto aparece normalmente.
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
