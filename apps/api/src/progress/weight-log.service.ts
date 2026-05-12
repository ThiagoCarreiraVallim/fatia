import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { WeightLog } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { dayStartUTC, lastNDates } from './helpers/date-utils';
import type {
  CreateWeightLogDto,
  ListWeightLogsDto,
  UpdateWeightLogDto,
} from './dto/weight-log.dto';

@Injectable()
export class WeightLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWeightLogDto): Promise<WeightLog> {
    return this.prisma.weightLog.create({
      data: {
        userId,
        weightKg: dto.weightKg,
        loggedAt: new Date(dto.loggedAt),
        notes: dto.notes,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateWeightLogDto): Promise<WeightLog> {
    await this.assertOwner(userId, id);
    return this.prisma.weightLog.update({
      where: { id },
      data: {
        weightKg: dto.weightKg,
        loggedAt: dto.loggedAt ? new Date(dto.loggedAt) : undefined,
        notes: dto.notes,
      },
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.assertOwner(userId, id);
    await this.prisma.weightLog.delete({ where: { id } });
  }

  async list(userId: string, params: ListWeightLogsDto): Promise<WeightLog[]> {
    const limit = Math.min(params.limit ?? 20, 100);
    const where = params.days
      ? {
          userId,
          loggedAt: {
            gte: dayStartUTC(lastNDates(params.days, 'UTC')[0]),
          },
        }
      : { userId };

    return this.prisma.weightLog.findMany({
      where,
      orderBy: [{ loggedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  private async assertOwner(userId: string, id: string): Promise<void> {
    const log = await this.prisma.weightLog.findUnique({ where: { id }, select: { userId: true } });
    if (!log) throw new NotFoundException('WeightLog not found');
    if (log.userId !== userId) throw new ForbiddenException();
  }
}
