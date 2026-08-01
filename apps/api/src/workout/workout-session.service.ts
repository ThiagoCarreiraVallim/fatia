import {
  BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  /**
   * Finaliza a sessão. `completedAt` é opcional e serve para registrar treino já
   * ocorrido — "ontem treinei peito, supino 4x8 com 70 kg" — que antes só podia
   * ser fechado com o horário de agora, produzindo uma sessão de um dia de
   * duração.
   *
   * As duas validações existem porque o valor vem do cliente, e um horário
   * incoerente contamina em silêncio todo agregado de duração e volume: um fim
   * antes do início dá duração negativa, e um fim no futuro empurra a sessão
   * para o topo do histórico e não sai de lá.
   */
  async finish(userId: string, id: string, dto: FinishSessionDto) {
    const session = await this.assertOwner(userId, id);

    let completedAt = session.completedAt ?? new Date();
    if (dto.completedAt) {
      const requested = new Date(dto.completedAt);
      if (Number.isNaN(requested.getTime())) {
        throw new BadRequestException('completedAt inválido — use ISO 8601.');
      }
      if (requested < session.startedAt) {
        throw new BadRequestException(
          'completedAt é anterior ao início do treino. Confirme a data com o usuário.',
        );
      }
      // Uma folga pequena absorve relógio de aparelho adiantado; um treino que
      // "termina" amanhã é erro de digitação, não fuso.
      if (requested.getTime() > Date.now() + 5 * 60 * 1000) {
        throw new BadRequestException('completedAt está no futuro.');
      }
      completedAt = requested;
    }

    return this.prisma.workoutSession.update({
      where: { id },
      data: {
        completedAt,
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateSessionDto) {
    await this.assertOwner(userId, id);
    return this.prisma.workoutSession.update({ where: { id }, data: dto });
  }

  async delete(userId: string, id: string): Promise<void> {
    // Idempotente. Cancelar um treino podia disparar o DELETE duas vezes (duplo
    // clique / re-render) ou correr com a sessão já removida: o segundo delete
    // batia em Prisma P2025 ("Record to delete does not exist") e virava HTTP 500,
    // só funcionando no retry. Aqui validamos posse e tratamos "já não existe"
    // como no-op. Os SessionSet somem por cascade (onDelete: Cascade no schema).
    // Não usamos transação interativa de propósito: em produção atrás de pgbouncer
    // (transaction pooling) ela falha de forma consistente.
    const session = await this.prisma.workoutSession.findUnique({
      where: { id },
      select: { userId: true },
    });
    // Sessão de outro usuário é tratada como inexistente — resposta idêntica ao
    // "já não existe" para não revelar que o id existe em outra conta (#92).
    if (!session || session.userId !== userId) return; // idempotente: nada a fazer
    try {
      await this.prisma.workoutSession.delete({ where: { id } });
    } catch (err) {
      // P2025: removida concorrentemente entre o findUnique e o delete → no-op.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return;
      throw err;
    }
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
    // Mesma resposta para "não existe" e "não é sua" (§IDs de docs/MCP.md).
    if (!session || session.userId !== userId) throw new NotFoundException('Session not found');
    return session;
  }
}
