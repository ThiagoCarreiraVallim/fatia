import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { DevicePlatform, NotificationKind } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { EXPO_PUSH_TOKEN, PushService } from './push.service';

export const NOTIFICATION_KINDS = Object.values(NotificationKind);
export const DEVICE_PLATFORMS = Object.values(DevicePlatform);
/** Aparelhos por pessoa. Passou disso, sai o que está há mais tempo sem abrir o app. */
export const MAX_DEVICES = 10;
const TITLE_MAX = 80;
const BODY_MAX = 160;

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
export class NotificationService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async onModuleDestroy(): Promise<void> {
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
    const p = this.deliver([...new Set(userIds)], notice)
      .catch((err: unknown) =>
        this.logger.warn(
          `Aviso "${notice.kind}" não saiu: ${err instanceof Error ? err.message : String(err)}`,
        ),
      )
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
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
      select: { token: true },
    });
    const title = cut(notice.title, TITLE_MAX);
    const body = cut(notice.body, BODY_MAX);
    const r = await this.push.send(
      devices.map((d) => ({ to: d.token, title, body, url: notice.url })),
    );
    if (r.unregistered.length > 0) {
      await this.prisma.userDevice.deleteMany({ where: { token: { in: r.unregistered } } });
    }
  }
}
