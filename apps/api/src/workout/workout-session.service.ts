import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type {
  FinishSessionDto,
  ListSessionsDto,
  StartSessionDto,
  UpdateSessionDto,
} from './dto/session.dto';

const SESSION_INCLUDE = {
  sets: {
    include: { exercise: true },
    orderBy: [{ exerciseId: 'asc' }, { setNumber: 'asc' }],
  },
  plan: {
    include: {
      exercises: {
        include: { exercise: true },
        orderBy: { order: 'asc' },
      },
    },
  },
} satisfies Prisma.WorkoutSessionInclude;

type SessionWithRelations = Prisma.WorkoutSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

export interface PlannedExerciseView {
  exerciseId: number;
  exerciseName: string;
  muscleGroup: string;
  order: number;
  targetSets: number;
  targetReps: string;
}

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
    return this.shapeSession(session);
  }

  async findActive(userId: string) {
    const session = await this.prisma.workoutSession.findFirst({
      where: { userId, completedAt: null },
      include: SESSION_INCLUDE,
      orderBy: { startedAt: 'desc' },
    });
    return session ? this.shapeSession(session) : null;
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
      include: SESSION_INCLUDE,
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
    // Idempotente e transacional. Cancelar um treino dispara este delete enquanto
    // ainda pode haver escritas de SessionSet em voo (ex.: auto-save de RPE). Sem
    // isolamento, a cascata colidia com a escrita concorrente — ou um segundo
    // disparo encontrava a sessão já removida — e o primeiro DELETE retornava 500
    // (Prisma P2025), só funcionando na segunda tentativa. Aqui tratamos
    // "já não existe" como no-op e removemos os filhos explicitamente.
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.workoutSession.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!session) return; // idempotente: nada a fazer
      if (session.userId !== userId) throw new ForbiddenException();
      await tx.sessionSet.deleteMany({ where: { sessionId: id } });
      await tx.workoutSession.delete({ where: { id } });
    });
  }

  private shapeSession(session: SessionWithRelations) {
    const { plan, ...rest } = session;
    const plannedExercises: PlannedExerciseView[] = plan
      ? plan.exercises.map((pe) => ({
          exerciseId: pe.exerciseId,
          exerciseName: pe.exercise.name,
          muscleGroup: pe.exercise.muscleGroup,
          order: pe.order,
          targetSets: pe.targetSets,
          targetReps: pe.targetReps,
        }))
      : [];
    return { ...rest, plannedExercises };
  }

  private async assertOwner(userId: string, id: string) {
    const session = await this.prisma.workoutSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException();
    return session;
  }
}
