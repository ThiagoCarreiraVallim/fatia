import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationKind, ReminderKind, ReminderMode, type Reminder } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import { dayBoundsInTz } from '../../progress/helpers/date-tz';
import { NotificationService } from '../notification.service';
import {
  DAILY_PUSH_CAP,
  dueSlot,
  groupedReminderNotice,
  inQuietHours,
  localClock,
  mealTypeAt,
  reminderNotice,
  reminderTitle,
  type LocalClock,
} from './reminder-rules';

const EVERY_MS = 60_000;
/** Sem meta salva, as mesmas de `UserGoals`. */
const DEFAULT_WATER_ML = 2500;
const DEFAULT_STEPS = 8000;

type DueReminder = Reminder & { slot: number };

/**
 * O envio dos lembretes pessoais pelo servidor (#389). A cada minuto, para
 * cada pessoa com lembrete ligado e fora do silêncio noturno, no fuso dela:
 *
 * 1. pega os horários que venceram agora (`dueSlot`) e os reserva — um
 *    `updateMany` condicionado ao `lastSentAt`, para duas instâncias da API não
 *    mandarem o mesmo lembrete duas vezes;
 * 2. cala o que já foi feito (água batida, a refeição registrada, a pesagem do
 *    dia, o treino começado, os passos acima da meta);
 * 3. respeita o teto do dia (`DAILY_PUSH_CAP`) e junta o que sobrou num aviso só.
 *
 * O texto nunca leva valor (copos, passos, peso): aparece na tela bloqueada.
 * O tipo `REMINDERS` não entra na central do sino.
 */
@Injectable()
export class ReminderJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderJob.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.run(new Date()).catch((err: unknown) =>
        this.logger.warn(
          `Envio dos lembretes falhou: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Uma rodada. Devolve quantas pessoas receberam aviso. */
  async run(now: Date): Promise<number> {
    const rows = await this.prisma.reminder.findMany({
      where: { enabled: true, kind: { not: ReminderKind.HABIT } },
      include: {
        user: {
          select: { timezone: true, quietHoursEnabled: true, quietFrom: true, quietTo: true },
        },
      },
      orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
    });
    const porPessoa = new Map<string, typeof rows>();
    for (const r of rows) porPessoa.set(r.userId, [...(porPessoa.get(r.userId) ?? []), r]);

    let avisadas = 0;
    for (const [userId, lista] of porPessoa) {
      const user = lista[0]!.user;
      const clock = localClock(now, user.timezone);
      const quiet = { enabled: user.quietHoursEnabled, from: user.quietFrom, to: user.quietTo };
      if (inQuietHours(clock.minute, quiet)) continue;
      try {
        if (await this.runFor(userId, user.timezone, lista, clock, now)) avisadas += 1;
      } catch (err: unknown) {
        this.logger.warn(
          `Lembretes de uma pessoa falharam: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return avisadas;
  }

  private async runFor(
    userId: string,
    timezone: string,
    lista: Reminder[],
    clock: LocalClock,
    now: Date,
  ): Promise<boolean> {
    const vencidos: DueReminder[] = [];
    for (const r of lista) {
      const slot = dueSlot(r, clock, now, r.lastSentAt);
      if (slot === null) continue;
      // Reserva: só quem trocar o `lastSentAt` de antes manda.
      const reservado = await this.prisma.reminder.updateMany({
        where: { id: r.id, userId, lastSentAt: r.lastSentAt },
        data: { lastSentAt: now },
      });
      if (reservado.count === 1) vencidos.push({ ...r, slot });
    }
    if (vencidos.length === 0) return false;

    const pendentes: DueReminder[] = [];
    for (const r of vencidos) {
      if (!(await this.alreadyDone(userId, timezone, r, clock, now))) pendentes.push(r);
    }
    const enviadosHoje = lista
      .filter((r) => r.sentDate === clock.date)
      .reduce((n, r) => n + r.sentCount, 0);
    const cabem = pendentes.slice(0, Math.max(0, DAILY_PUSH_CAP - enviadosHoje));
    if (cabem.length === 0) return false;

    const texto =
      cabem.length === 1
        ? reminderNotice(cabem[0]!.kind, cabem[0]!.slot)
        : groupedReminderNotice(cabem.map(reminderTitle));
    this.notifications.notify([userId], { kind: NotificationKind.REMINDERS, ...texto });
    for (const r of cabem) {
      await this.prisma.reminder.updateMany({
        where: { id: r.id, userId },
        data:
          r.sentDate === clock.date
            ? { sentCount: { increment: 1 } }
            : { sentDate: clock.date, sentCount: 1 },
      });
    }
    return true;
  }

  /** O lembrete ficou sem razão de ser: a pessoa já fez o que ele pede. */
  private async alreadyDone(
    userId: string,
    timezone: string,
    r: DueReminder,
    clock: LocalClock,
    now: Date,
  ): Promise<boolean> {
    const { start, end } = dayBoundsInTz(clock.date, timezone);
    switch (r.kind) {
      case ReminderKind.WATER: {
        const [soma, metas] = await Promise.all([
          this.prisma.waterLog.aggregate({
            where: { userId, date: clock.date },
            _sum: { ml: true },
          }),
          this.prisma.userGoals.findUnique({
            where: { userId },
            select: { dailyWaterTargetMl: true },
          }),
        ]);
        if ((soma._sum.ml ?? 0) >= (metas?.dailyWaterTargetMl ?? DEFAULT_WATER_ML)) return true;
        // "A cada 2 h": quem bebeu dentro da última janela não precisa do aviso.
        if (r.mode === ReminderMode.INTERVAL && r.everyHours) {
          const recente = await this.prisma.waterLog.count({
            where: { userId, loggedAt: { gt: new Date(now.getTime() - r.everyHours * 3_600_000) } },
          });
          return recente > 0;
        }
        return false;
      }
      case ReminderKind.MEAL:
        return (
          (await this.prisma.meal.count({
            where: { userId, mealType: mealTypeAt(r.slot), eatenAt: { gte: start, lt: end } },
          })) > 0
        );
      case ReminderKind.WEIGHT:
        return (
          (await this.prisma.weightLog.count({
            where: { userId, loggedAt: { gte: start, lt: end } },
          })) > 0
        );
      case ReminderKind.WORKOUT:
        return (
          (await this.prisma.workoutSession.count({
            where: { userId, startedAt: { gte: start, lt: end } },
          })) > 0
        );
      case ReminderKind.STEPS: {
        const [maior, metas] = await Promise.all([
          // Passos do dia = o maior registro (ADR 007).
          this.prisma.stepLog.aggregate({
            where: { userId, date: clock.date },
            _max: { steps: true },
          }),
          r.stepsBelow == null
            ? this.prisma.userGoals.findUnique({
                where: { userId },
                select: { dailyStepsTarget: true },
              })
            : Promise.resolve(null),
        ]);
        const alvo = r.stepsBelow ?? metas?.dailyStepsTarget ?? DEFAULT_STEPS;
        return (maior._max.steps ?? 0) >= alvo;
      }
      case ReminderKind.HABIT:
        return false;
    }
  }
}
