import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type {
  FinishSessionDto,
  ListSessionsDto,
  StartSessionDto,
  UpdateSessionDto,
} from './dto/session.dto';

const SESSION_INCLUDE: Prisma.WorkoutSessionInclude = {
  sets: {
    include: { exercise: true },
    orderBy: [{ exerciseId: 'asc' }, { setNumber: 'asc' }],
  },
};

@Injectable()
export class WorkoutSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, dto: StartSessionDto) {
    return this.prisma.workoutSession.create({
      data: {
        userId,
        planId: dto.planId ?? null,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(),
        notes: dto.notes,
      },
    });
  }

  async findById(userId: string, id: string) {
    const session = await this.prisma.workoutSession.findFirst({
      where: { id, userId },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async findActive(userId: string) {
    return this.prisma.workoutSession.findFirst({
      where: { userId, completedAt: null },
      include: SESSION_INCLUDE,
      orderBy: { startedAt: 'desc' },
    });
  }

  async list(userId: string, params: ListSessionsDto) {
    const limit = Math.min(params.limit ?? 20, 50);
    const where: Prisma.WorkoutSessionWhereInput = { userId };
    if (params.date) {
      const start = new Date(`${params.date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      where.startedAt = { gte: start, lt: end };
    }
    return this.prisma.workoutSession.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
  }

  async finish(userId: string, id: string, dto: FinishSessionDto) {
    const session = await this.assertOwner(userId, id);
    return this.prisma.workoutSession.update({
      where: { id },
      data: {
        completedAt: session.completedAt ?? new Date(),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateSessionDto) {
    await this.assertOwner(userId, id);
    return this.prisma.workoutSession.update({ where: { id }, data: dto });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.assertOwner(userId, id);
    await this.prisma.workoutSession.delete({ where: { id } });
  }

  private async assertOwner(userId: string, id: string) {
    const session = await this.prisma.workoutSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException();
    return session;
  }
}
