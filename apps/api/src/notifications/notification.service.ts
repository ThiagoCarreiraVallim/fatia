import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DevicePlatform, NotificationKind } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { EXPO_PUSH_TOKEN, PushService } from './push.service';

export const NOTIFICATION_KINDS = Object.values(NotificationKind);
export const DEVICE_PLATFORMS = Object.values(DevicePlatform);
/** Aparelhos por pessoa. Passou disso, sai o que está há mais tempo sem abrir o app. */
export const MAX_DEVICES = 10;
const TITLE_MAX = 80;
const BODY_MAX = 160;

/** A Expo pede para ler o recibo uns 15 minutos depois do envio. */
export const RECEIPT_DELAY_MS = 15 * 60_000;
/** Ticket sem recibo depois disto é esquecido: a Expo guarda recibo por 24 h. */
export const TICKET_MAX_AGE_MS = 24 * 60 * 60_000;
/** Janela em que avisos do mesmo tipo e assunto viram um só (comentários num post). */
export const GROUP_WINDOW_MS = 10 * 60_000;
const RECEIPTS_EVERY_MS = 15 * 60_000;
const GROUPED_EVERY_MS = 60_000;

/** Um aviso, já sem dado de saúde: aparece na tela bloqueada. */
export interface Notice {
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
}

export interface DeviceView {
  id: string;
  platform: DevicePlatform;
  createdAt: Date;
  lastSeenAt: Date;
}

export type NotificationPreferences = Record<NotificationKind, boolean>;

const DEVICE_SELECT = { id: true, platform: true, createdAt: true, lastSeenAt: true } as const;

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * Avisos no celular (Fase 8c, ADR 033): os aparelhos de cada pessoa, o que ela
 * quer receber e a entrega.
 *
 * `notify` não espera a entrega: quem comentou um post não fica parado na ida
 * até a Expo. O envio corre em segundo plano, e erro nele vira log — nunca
 * desfaz nem derruba a ação que gerou o aviso. `drain` espera o que estiver
 * pendente (testes e desligamento da API).
 */
@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private readonly pending = new Set<Promise<void>>();
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  onModuleInit(): void {
    const tarefa = (nome: string, fn: () => Promise<unknown>) => () =>
      void fn().catch((err: unknown) =>
        this.logger.warn(`${nome} falhou: ${err instanceof Error ? err.message : String(err)}`),
      );
    // `unref`: os timers não seguram o processo (nem o jest) só por existir.
    for (const [fn, ms] of [
      [
        tarefa('Leitura dos recibos de push', () => this.checkReceipts(new Date())),
        RECEIPTS_EVERY_MS,
      ],
      [tarefa('Envio dos avisos agrupados', () => this.flushGrouped(new Date())), GROUPED_EVERY_MS],
    ] as const) {
      const t = setInterval(fn, ms);
      t.unref();
      this.timers.push(t);
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers.length = 0;
    await this.drain();
  }

  // ---------------------------------------------------------------- aparelhos

  /**
   * Cadastra o celular de quem está logado. O token é único: se ele estava em
   * outra conta (alguém saiu e outra pessoa entrou no mesmo aparelho), passa
   * para esta — senão a conta anterior continuaria recebendo os avisos aqui.
   */
  async registerDevice(
    userId: string,
    input: { token: string; platform: DevicePlatform },
  ): Promise<DeviceView> {
    const token = input.token.trim();
    if (!EXPO_PUSH_TOKEN.test(token)) throw new BadRequestException('Token de push inválido');
    const agora = new Date();
    const device = await this.prisma.userDevice.upsert({
      where: { token },
      create: { userId, token, platform: input.platform, lastSeenAt: agora },
      update: { userId, platform: input.platform, lastSeenAt: agora },
      select: DEVICE_SELECT,
    });
    const sobra = await this.prisma.userDevice.findMany({
      where: { userId },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
      skip: MAX_DEVICES,
      select: { id: true },
    });
    if (sobra.length > 0) {
      await this.prisma.userDevice.deleteMany({ where: { id: { in: sobra.map((d) => d.id) } } });
    }
    return device;
  }

  listDevices(userId: string): Promise<DeviceView[]> {
    return this.prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: DEVICE_SELECT,
    });
  }

  /** Só o próprio aparelho: o de outra pessoa responde como se não existisse. */
  async removeDevice(userId: string, deviceId: string): Promise<{ removed: true }> {
    const r = await this.prisma.userDevice.deleteMany({ where: { id: deviceId, userId } });
    if (r.count === 0) throw new NotFoundException('Device not found');
    return { removed: true };
  }

  // ---------------------------------------------------------------- preferências

  /** Sem linha gravada, o tipo está ligado. */
  async preferences(userId: string): Promise<NotificationPreferences> {
    const linhas = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const prefs = Object.fromEntries(
      NOTIFICATION_KINDS.map((k) => [k, true]),
    ) as NotificationPreferences;
    for (const l of linhas) prefs[l.kind] = l.enabled;
    return prefs;
  }

  async setPreferences(
    userId: string,
    input: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const mudancas = NOTIFICATION_KINDS.filter((k) => typeof input[k] === 'boolean');
    await this.prisma.$transaction(
      mudancas.map((kind) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_kind: { userId, kind } },
          create: { userId, kind, enabled: input[kind]! },
          update: { enabled: input[kind]! },
        }),
      ),
    );
    return this.preferences(userId);
  }

  // ---------------------------------------------------------------- envio

  /** Dispara e não espera. Lista vazia ou só gente com o tipo desligado não faz nada. */
  notify(userIds: readonly string[], notice: Notice): void {
    this.track(this.deliver([...new Set(userIds)], notice), notice.kind);
  }

  /**
   * Avisos em sequência sobre a mesma coisa viram um só (Fase 9g). O primeiro
   * sai na hora; os que chegam dentro da janela de `GROUP_WINDOW_MS` são
   * contados e saem juntos no fim dela (`flushGrouped`), com `grouped(n)`.
   */
  notifyGrouped(userId: string, key: string, notice: Notice, community: string): void {
    this.track(this.deliverGrouped(userId, key, notice, community), notice.kind);
  }

  private async deliverGrouped(
    userId: string,
    key: string,
    notice: Notice,
    community: string,
  ): Promise<void> {
    const agora = new Date();
    // Atômico: dois comentários ao mesmo tempo não mandam dois avisos.
    const contado = await this.prisma.pendingNotice.updateMany({
      where: { key, userId, windowEndsAt: { gt: agora } },
      data: { count: { increment: 1 } },
    });
    if (contado.count > 0) return;
    const windowEndsAt = new Date(agora.getTime() + GROUP_WINDOW_MS);
    await this.prisma.pendingNotice.upsert({
      where: { key_userId: { key, userId } },
      create: { key, userId, kind: notice.kind, community, url: notice.url, windowEndsAt },
      update: { count: 0, community, url: notice.url, windowEndsAt },
    });
    await this.deliver([userId], notice);
  }

  /** Fecha as janelas vencidas: quem teve mais avisos nelas recebe um, com o total. */
  async flushGrouped(now: Date): Promise<number> {
    const vencidas = await this.prisma.pendingNotice.findMany({
      where: { windowEndsAt: { lte: now } },
      take: 500,
    });
    let enviados = 0;
    for (const v of vencidas) {
      if (v.count > 0) {
        await this.deliver([v.userId], groupedNotice(v.kind, v.count, v.community, v.url));
        enviados += 1;
      }
      await this.prisma.pendingNotice.deleteMany({
        where: { key: v.key, userId: v.userId, windowEndsAt: { lte: now } },
      });
    }
    return enviados;
  }

  /**
   * Lê os recibos dos envios com mais de `RECEIPT_DELAY_MS` (Fase 9g):
   * `DeviceNotRegistered` apaga o aparelho; credencial errada ou excesso de
   * envio viram alerta no log. Ticket lido, ou velho demais, sai.
   */
  async checkReceipts(now: Date): Promise<{ read: number; removedDevices: number }> {
    await this.prisma.pushTicket.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - TICKET_MAX_AGE_MS) } },
    });
    const tickets = await this.prisma.pushTicket.findMany({
      where: { createdAt: { lte: new Date(now.getTime() - RECEIPT_DELAY_MS) } },
      orderBy: { createdAt: 'asc' },
      take: 5000,
      select: { id: true, deviceId: true },
    });
    if (tickets.length === 0) return { read: 0, removedDevices: 0 };
    const recibos = await this.push.receipts(tickets.map((t) => t.id));
    const mortos = new Set<string>();
    for (const t of tickets) {
      const r = recibos[t.id];
      if (r?.status !== 'error') continue;
      const motivo = r.details?.error ?? r.message ?? 'sem motivo';
      if (motivo === 'DeviceNotRegistered') mortos.add(t.deviceId);
      // Sem o token no log, como no envio.
      else this.logger.warn(`Recibo de push com erro: ${motivo}`);
    }
    if (mortos.size > 0) {
      await this.prisma.userDevice.deleteMany({ where: { id: { in: [...mortos] } } });
    }
    const lidos = tickets.filter((t) => recibos[t.id]).map((t) => t.id);
    if (lidos.length > 0) await this.prisma.pushTicket.deleteMany({ where: { id: { in: lidos } } });
    return { read: lidos.length, removedDevices: mortos.size };
  }

  private track(p: Promise<void>, kind: NotificationKind): void {
    const q = p
      .catch((err: unknown) =>
        this.logger.warn(
          `Aviso "${kind}" não saiu: ${err instanceof Error ? err.message : String(err)}`,
        ),
      )
      .finally(() => this.pending.delete(q));
    this.pending.add(q);
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  private async deliver(userIds: string[], notice: Notice): Promise<void> {
    if (userIds.length === 0) return;
    const desligados = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, kind: notice.kind, enabled: false },
      select: { userId: true },
    });
    const fora = new Set(desligados.map((d) => d.userId));
    const alvo = userIds.filter((id) => !fora.has(id));
    if (alvo.length === 0) return;
    const devices = await this.prisma.userDevice.findMany({
      where: { userId: { in: alvo } },
      select: { id: true, token: true },
    });
    const title = cut(notice.title, TITLE_MAX);
    const body = cut(notice.body, BODY_MAX);
    const r = await this.push.send(
      devices.map((d) => ({ to: d.token, title, body, url: notice.url })),
    );
    if (r.unregistered.length > 0) {
      await this.prisma.userDevice.deleteMany({ where: { token: { in: r.unregistered } } });
    }
    const porToken = new Map(devices.map((d) => [d.token, d.id]));
    const tickets = r.tickets.flatMap((t) => {
      const deviceId = porToken.get(t.to);
      return deviceId ? [{ id: t.id, deviceId }] : [];
    });
    if (tickets.length > 0) {
      await this.prisma.pushTicket.createMany({ data: tickets, skipDuplicates: true });
    }
  }
}

/** O aviso que fecha uma janela: só a contagem, nunca o que foi escrito. */
export function groupedNotice(
  kind: NotificationKind,
  count: number,
  community: string,
  url: string,
): Notice {
  return {
    kind,
    title: count === 1 ? 'Mais 1 comentário no seu post' : `Mais ${count} comentários no seu post`,
    body: `No mural de ${community}.`,
    url,
  };
}
