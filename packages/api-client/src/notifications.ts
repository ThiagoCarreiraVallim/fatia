import { apiFetch } from './http';
import { isKnownRoute } from './navigation';

/**
 * Avisos no celular (Fase 8c, ADR 033): o que cada tipo cobre, os aparelhos
 * cadastrados e para onde o toque leva. O aviso só chega pelo app; a web
 * mostra as mesmas chaves e os celulares para quem quer mudar de lá.
 */

export type NotificationKind =
  | 'COMMUNITY'
  | 'CHALLENGES'
  | 'FEED'
  | 'MODERATION'
  | 'CHAT'
  | 'ANNOUNCEMENTS'
  | 'PLAN_RECEIVED'
  | 'ASSESSMENT_REQUESTED'
  | 'QUESTIONNAIRE'
  | 'SCHEDULE'
  | 'SCHEDULE_REMINDER'
  | 'BIRTHDAY'
  | 'REMINDERS'
  | 'BILLING';
export type DevicePlatform = 'IOS' | 'ANDROID';
export type NotificationPreferences = Record<NotificationKind, boolean>;

export interface UserDevice {
  id: string;
  platform: DevicePlatform;
  createdAt: string;
  lastSeenAt: string;
}

/** Todos os tipos, na ordem do banco. */
export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'COMMUNITY',
  'CHALLENGES',
  'FEED',
  'MODERATION',
  'CHAT',
  'ANNOUNCEMENTS',
  'PLAN_RECEIVED',
  'ASSESSMENT_REQUESTED',
  'QUESTIONNAIRE',
  'SCHEDULE',
  'SCHEDULE_REMINDER',
  'BIRTHDAY',
  'REMINDERS',
  'BILLING',
];

/**
 * Tipos sem chave na tela: cada lembrete tem a sua (`REMINDERS`), e os avisos
 * de cobrança e de fim do teste (`BILLING`, #386) não se desligam — perder um
 * deles é perder a IA sem saber.
 */
type WithoutToggle = 'REMINDERS' | 'BILLING';

/** Tom do ícone, no vocabulário do `chipic` da prancha. */
export type IconTone = 'lime' | 'blue' | 'water' | 'amber' | 'brand' | 'pink' | 'neutral';

export interface NotificationKindInfo {
  label: string;
  hint: string;
  /** Nome do ícone do design system (`@fatia/design`). */
  icon: string;
  tone: IconTone;
}

/**
 * Cada chave da tela de Notificações (prancha Al-V4, #389), com o texto, o
 * ícone e o tom da prancha. `REMINDERS` e `BILLING` não têm chave.
 */
export const NOTIFICATION_KIND_INFO: Record<
  Exclude<NotificationKind, WithoutToggle>,
  NotificationKindInfo
> = {
  PLAN_RECEIVED: {
    label: 'Plano novo',
    hint: 'Treino ou alimentação enviados para você',
    icon: 'dumbbell',
    tone: 'brand',
  },
  ASSESSMENT_REQUESTED: {
    label: 'Avaliação pedida',
    hint: 'Quando pedem uma avaliação, com o prazo',
    icon: 'ruler',
    tone: 'brand',
  },
  QUESTIONNAIRE: {
    label: 'Questionário',
    hint: 'Perguntas depois do treino ou da semana',
    icon: 'review',
    tone: 'brand',
  },
  COMMUNITY: {
    label: 'Comunidade',
    hint: 'Novidades e conteúdo da sua academia',
    icon: 'users',
    tone: 'brand',
  },
  ANNOUNCEMENTS: {
    label: 'Comunicados da comunidade',
    hint: 'O que a equipe manda para todos · separado dos lembretes',
    icon: 'mega',
    tone: 'brand',
  },
  SCHEDULE: {
    label: 'Agenda da comunidade',
    hint: 'Eventos novos e mudança de horário',
    icon: 'cal',
    tone: 'brand',
  },
  SCHEDULE_REMINDER: {
    label: 'Treino do dia',
    hint: 'Só quando a comunidade tem agenda · 1 h antes',
    icon: 'clock',
    tone: 'lime',
  },
  CHALLENGES: {
    label: 'Desafios',
    hint: 'Início, posição e resultado',
    icon: 'trophy',
    tone: 'amber',
  },
  FEED: {
    label: 'Mural',
    hint: 'Reações e comentários nos seus posts',
    icon: 'mega',
    tone: 'blue',
  },
  MODERATION: {
    label: 'Moderação',
    hint: 'Quando algo seu é revisado',
    icon: 'shield',
    tone: 'neutral',
  },
  CHAT: {
    label: 'Chat com a IA',
    hint: 'Quando a resposta fica pronta',
    icon: 'spark',
    tone: 'lime',
  },
  BIRTHDAY: {
    label: 'Aniversário',
    hint: 'Um parabéns da comunidade no seu dia',
    icon: 'gift',
    tone: 'pink',
  },
};

export interface NotificationGroupItem extends NotificationKindInfo {
  kind: Exclude<NotificationKind, WithoutToggle>;
}

export interface NotificationGroup {
  title: string;
  /** À direita do título: o nome da equipe em "Da sua equipe". */
  detail: string | null;
  items: NotificationGroupItem[];
}

const GROUPS: { title: string; team?: true; kinds: NotificationGroupItem['kind'][] }[] = [
  {
    title: 'Da sua equipe',
    team: true,
    kinds: ['PLAN_RECEIVED', 'ASSESSMENT_REQUESTED', 'QUESTIONNAIRE'],
  },
  {
    title: 'Comunidade',
    kinds: [
      'COMMUNITY',
      'ANNOUNCEMENTS',
      'SCHEDULE',
      'SCHEDULE_REMINDER',
      'CHALLENGES',
      'FEED',
      'MODERATION',
      'CHAT',
    ],
  },
  { title: 'Opcional', kinds: ['BIRTHDAY'] },
];

/**
 * Os três grupos da prancha Al-V4. "Da sua equipe" só aparece para quem está
 * numa comunidade com equipe, e leva o nome dela à direita.
 */
export function notificationGroups(ctx: { team: { name: string } | null }): NotificationGroup[] {
  return GROUPS.filter((g) => !g.team || ctx.team).map((g) => ({
    title: g.title,
    detail: g.team ? (ctx.team?.name ?? null) : null,
    items: g.kinds.map((kind) => ({ kind, ...NOTIFICATION_KIND_INFO[kind] })),
  }));
}

/**
 * "Avisos chegam agrupados": a prévia de como o aviso chega, pelo que está
 * ligado (prancha Al-V4). A equipe e a comunidade são as da pessoa; o "5" é só
 * a amostra da contagem — o aviso nunca traz conteúdo.
 */
export function notificationPreview(
  prefs: NotificationPreferences,
  ctx: { team: { name: string } | null; community: { name: string } | null },
): string {
  const onde = ctx.community ? `em ${ctx.community.name}` : 'na sua comunidade';
  const novidades = `5 novidades ${onde}`;
  if (ctx.team && prefs.PLAN_RECEIVED)
    return `${ctx.team.name} enviou um plano novo · ${novidades}`;
  if (prefs.COMMUNITY) return novidades;
  const algum = GROUPS[1]!.kinds.some((k) => prefs[k]);
  return algum ? 'Sua resposta do chat está pronta' : 'Tudo desligado';
}

/** A tela de Notificações inteira (`GET /users/me/notification-settings`). */
export interface NotificationSettings {
  preferences: NotificationPreferences;
  quietHours: QuietHours;
  team: { name: string } | null;
  community: { name: string } | null;
}

/** Silêncio noturno, em "hh:mm" no fuso da pessoa. */
export interface QuietHours {
  enabled: boolean;
  from: string;
  to: string;
}

export const DEVICE_PLATFORM_LABEL: Record<DevicePlatform, string> = {
  IOS: 'iPhone',
  ANDROID: 'Android',
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** Um aviso da central do sino no Hoje (#373). */
export interface InboxItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Caminho do toque, o mesmo do push. */
  url: string;
  readAt: string | null;
  createdAt: string;
}

export const inboxApi = {
  list: () => apiFetch<{ items: InboxItem[]; unread: number }>('/api/users/me/inbox'),
  /** Sem `ids`, marca todos. */
  markRead: (ids?: string[]) =>
    apiFetch<{ updated: number }>('/api/users/me/inbox/read', json('POST', ids ? { ids } : {})),
};

export const notificationsApi = {
  settings: () => apiFetch<NotificationSettings>('/api/users/me/notification-settings'),
  setQuietHours: (input: Partial<QuietHours>) =>
    apiFetch<QuietHours>('/api/users/me/quiet-hours', json('PUT', input)),
  preferences: () => apiFetch<NotificationPreferences>('/api/users/me/notifications'),
  setPreferences: (input: Partial<NotificationPreferences>) =>
    apiFetch<NotificationPreferences>('/api/users/me/notifications', json('PUT', input)),
  devices: () => apiFetch<UserDevice[]>('/api/users/me/devices'),
  registerDevice: (input: { token: string; platform: DevicePlatform }) =>
    apiFetch<UserDevice>('/api/users/me/devices', json('POST', input)),
  removeDevice: (id: string) =>
    apiFetch<{ removed: true }>(`/api/users/me/devices/${id}`, json('DELETE')),
  /** Push no navegador (Fase 9g): `publicKey: null` é "desligado nesta instância". */
  webPushStatus: () =>
    apiFetch<{ publicKey: string | null; subscriptions: number }>('/api/users/me/web-push'),
  subscribeWebPush: (input: { endpoint: string; p256dh: string; auth: string }) =>
    apiFetch<{ subscribed: true }>('/api/users/me/web-push', json('POST', input)),
  unsubscribeWebPush: (endpoint: string) =>
    apiFetch<{ removed: boolean }>(
      '/api/users/me/web-push/unsubscribe',
      json('POST', { endpoint }),
    ),
};

/** A chave VAPID (base64url) no formato que o `PushManager.subscribe` pede. */
export function vapidKeyBytes(base64url: string): Uint8Array {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

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
