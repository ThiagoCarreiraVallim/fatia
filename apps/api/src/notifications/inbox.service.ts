import { Injectable } from '@nestjs/common';
import type { InboxNotice, NotificationKind } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';

/** Avisos mais velhos que isto saem na próxima gravação para a pessoa. */
export const INBOX_RETENTION_DAYS = 90;
/** Quantos avisos a central mostra: os mais recentes. */
export const INBOX_LIST_LIMIT = 50;
/** Ids por chamada de "marcar como lido". */
export const INBOX_MARK_MAX = 100;

/**
 * A resposta do chat pronta e o lembrete pessoal (#389) são avisos de momento:
 * não ficam na central. O lembrete que passou não é novidade para rever depois.
 */
const FORA_DA_CENTRAL: readonly NotificationKind[] = ['CHAT', 'REMINDERS'];

export type InboxItem = Pick<
  InboxNotice,
  'id' | 'kind' | 'title' | 'body' | 'url' | 'readAt' | 'createdAt'
>;

export interface InboxList {
  items: InboxItem[];
  unread: number;
}

const ITEM_SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  url: true,
  readAt: true,
  createdAt: true,
} as const;

/**
 * Grava o aviso na central de cada pessoa (#373). Chamado pelo envio, com o
 * título e o texto já cortados — os mesmos do push, sem dado de saúde.
 *
 * Função, e não método do `InboxService`, para o `NotificationService` gravar
 * sem ganhar dependência nova (os testes dos gatilhos o constroem à mão).
 */
export async function recordInbox(
  prisma: PrismaService,
  userIds: readonly string[],
  notice: { kind: NotificationKind; title: string; body: string; url: string },
  now: Date = new Date(),
): Promise<void> {
  if (userIds.length === 0 || FORA_DA_CENTRAL.includes(notice.kind)) return;
  const limite = new Date(now.getTime() - INBOX_RETENTION_DAYS * 86_400_000);
  await prisma.inboxNotice.deleteMany({
    where: { userId: { in: [...userIds] }, createdAt: { lt: limite } },
  });
  await prisma.inboxNotice.createMany({
    data: userIds.map((userId) => ({
      userId,
      kind: notice.kind,
      title: notice.title,
      body: notice.body,
      url: notice.url,
    })),
  });
}

/**
 * A central de avisos do sino: listar e marcar como lido. Tudo amarrado ao
 * `userId` de quem está logado — o id que chega no corpo só marca se for dele.
 */
@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, limit = INBOX_LIST_LIMIT): Promise<InboxList> {
    const [items, unread] = await Promise.all([
      this.prisma.inboxNotice.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: Math.min(Math.max(1, limit), INBOX_LIST_LIMIT),
        select: ITEM_SELECT,
      }),
      this.unreadCount(userId),
    ]);
    return { items, unread };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.inboxNotice.count({ where: { userId, readAt: null } });
  }

  /** Sem `ids`, marca todos. Id de outra pessoa (ou inexistente) é ignorado. */
  async markRead(userId: string, ids?: readonly string[]): Promise<{ updated: number }> {
    const r = await this.prisma.inboxNotice.updateMany({
      where: {
        userId,
        readAt: null,
        ...(ids ? { id: { in: ids.slice(0, INBOX_MARK_MAX) } } : {}),
      },
      data: { readAt: new Date() },
    });
    return { updated: r.count };
  }
}
