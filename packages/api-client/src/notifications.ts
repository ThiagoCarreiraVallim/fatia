import { apiFetch } from './http';
import { isKnownRoute } from './navigation';

/**
 * Avisos no celular (Fase 8c, ADR 033): o que cada tipo cobre, os aparelhos
 * cadastrados e para onde o toque leva. O aviso só chega pelo app; a web
 * mostra as mesmas chaves e os celulares para quem quer mudar de lá.
 */

export type NotificationKind = 'COMMUNITY' | 'CHALLENGES' | 'FEED' | 'MODERATION';
export type DevicePlatform = 'IOS' | 'ANDROID';
export type NotificationPreferences = Record<NotificationKind, boolean>;

export interface UserDevice {
  id: string;
  platform: DevicePlatform;
  createdAt: string;
  lastSeenAt: string;
}

/** Na ordem em que as chaves aparecem. */
export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'COMMUNITY',
  'CHALLENGES',
  'FEED',
  'MODERATION',
];

export const NOTIFICATION_KIND_INFO: Record<NotificationKind, { label: string; hint: string }> = {
  COMMUNITY: {
    label: 'Comunidades',
    hint: 'Convites, pedidos para entrar e entrada aprovada.',
  },
  CHALLENGES: {
    label: 'Desafios',
    hint: 'Desafio novo na comunidade e o fim dos desafios em que você entrou.',
  },
  FEED: {
    label: 'Comentários',
    hint: 'Quando alguém comenta um post seu no mural.',
  },
  MODERATION: {
    label: 'Moderação',
    hint: 'Quando a equipe remove um post ou comentário seu.',
  },
};

export const DEVICE_PLATFORM_LABEL: Record<DevicePlatform, string> = {
  IOS: 'iPhone',
  ANDROID: 'Android',
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const notificationsApi = {
  preferences: () => apiFetch<NotificationPreferences>('/api/users/me/notifications'),
  setPreferences: (input: Partial<NotificationPreferences>) =>
    apiFetch<NotificationPreferences>('/api/users/me/notifications', json('PUT', input)),
  devices: () => apiFetch<UserDevice[]>('/api/users/me/devices'),
  registerDevice: (input: { token: string; platform: DevicePlatform }) =>
    apiFetch<UserDevice>('/api/users/me/devices', json('POST', input)),
  removeDevice: (id: string) =>
    apiFetch<{ removed: true }>(`/api/users/me/devices/${id}`, json('DELETE')),
};

/**
 * Para onde o toque no aviso leva. O `url` vem do servidor, mas passa por aqui
 * antes de virar navegação: só caminho interno, de uma tela que existe — nunca
 * outro esquema, outro host (`//`) ou rota inventada. Fora disso, `null`, e o
 * app só abre.
 */
export function notificationTarget(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const url = (data as { url?: unknown }).url;
  if (typeof url !== 'string' || url.length > 300) return null;
  if (!/^\/(?!\/)[A-Za-z0-9/_-]*$/.test(url)) return null;
  if (/^\/c\/[A-Za-z0-9_-]+$/.test(url)) return url;
  return isKnownRoute(url) ? url : null;
}

/** "Android · usado hoje" — o rótulo do celular na lista. */
export function deviceLabel(d: UserDevice, now = new Date()): string {
  const dias = Math.floor((now.getTime() - new Date(d.lastSeenAt).getTime()) / 86_400_000);
  const quando = dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;
  return `${DEVICE_PLATFORM_LABEL[d.platform]} · usado ${quando}`;
}
