import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    if (!log) throw new NotFoundException('Step log not found');
    if (log.userId !== userId) throw new ForbiddenException();
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
