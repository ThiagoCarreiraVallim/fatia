import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { StepLog } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { addDaysToDateStr, lastNDates } from './helpers/date-utils';
import type { CreateStepLogDto, ListStepLogsDto, UpdateStepLogDto } from './dto/step-log.dto';

@Injectable()
export class StepLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateStepLogDto): Promise<StepLog> {
    return this.prisma.stepLog.create({
      data: {
        userId,
        date: dto.date,
        steps: dto.steps,
        source: dto.source,
        notes: dto.notes,
        loggedAt: new Date(),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateStepLogDto): Promise<StepLog> {
    await this.assertOwner(userId, id);
    return this.prisma.stepLog.update({
      where: { id },
      data: {
        steps: dto.steps,
        notes: dto.notes,
      },
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.assertOwner(userId, id);
    await this.prisma.stepLog.delete({ where: { id } });
  }

  async list(userId: string, params: ListStepLogsDto): Promise<StepLog[]> {
    const limit = Math.min(params.limit ?? 20, 100);
    const where = params.days
      ? {
          userId,
          date: { gte: addDaysToDateStr(todayUTC(), -(params.days - 1)) },
        }
      : { userId };

    return this.prisma.stepLog.findMany({
      where,
      orderBy: [{ date: 'desc' }, { loggedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Retorna o maior valor de steps entre todos os logs do dia (ADR 007).
   * Retorna 0 se não houver logs.
   */
  async getStepsForDate(userId: string, date: string): Promise<number> {
    const agg = await this.prisma.stepLog.aggregate({
      where: { userId, date },
      _max: { steps: true },
    });
    return agg._max.steps ?? 0;
  }

  /**
   * Retorna histórico diário de passos dos últimos `days` dias no fuso do usuário.
   * Usa política de maior valor (ADR 007). Preenche 0 para dias sem log.
   */
  async getHistory(
    userId: string,
    days: number,
    timezone: string,
  ): Promise<{ date: string; steps: number }[]> {
    const dates = lastNDates(days, timezone);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const logs = await this.prisma.stepLog.groupBy({
      by: ['date'],
      where: { userId, date: { gte: startDate, lte: endDate } },
      _max: { steps: true },
    });

    const byDate = new Map<string, number>(logs.map((r) => [r.date, r._max.steps ?? 0]));

    return dates.map((d) => ({ date: d, steps: byDate.get(d) ?? 0 }));
  }

  private async assertOwner(userId: string, id: string): Promise<void> {
    const log = await this.prisma.stepLog.findUnique({ where: { id }, select: { userId: true } });
    if (!log) throw new NotFoundException('StepLog not found');
    if (log.userId !== userId) throw new ForbiddenException();
  }
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
