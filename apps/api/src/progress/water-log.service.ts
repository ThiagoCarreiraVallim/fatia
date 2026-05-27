import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { CreateWaterLogDto, ListWaterLogsDto, UpdateWaterLogDto } from './dto/water-log.dto';
import { addDaysIso, todayInTz } from './helpers/date-tz';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class WaterLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWaterLogDto, userId: string, timezone: string) {
    const date = dto.date ?? todayInTz(timezone);
    return this.prisma.waterLog.create({
      data: {
        userId,
        date,
        ml: dto.ml,
        notes: dto.notes ?? null,
      },
    });
  }

  async findById(id: string, userId: string) {
    const log = await this.prisma.waterLog.findUnique({ where: { id } });
    if (!log || log.userId !== userId) throw new NotFoundException('Water log not found');
    return log;
  }

  async update(id: string, dto: UpdateWaterLogDto, userId: string) {
    await this.findById(id, userId);
    return this.prisma.waterLog.update({
      where: { id },
      data: {
        ...(dto.ml !== undefined && { ml: dto.ml }),
        ...(dto.date && { date: dto.date }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async delete(id: string, userId: string) {
    const log = await this.prisma.waterLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('Water log not found');
    if (log.userId !== userId) throw new ForbiddenException();
    await this.prisma.waterLog.delete({ where: { id } });
    return { deleted: true as const };
  }

  async list(filter: ListWaterLogsDto, userId: string) {
    const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where: Prisma.WaterLogWhereInput = { userId };
    if (filter.from || filter.to) {
      where.date = {};
      if (filter.from) where.date.gte = filter.from;
      if (filter.to) where.date.lte = filter.to;
    }
    const items = await this.prisma.waterLog.findMany({
      where,
      orderBy: [{ date: 'desc' }, { loggedAt: 'desc' }],
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });
    const nextCursor = items.length > limit ? items[limit - 1].id : undefined;
    return { logs: items.slice(0, limit), nextCursor };
  }

  /**
   * Política: SOMA de todos os logs do dia (diferente de StepLog, que é MAX).
   * Cada log de água é um evento independente (copo, garrafa) que se acumula.
   */
  async getForDate(date: string, userId: string) {
    const logs = await this.prisma.waterLog.findMany({
      where: { userId, date },
      orderBy: { loggedAt: 'asc' },
    });
    const totalMl = logs.reduce((acc, l) => acc + l.ml, 0);
    return { date, totalMl, logCount: logs.length };
  }

  /**
   * Histórico preenchendo dias sem log com 0.
   */
  async getHistory(days: number, userId: string, timezone: string) {
    const today = todayInTz(timezone);
    const from = addDaysIso(today, -(days - 1));
    const logs = await this.prisma.waterLog.findMany({
      where: { userId, date: { gte: from, lte: today } },
      orderBy: [{ date: 'asc' }, { loggedAt: 'asc' }],
    });
    const byDate = new Map<string, number>();
    for (const l of logs) {
      byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.ml);
    }
    const series: Array<{ date: string; totalMl: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = addDaysIso(from, i);
      series.push({ date: d, totalMl: byDate.get(d) ?? 0 });
    }
    return series;
  }
}
