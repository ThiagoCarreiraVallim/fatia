import type { NotificationService } from '../notification.service';

/** Para os testes que não olham avisos: aceita tudo e não manda nada. */
export const silentNotifications = {
  notify: () => undefined,
  drain: async () => undefined,
} as unknown as NotificationService;
