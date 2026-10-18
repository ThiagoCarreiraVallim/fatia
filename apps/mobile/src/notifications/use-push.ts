import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { notificationTarget } from '@fatia/api-client';
import { enablePush, pushDeviceId } from './push';

/**
 * Dentro da sessão: refaz o cadastro do aparelho se a pessoa já ligou os
 * avisos aqui, e leva o toque no aviso para a tela dele — inclusive o toque que
 * abriu o app fechado.
 */
export function usePush(ready: boolean) {
  const router = useRouter();
  const ultimo = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!ready) return;
    void pushDeviceId().then((id) => {
      if (id) void enablePush(false).catch(() => undefined);
    });
  }, [ready]);

  useEffect(() => {
    if (!ready || !ultimo) return;
    const destino = notificationTarget(ultimo.notification.request.content.data);
    // Limpa para o mesmo toque não abrir a tela de novo no próximo início.
    Notifications.clearLastNotificationResponse();
    if (destino) router.push(destino as never);
  }, [ready, ultimo, router]);
}
