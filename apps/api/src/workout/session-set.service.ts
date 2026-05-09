import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { isCardioExercise } from './helpers/is-cardio';

interface CreateSetInput {
  sessionId: string;
  exerciseId: number;
  weightKg?: number;
  reps?: number;
  rpe?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  kcalBurned?: number;
  notes?: string;
}

interface UpdateSetInput {
  weightKg?: number;
  reps?: number;
  rpe?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  kcalBurned?: number;
  notes?: string;
}

@Injectable()
export class SessionSetService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSetInput) {
    const session = await this.prisma.workoutSession.findFirst({
      where: { id: dto.sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const exercise = await this.prisma.exercise.findFirst({
      where: {
        id: dto.exerciseId,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');

    const isCardio = isCardioExercise(exercise);
    const hasStrengthFields = dto.weightKg !== undefined;
    const hasCardioFields = dto.durationSeconds !== undefined;

    if (isCardio && hasStrengthFields) {
      throw new BadRequestException('Exercício de cardio requer durationSeconds');
    }
    if (!isCardio && hasCardioFields) {
      throw new BadRequestException('Exercício de força requer weightKg e reps');
    }

    const agg = await this.prisma.sessionSet.aggregate({
      where: { sessionId: dto.sessionId, exerciseId: dto.exerciseId },
      _max: { setNumber: true },
    });
    const setNumber = (agg._max.setNumber ?? 0) + 1;

    const { sessionId, exerciseId, ...fields } = dto;
    return this.prisma.sessionSet.create({
      data: { sessionId, exerciseId, setNumber, ...fields },
      include: { exercise: true },
    });
  }

  async update(userId: string, id: string, dto: UpdateSetInput) {
    const set = await this.assertOwnerSet(userId, id);

    const exercise = await this.prisma.exercise.findUnique({ where: { id: set.exerciseId } });
    if (!exercise) throw new NotFoundException('Exercise not found');
    const isCardio = isCardioExercise(exercise);
    const hasStrengthFields = dto.weightKg !== undefined || dto.reps !== undefined;
    const hasCardioFields = dto.durationSeconds !== undefined;

    if (isCardio && hasStrengthFields) {
      throw new BadRequestException('Exercício de cardio requer durationSeconds');
    }
    if (!isCardio && hasCardioFields) {
      throw new BadRequestException('Exercício de força requer weightKg e reps');
    }

    return this.prisma.sessionSet.update({
      where: { id },
      data: dto,
      include: { exercise: true },
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.assertOwnerSet(userId, id);
    await this.prisma.sessionSet.delete({ where: { id } });
  }

  async getLastForExercise(userId: string, exerciseId: number, before?: string) {
    return this.prisma.sessionSet.findFirst({
      where: {
        exerciseId,
        session: {
          userId,
          ...(before ? { startedAt: { lt: new Date(before) } } : {}),
        },
      },
      orderBy: [{ session: { startedAt: 'desc' } }, { setNumber: 'desc' }],
      include: { exercise: true, session: { select: { startedAt: true } } },
    });
  }

  async getPersonalRecord(userId: string, exerciseId: number) {
    const exercise = await this.prisma.exercise.findFirst({
      where: {
        id: exerciseId,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');

    if (isCardioExercise(exercise)) {
      const groups = await this.prisma.sessionSet.groupBy({
        by: ['sessionId'],
        where: { exerciseId, session: { userId }, distanceMeters: { not: null } },
        _sum: { distanceMeters: true, durationSeconds: true },
        orderBy: { _sum: { distanceMeters: 'desc' } },
        take: 1,
      });
      if (groups.length === 0) return null;
      const group = groups[0];
      const session = await this.prisma.workoutSession.findUnique({
        where: { id: group.sessionId },
        select: { startedAt: true },
      });
      return {
        distanceMeters: group._sum.distanceMeters,
        durationSeconds: group._sum.durationSeconds,
        sessionDate: session?.startedAt ?? null,
      };
    }

    const top = await this.prisma.sessionSet.findFirst({
      where: { exerciseId, session: { userId }, weightKg: { not: null } },
      orderBy: [{ weightKg: 'desc' }, { reps: 'desc' }],
      select: { weightKg: true, reps: true, session: { select: { startedAt: true } } },
    });
    if (!top) return null;
    return {
      weightKg: top.weightKg,
      reps: top.reps,
      sessionDate: top.session.startedAt,
    };
  }

  private async assertOwnerSet(userId: string, id: string) {
    const set = await this.prisma.sessionSet.findFirst({
      where: { id },
      include: { session: { select: { userId: true } } },
    });
    if (!set) throw new NotFoundException('Set not found');
    if (set.session.userId !== userId) throw new ForbiddenException();
    return set;
  }
}
