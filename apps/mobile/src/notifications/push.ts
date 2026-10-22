import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { notificationsApi } from '@fatia/api-client';
import { cores } from '@/theme/cores';
import './foreground-handler';
import { Notifications as NotificationsModule } from './native';

/**
 * O push da comunidade (Fase 8c, ADR 033) do lado do aparelho: permissão,
 * canal, token da Expo e o cadastro na API. Como o adaptador do descanso, nada
 * aqui é coberto por teste automatizado — módulo nativo não monta no harness em
 * Node. Para onde o toque leva é `notificationTarget`, testado no api-client.
 */

/** O mesmo canal que a API manda em `channelId` (`push.service.ts`). */
export const PUSH_CHANNEL_ID = 'avisos';

/**
 * O id do aparelho na API, no cofre. Existir é o "a pessoa ligou os avisos
 * neste celular": ao abrir o app o cadastro é refeito em silêncio (o token da
 * Expo pode mudar), e sair da conta apaga.
 */
const DEVICE_KEY = 'fatia.pushDevice';

export type PushSetup = 'enabled' | 'denied' | 'unavailable';

/**
 * Liga os avisos neste celular. `ask` falso nunca abre o diálogo do sistema:
 * é o caminho de quem já autorizou e só está abrindo o app.
 */
export async function enablePush(ask: boolean): Promise<PushSetup> {
  // Expo Go do Android: sem push remoto (ver `native.ts`).
  const Notifications = NotificationsModule;
  if (!Notifications) return 'unavailable';
  if (Platform.OS === 'android') {
    // Antes de pedir a permissão: no Android 13+ o diálogo só aparece depois
    // de existir um canal.
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: 'Avisos da comunidade',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: cores.primary,
    });
  }
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && ask && perm.canAskAgain)
    perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return 'denied';

  // Sem o projeto do EAS a Expo não emite token (build sem `eas init`).
  const projectId =
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return 'unavailable';

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const device = await notificationsApi.registerDevice({
    token,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
  });
  await SecureStore.setItemAsync(DEVICE_KEY, device.id);
  return 'enabled';
}

/** Desliga neste celular. A falha da API não impede: o cofre é limpo de qualquer jeito. */
export async function disablePush(): Promise<void> {
  const id = await SecureStore.getItemAsync(DEVICE_KEY);
  await SecureStore.deleteItemAsync(DEVICE_KEY);
  if (!id) return;
  try {
    await notificationsApi.removeDevice(id);
  } catch {
    // Sem rede ou já apagado: a Expo avisa quando o token morrer.
  }
}

export async function pushDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_KEY);
}
