import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StepSource } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { CreateStepLogDto, ListStepLogsDto, UpdateStepLogDto } from './dto/step-log.dto';
import { addDaysIso, todayInTz } from './helpers/date-tz';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class StepLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStepLogDto, userId: string, timezone: string) {
    const date = dto.date ?? todayInTz(timezone);
    return this.prisma.stepLog.create({
      data: {
        userId,
        date,
        steps: dto.steps,
        source: dto.source ?? StepSource.MANUAL,
        notes: dto.notes ?? null,
      },
    });
  }

  async findById(id: string, userId: string) {
    const log = await this.prisma.stepLog.findUnique({ where: { id } });
    if (!log || log.userId !== userId) throw new NotFoundException('Step log not found');
    return log;
  }

  async update(id: string, dto: UpdateStepLogDto, userId: string) {
    await this.findById(id, userId);
    return this.prisma.stepLog.update({
      where: { id },
      data: {
        ...(dto.steps !== undefined && { steps: dto.steps }),
        ...(dto.date && { date: dto.date }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async delete(id: string, userId: string) {
    const log = await this.prisma.stepLog.findUnique({ where: { id } });
    // Mesma resposta para "não existe" e "não é seu" (§IDs de docs/MCP.md).
    if (!log || log.userId !== userId) throw new NotFoundException('Step log not found');
    await this.prisma.stepLog.delete({ where: { id } });
    return { deleted: true as const };
  }

  async list(filter: ListStepLogsDto, userId: string) {
    const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where: Prisma.StepLogWhereInput = { userId };
    if (filter.from || filter.to) {
      where.date = {};
      if (filter.from) where.date.gte = filter.from;
      if (filter.to) where.date.lte = filter.to;
    }
    const items = await this.prisma.stepLog.findMany({
      where,
      orderBy: [{ date: 'desc' }, { loggedAt: 'desc' }],
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });
    const nextCursor = items.length > limit ? items[limit - 1].id : undefined;
    return { logs: items.slice(0, limit), nextCursor };
  }

  /**
   * Política ADR 007: maior valor entre os logs do dia.
   */
  async getStepsForDate(date: string, userId: string) {
    const logs = await this.prisma.stepLog.findMany({
      where: { userId, date },
      orderBy: { loggedAt: 'desc' },
    });
    if (logs.length === 0) {
      return { date, steps: 0, logCount: 0, sources: [] as StepSource[] };
    }
    const max = logs.reduce((acc, l) => (l.steps > acc ? l.steps : acc), 0);
    const sources = Array.from(new Set(logs.map((l) => l.source)));
    return { date, steps: max, logCount: logs.length, sources };
  }

  /**
   * O valor efetivo do dia contra a meta de passos. Sem dia, é hoje no fuso da pessoa; sem
   * meta definida, `goalReached` e `goalTarget` são `null`.
   */
  async getStepsForDateWithGoal(date: string | undefined, userId: string, timezone: string) {
    const result = await this.getStepsForDate(date ?? todayInTz(timezone), userId);
    const target = await this.dailyTarget(userId);
    return {
      ...result,
      goalReached: target !== null ? result.steps >= target : null,
      goalTarget: target,
    };
  }

  /**
   * A série do histórico com a meta de cada dia, a média diária (sobre a janela inteira,
   * dias sem log contam como zero), os dias que bateram a meta e os dias com algum registro.
   */
  async getHistoryWithGoal(days: number, userId: string, timezone: string) {
    const series = await this.getHistory(days, userId, timezone);
    const target = await this.dailyTarget(userId);
    const withGoal = series.map((p) => ({
      ...p,
      goalReached: target !== null ? p.steps >= target : null,
    }));
    const totalDaysLogged = withGoal.filter((d) => d.steps > 0).length;
    const totalSteps = withGoal.reduce((a, p) => a + p.steps, 0);
    const averageDaily = withGoal.length ? totalSteps / withGoal.length : 0;
    const daysWithGoalReached =
      target !== null ? withGoal.filter((d) => d.steps >= target).length : 0;
    return { days: withGoal, averageDaily, daysWithGoalReached, totalDaysLogged };
  }

  /** Registra e devolve o valor efetivo do dia do registro (o maior, ADR 007), contra a meta. */
  async logWithDayTotal(dto: CreateStepLogDto, userId: string, timezone: string) {
    const log = await this.create(dto, userId, timezone);
    const effective = await this.getStepsForDate(log.date, userId);
    const target = await this.dailyTarget(userId);
    return {
      stepLogId: log.id,
      effectiveStepsForDate: effective.steps,
      goalReached: target !== null ? effective.steps >= target : null,
    };
  }

  private async dailyTarget(userId: string): Promise<number | null> {
    const goals = await this.prisma.userGoals.findUnique({ where: { userId } });
    return goals?.dailyStepsTarget ?? null;
  }

  /**
   * Histórico preenchendo dias sem log com 0.
   */
  async getHistory(days: number, userId: string, timezone: string) {
    const today = todayInTz(timezone);
    const from = addDaysIso(today, -(days - 1));
    const logs = await this.prisma.stepLog.findMany({
      where: { userId, date: { gte: from, lte: today } },
      orderBy: [{ date: 'asc' }, { loggedAt: 'asc' }],
    });
    const byDate = new Map<string, number>();
    for (const l of logs) {
      const cur = byDate.get(l.date) ?? 0;
      if (l.steps > cur) byDate.set(l.date, l.steps);
    }
    const series: Array<{ date: string; steps: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = addDaysIso(from, i);
      series.push({ date: d, steps: byDate.get(d) ?? 0 });
    }
    return series;
  }
}
