import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { isCardioExercise } from './helpers/is-cardio';
import { estimate1RM } from './helpers/estimate-1rm';

export interface PersonalRecordEntry {
  exerciseId: number;
  exerciseName: string;
  muscleGroup: string;
  type: 'strength' | 'cardio';
  // Força
  maxWeightKg: number | null;
  repsAtMax: number | null;
  estimated1RM: number | null;
  // Cardio
  maxDistanceMeters: number | null;
  bestDurationSeconds: number | null;
  // Comum
  achievedAt: string | null;
  lastPerformedAt: string | null;
  totalSets: number;
}

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
    const hasStrengthFields = dto.weightKg !== undefined || dto.reps !== undefined;
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

  /**
   * Lista o recorde pessoal de cada exercício que o usuário já treinou.
   * Força: maior carga (desempate por reps) + 1RM estimado.
   * Cardio: maior distância (com a duração daquela sessão).
   * Agrega em memória — escala pessoal (poucos milhares de séries) torna isso suficiente.
   */
  async listPersonalRecords(userId: string): Promise<PersonalRecordEntry[]> {
    const sets = await this.prisma.sessionSet.findMany({
      where: { session: { userId } },
      select: {
        exerciseId: true,
        weightKg: true,
        reps: true,
        distanceMeters: true,
        durationSeconds: true,
        exercise: { select: { id: true, name: true, muscleGroup: true } },
        session: { select: { startedAt: true } },
      },
    });

    const byExercise = new Map<number, PersonalRecordEntry>();
    for (const s of sets) {
      const ex = s.exercise;
      const date = s.session.startedAt.toISOString();
      let entry = byExercise.get(ex.id);
      if (!entry) {
        entry = {
          exerciseId: ex.id,
          exerciseName: ex.name,
          muscleGroup: ex.muscleGroup,
          type: isCardioExercise(ex) ? 'cardio' : 'strength',
          maxWeightKg: null,
          repsAtMax: null,
          estimated1RM: null,
          maxDistanceMeters: null,
          bestDurationSeconds: null,
          achievedAt: null,
          lastPerformedAt: null,
          totalSets: 0,
        };
        byExercise.set(ex.id, entry);
      }

      entry.totalSets += 1;
      if (!entry.lastPerformedAt || date > entry.lastPerformedAt) entry.lastPerformedAt = date;

      if (entry.type === 'cardio') {
        if (
          s.distanceMeters != null &&
          (entry.maxDistanceMeters == null || s.distanceMeters > entry.maxDistanceMeters)
        ) {
          entry.maxDistanceMeters = s.distanceMeters;
          entry.bestDurationSeconds = s.durationSeconds ?? null;
          entry.achievedAt = date;
        }
      } else if (s.weightKg != null) {
        const better =
          entry.maxWeightKg == null ||
          s.weightKg > entry.maxWeightKg ||
          (s.weightKg === entry.maxWeightKg && (s.reps ?? 0) > (entry.repsAtMax ?? 0));
        if (better) {
          entry.maxWeightKg = s.weightKg;
          entry.repsAtMax = s.reps ?? null;
          entry.achievedAt = date;
        }
        if (s.reps != null) {
          const e1rm = estimate1RM(s.weightKg, s.reps);
          if (entry.estimated1RM == null || e1rm > entry.estimated1RM) entry.estimated1RM = e1rm;
        }
      }
    }

    // Mais recentes primeiro.
    return [...byExercise.values()].sort((a, b) =>
      (b.lastPerformedAt ?? '').localeCompare(a.lastPerformedAt ?? ''),
    );
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
