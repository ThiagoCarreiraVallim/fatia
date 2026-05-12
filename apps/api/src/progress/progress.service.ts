import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { estimate1RM } from '../workout/helpers/estimate-1rm';
import { isCardioExercise } from '../workout/helpers/is-cardio';
import { lastNDates, startOfWeekInTz } from './helpers/date-utils';

export type StrengthMetric = '1rm' | 'volume' | 'weight';
export type CardioMetric = 'duration' | 'distance' | 'pace' | 'kcal';

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evolução de peso corporal: pontos diários + médias semanais + delta (kg).
   * `timezone` é usado apenas para agrupar semanas.
   */
  async weightProgress(userId: string, days: number, timezone: string) {
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    startDate.setUTCHours(0, 0, 0, 0);

    const logs = await this.prisma.weightLog.findMany({
      where: { userId, loggedAt: { gte: startDate } },
      orderBy: { loggedAt: 'asc' },
      select: { id: true, loggedAt: true, weightKg: true },
    });

    const points = logs.map((l) => ({
      id: l.id,
      date: l.loggedAt.toISOString().slice(0, 10),
      weightKg: l.weightKg,
    }));

    const weeklyAvg = computeWeeklyAvg(
      points.map((p) => ({
        weekStart: startOfWeekInTz(new Date(`${p.date}T00:00:00Z`), timezone),
        value: p.weightKg,
      })),
    );

    const delta =
      points.length >= 2 ? round2(points[points.length - 1].weightKg - points[0].weightKg) : null;

    return { points, weeklyAvg, delta };
  }

  /**
   * Evolução de força por exercício. Métrica: '1rm' | 'volume' | 'weight'.
   * Agrupa por sessão (um ponto por sessão).
   */
  async strengthProgress(
    userId: string,
    exerciseId: number,
    days: number,
    metric: StrengthMetric,
    timezone: string,
  ) {
    const exercise = await this.assertExerciseAccess(userId, exerciseId);
    if (isCardioExercise(exercise)) {
      throw new BadRequestException('Use cardioProgress for cardio exercises');
    }

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    startDate.setUTCHours(0, 0, 0, 0);

    const sets = await this.prisma.sessionSet.findMany({
      where: { exerciseId, session: { userId, startedAt: { gte: startDate } } },
      include: { session: { select: { id: true, startedAt: true } } },
      orderBy: [{ session: { startedAt: 'asc' } }, { setNumber: 'asc' }],
    });

    // Group sets by sessionId
    const bySession = new Map<string, { date: string; sets: typeof sets }>();
    for (const s of sets) {
      const sessionId = s.session.id;
      if (!bySession.has(sessionId)) {
        bySession.set(sessionId, {
          date: s.session.startedAt.toISOString().slice(0, 10),
          sets: [],
        });
      }
      bySession.get(sessionId)!.sets.push(s);
    }

    const points: { sessionId: string; date: string; value: number }[] = [];
    for (const [sessionId, { date, sets: sessionSets }] of bySession) {
      let value = 0;
      if (metric === '1rm') {
        for (const s of sessionSets) {
          if (s.weightKg != null && s.reps != null) {
            value = Math.max(value, estimate1RM(s.weightKg, s.reps));
          }
        }
      } else if (metric === 'volume') {
        for (const s of sessionSets) {
          if (s.weightKg != null && s.reps != null) {
            value = round2(value + s.weightKg * s.reps);
          }
        }
      } else {
        // weight = max weightKg in session
        for (const s of sessionSets) {
          if (s.weightKg != null) {
            value = Math.max(value, s.weightKg);
          }
        }
      }
      points.push({ sessionId, date, value });
    }

    const weeklyAvg = computeWeeklyAvg(
      points.map((p) => ({
        weekStart: startOfWeekInTz(new Date(`${p.date}T00:00:00Z`), timezone),
        value: p.value,
      })),
    );

    return { exerciseId, metric, points, weeklyAvg };
  }

  /**
   * Evolução de cardio por exercício. Métrica: 'duration' | 'distance' | 'pace' | 'kcal'.
   * Agrupa por sessão.
   */
  async cardioProgress(
    userId: string,
    exerciseId: number,
    days: number,
    metric: CardioMetric,
    timezone: string,
  ) {
    const exercise = await this.assertExerciseAccess(userId, exerciseId);
    if (!isCardioExercise(exercise)) {
      throw new BadRequestException('Use strengthProgress for strength exercises');
    }

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    startDate.setUTCHours(0, 0, 0, 0);

    const sets = await this.prisma.sessionSet.findMany({
      where: { exerciseId, session: { userId, startedAt: { gte: startDate } } },
      include: { session: { select: { id: true, startedAt: true } } },
      orderBy: [{ session: { startedAt: 'asc' } }, { setNumber: 'asc' }],
    });

    const bySession = new Map<
      string,
      { date: string; totalDuration: number; totalDistance: number; totalKcal: number }
    >();
    for (const s of sets) {
      const sessionId = s.session.id;
      if (!bySession.has(sessionId)) {
        bySession.set(sessionId, {
          date: s.session.startedAt.toISOString().slice(0, 10),
          totalDuration: 0,
          totalDistance: 0,
          totalKcal: 0,
        });
      }
      const slot = bySession.get(sessionId)!;
      slot.totalDuration += s.durationSeconds ?? 0;
      slot.totalDistance += s.distanceMeters ?? 0;
      slot.totalKcal += s.kcalBurned ?? 0;
    }

    const points: { sessionId: string; date: string; value: number }[] = [];
    for (const [sessionId, slot] of bySession) {
      let value = 0;
      if (metric === 'duration') value = slot.totalDuration;
      else if (metric === 'distance') value = round2(slot.totalDistance);
      else if (metric === 'kcal') value = slot.totalKcal;
      else if (metric === 'pace') {
        // seconds per km; 0 if no distance
        value =
          slot.totalDistance > 0 ? round2((slot.totalDuration / slot.totalDistance) * 1000) : 0;
      }
      points.push({ sessionId, date: slot.date, value });
    }

    const weeklyAvg = computeWeeklyAvg(
      points.map((p) => ({
        weekStart: startOfWeekInTz(new Date(`${p.date}T00:00:00Z`), timezone),
        value: p.value,
      })),
    );

    return { exerciseId, metric, points, weeklyAvg };
  }

  /**
   * Volume de treino de força por semana (kg * reps totais).
   * Exclui exercícios de cardio. Opcionalmente filtra por muscleGroup.
   */
  async volumeProgress(userId: string, days: number, timezone: string, muscleGroup?: string) {
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    startDate.setUTCHours(0, 0, 0, 0);

    const sessions = await this.prisma.workoutSession.findMany({
      where: { userId, startedAt: { gte: startDate } },
      include: {
        sets: {
          where: muscleGroup ? { exercise: { muscleGroup } } : undefined,
          include: { exercise: { select: { muscleGroup: true } } },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    // Group volume by week start (excluding cardio sets)
    const byWeek = new Map<string, number>();
    for (const session of sessions) {
      const sessionDate = session.startedAt.toISOString().slice(0, 10);
      const weekStart = startOfWeekInTz(new Date(`${sessionDate}T00:00:00Z`), timezone);
      let weekVolume = byWeek.get(weekStart) ?? 0;
      for (const s of session.sets) {
        if (!isCardioExercise(s.exercise) && s.weightKg != null && s.reps != null) {
          weekVolume = round2(weekVolume + s.weightKg * s.reps);
        }
      }
      byWeek.set(weekStart, weekVolume);
    }

    const weeks = Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, volume]) => ({ weekStart, volume }));

    return { weeks, muscleGroup: muscleGroup ?? null };
  }

  /**
   * Progresso de passos: pontos diários (max policy) + médias semanais + dias batendo meta.
   */
  async stepsProgress(userId: string, days: number, timezone: string) {
    const dates = lastNDates(days, timezone);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const logs = await this.prisma.stepLog.groupBy({
      by: ['date'],
      where: { userId, date: { gte: startDate, lte: endDate } },
      _max: { steps: true },
    });

    const goals = await this.prisma.userGoals.findUnique({ where: { userId } });
    const dailyTarget = goals?.dailyStepsTarget ?? 8000;

    const byDate = new Map<string, number>(logs.map((r) => [r.date, r._max.steps ?? 0]));

    const points = dates.map((d) => ({ date: d, steps: byDate.get(d) ?? 0 }));
    const daysHitGoal = points.filter((p) => p.steps >= dailyTarget).length;

    const weeklyAvg = computeWeeklyAvg(
      points.map((p) => ({
        weekStart: startOfWeekInTz(new Date(`${p.date}T00:00:00Z`), timezone),
        value: p.steps,
      })),
    );

    return { points, weeklyAvg, daysHitGoal, dailyTarget };
  }

  private async assertExerciseAccess(userId: string, exerciseId: number) {
    const exercise = await this.prisma.exercise.findFirst({
      where: {
        id: exerciseId,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');
    return exercise;
  }
}

/** Agrupa pontos {weekStart, value} e retorna médias por semana. */
function computeWeeklyAvg(
  points: { weekStart: string; value: number }[],
): { weekStart: string; avg: number }[] {
  const byWeek = new Map<string, { sum: number; count: number }>();
  for (const p of points) {
    const slot = byWeek.get(p.weekStart) ?? { sum: 0, count: 0 };
    slot.sum = round2(slot.sum + p.value);
    slot.count += 1;
    byWeek.set(p.weekStart, slot);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, { sum, count }]) => ({ weekStart, avg: round2(sum / count) }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
