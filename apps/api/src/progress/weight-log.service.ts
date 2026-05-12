import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type {
  CreateWeightLogDto,
  ListWeightLogsDto,
  UpdateWeightLogDto,
} from './dto/weight-log.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

@Injectable()
export class WeightLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWeightLogDto, userId: string) {
    return this.prisma.weightLog.create({
      data: {
        userId,
        weightKg: dto.weightKg,
        loggedAt: dto.loggedAt ? new Date(dto.loggedAt) : new Date(),
        notes: dto.notes ?? null,
      },
    });
  }

  async findById(id: string, userId: string) {
    const log = await this.prisma.weightLog.findUnique({ where: { id } });
    if (!log || log.userId !== userId) throw new NotFoundException('Weight log not found');
    return log;
  }

  async update(id: string, dto: UpdateWeightLogDto, userId: string) {
    await this.findById(id, userId);
    return this.prisma.weightLog.update({
      where: { id },
      data: {
        ...(dto.weightKg !== undefined && { weightKg: dto.weightKg }),
        ...(dto.loggedAt && { loggedAt: new Date(dto.loggedAt) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async delete(id: string, userId: string) {
    const log = await this.prisma.weightLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('Weight log not found');
    if (log.userId !== userId) throw new ForbiddenException();
    await this.prisma.weightLog.delete({ where: { id } });
    return { deleted: true as const };
  }

  async list(filter: ListWeightLogsDto, userId: string) {
    const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where: Prisma.WeightLogWhereInput = { userId };
    if (filter.from || filter.to) {
      where.loggedAt = {};
      if (filter.from) where.loggedAt.gte = new Date(filter.from);
      if (filter.to) where.loggedAt.lte = new Date(filter.to);
    }
    const items = await this.prisma.weightLog.findMany({
      where,
      orderBy: { loggedAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });
    const nextCursor = items.length > limit ? items[limit - 1].id : undefined;
    return { logs: items.slice(0, limit), nextCursor };
  }

  async getLatest(userId: string) {
    return this.prisma.weightLog.findFirst({
      where: { userId },
      orderBy: { loggedAt: 'desc' },
    });
  }
}
