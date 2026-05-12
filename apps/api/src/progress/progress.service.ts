import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StepLogService } from './step-log.service';
import { addDaysIso, todayInTz, weekStartInTz } from './helpers/date-tz';
import { calculatePace } from '../workout/helpers/calculate-pace';
import { estimate1RM } from '../workout/helpers/estimate-1rm';

export type StrengthMetric = 'max_weight' | 'estimated_1rm' | 'total_volume';
export type CardioMetric = 'duration' | 'distance' | 'pace' | 'kcal';

interface UserCtx {
  userId: string;
  timezone: string;
}

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stepLogs: StepLogService,
  ) {}

  async weightProgress(days: number, ctx: UserCtx) {
    const today = todayInTz(ctx.timezone);
    const fromIso = addDaysIso(today, -(days - 1));
    const logs = await this.prisma.weightLog.findMany({
      where: { userId: ctx.userId, loggedAt: { gte: new Date(`${fromIso}T00:00:00Z`) } },
      orderBy: { loggedAt: 'asc' },
    });
    const points = logs.map((l) => ({
      date: l.loggedAt.toISOString().slice(0, 10),
      weightKg: l.weightKg,
    }));
    const weeklyAverages = this.weeklyAverages(points, ctx.timezone);
    const totalDeltaKg =
      points.length >= 2 ? points[points.length - 1].weightKg - points[0].weightKg : 0;
    const currentWeightKg = points.length > 0 ? points[points.length - 1].weightKg : null;
    return { points, weeklyAverages, totalDeltaKg, currentWeightKg };
  }

  private weeklyAverages(
    points: Array<{ date: string; weightKg: number }>,
    timezone: string,
  ): Array<{ weekStart: string; avgKg: number; deltaKg: number | null }> {
    const buckets = new Map<string, number[]>();
    for (const p of points) {
      const ws = weekStartInTz(new Date(`${p.date}T12:00:00Z`), timezone);
      const arr = buckets.get(ws) ?? [];
      arr.push(p.weightKg);
      buckets.set(ws, arr);
    }
    const sorted = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
    const result: Array<{ weekStart: string; avgKg: number; deltaKg: number | null }> = [];
    let prev: number | null = null;
    for (const [weekStart, vals] of sorted) {
      const avgKg = vals.reduce((a, b) => a + b, 0) / vals.length;
      result.push({ weekStart, avgKg, deltaKg: prev === null ? null : avgKg - prev });
      prev = avgKg;
    }
    return result;
  }

  async strengthProgress(exerciseId: number, days: number, metric: StrengthMetric, ctx: UserCtx) {
    const exercise = await this.prisma.exercise.findUnique({ where: { id: exerciseId } });
    if (!exercise) throw new NotFoundException('Exercise not found');
    if (exercise.muscleGroup === 'cardio') {
      throw new BadRequestException('Use cardio progress for cardio exercises');
    }

    const fromIso = addDaysIso(todayInTz(ctx.timezone), -(days - 1));
    const sets = await this.prisma.sessionSet.findMany({
      where: {
        exerciseId,
        weightKg: { not: null },
        reps: { not: null },
        session: { userId: ctx.userId, startedAt: { gte: new Date(`${fromIso}T00:00:00Z`) } },
      },
      include: { session: { select: { id: true, startedAt: true } } },
    });

    const bySession = new Map<
      string,
      { sessionId: string; sessionDate: string; weightKg: number; reps: number; volume: number }
    >();
    for (const s of sets) {
      const date = s.session.startedAt.toISOString().slice(0, 10);
      const cur = bySession.get(s.session.id);
      const volume = (s.weightKg ?? 0) * (s.reps ?? 0);
      const candidate = {
        sessionId: s.session.id,
        sessionDate: date,
        weightKg: s.weightKg ?? 0,
        reps: s.reps ?? 0,
        volume,
      };
      if (!cur) {
        bySession.set(s.session.id, candidate);
      } else {
        if (metric === 'max_weight' || metric === 'estimated_1rm') {
          if (candidate.weightKg > cur.weightKg) bySession.set(s.session.id, candidate);
        } else if (metric === 'total_volume') {
          cur.volume += volume; // accumulate
        }
      }
    }
    const points = [...bySession.values()]
      .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
      .map((p) => {
        let value: number;
        if (metric === 'max_weight') value = p.weightKg;
        else if (metric === 'estimated_1rm') value = estimate1RM(p.weightKg, p.reps);
        else value = p.volume;
        return {
          sessionDate: p.sessionDate,
          sessionId: p.sessionId,
          value,
          bestSet: { weightKg: p.weightKg, reps: p.reps },
        };
      });

    const startValue = points[0]?.value ?? null;
    const currentValue = points[points.length - 1]?.value ?? null;
    const deltaPercent =
      startValue && currentValue ? ((currentValue - startValue) / startValue) * 100 : null;

    return {
      exercise: { id: exercise.id, name: exercise.name },
      metric,
      points,
      startValue,
      currentValue,
      deltaPercent,
    };
  }

  async cardioProgress(exerciseId: number, days: number, metric: CardioMetric, ctx: UserCtx) {
    const exercise = await this.prisma.exercise.findUnique({ where: { id: exerciseId } });
    if (!exercise) throw new NotFoundException('Exercise not found');
    if (exercise.muscleGroup !== 'cardio') {
      throw new BadRequestException('Exercise is not cardio');
    }

    const fromIso = addDaysIso(todayInTz(ctx.timezone), -(days - 1));
    const sets = await this.prisma.sessionSet.findMany({
      where: {
        exerciseId,
        durationSeconds: { not: null },
        session: { userId: ctx.userId, startedAt: { gte: new Date(`${fromIso}T00:00:00Z`) } },
      },
      include: { session: { select: { id: true, startedAt: true } } },
      orderBy: [{ session: { startedAt: 'asc' } }],
    });

    const bySession = new Map<
      string,
      {
        sessionId: string;
        sessionDate: string;
        durationSeconds: number;
        distanceMeters: number | null;
        kcalBurned: number | null;
      }
    >();
    for (const s of sets) {
      const cur = bySession.get(s.session.id);
      const candidate = {
        sessionId: s.session.id,
        sessionDate: s.session.startedAt.toISOString().slice(0, 10),
        durationSeconds: (cur?.durationSeconds ?? 0) + (s.durationSeconds ?? 0),
        distanceMeters:
          (cur?.distanceMeters ?? 0) + (s.distanceMeters ?? 0) || cur?.distanceMeters || null,
        kcalBurned: (cur?.kcalBurned ?? 0) + (s.kcalBurned ?? 0) || cur?.kcalBurned || null,
      };
      bySession.set(s.session.id, candidate);
    }
    const points = [...bySession.values()].map((p) => {
      const paceSecondsPerKm = calculatePace(p.durationSeconds, p.distanceMeters ?? 0);
      let value: number;
      if (metric === 'duration') value = p.durationSeconds;
      else if (metric === 'distance') value = p.distanceMeters ?? 0;
      else if (metric === 'pace') value = paceSecondsPerKm ?? 0;
      else value = p.kcalBurned ?? 0;
      return {
        sessionDate: p.sessionDate,
        sessionId: p.sessionId,
        durationSeconds: p.durationSeconds,
        distanceMeters: p.distanceMeters,
        paceSecondsPerKm,
        kcalBurned: p.kcalBurned,
        value,
      };
    });

    const bestSession = points.length
      ? points.reduce((best, p) => (p.value > best.value ? p : best), points[0])
      : null;

    return {
      exercise: { id: exercise.id, name: exercise.name },
      metric,
      points,
      bestSession: bestSession
        ? {
            sessionId: bestSession.sessionId,
            sessionDate: bestSession.sessionDate,
            value: bestSession.value,
          }
        : null,
    };
  }

  async volumeProgress(days: number, muscleGroup: string | undefined, ctx: UserCtx) {
    const fromIso = addDaysIso(todayInTz(ctx.timezone), -(days - 1));
    const sets = await this.prisma.sessionSet.findMany({
      where: {
        weightKg: { not: null },
        reps: { not: null },
        session: { userId: ctx.userId, startedAt: { gte: new Date(`${fromIso}T00:00:00Z`) } },
        ...(muscleGroup && { exercise: { muscleGroup } }),
      },
      include: { session: { select: { id: true, startedAt: true } } },
    });

    const byWeek = new Map<string, { volume: number; sessions: Set<string> }>();
    for (const s of sets) {
      const ws = weekStartInTz(s.session.startedAt, ctx.timezone);
      const cur = byWeek.get(ws) ?? { volume: 0, sessions: new Set<string>() };
      cur.volume += (s.weightKg ?? 0) * (s.reps ?? 0);
      cur.sessions.add(s.session.id);
      byWeek.set(ws, cur);
    }

    const weeks = [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, v]) => ({
        weekStart,
        totalVolumeKg: v.volume,
        sessionCount: v.sessions.size,
      }));
    const averageWeeklyVolumeKg = weeks.length
      ? weeks.reduce((a, w) => a + w.totalVolumeKg, 0) / weeks.length
      : 0;
    return { weeks, averageWeeklyVolumeKg };
  }

  async stepsProgress(days: number, ctx: UserCtx) {
    const series = await this.stepLogs.getHistory(days, ctx.userId, ctx.timezone);
    const goals = await this.prisma.userGoals.findUnique({ where: { userId: ctx.userId } });
    const target = goals?.dailyStepsTarget ?? null;

    const points = series.map((p) => ({
      ...p,
      goalReached: target !== null ? p.steps >= target : null,
    }));

    const byWeek = new Map<string, number[]>();
    for (const p of points) {
      const ws = weekStartInTz(new Date(`${p.date}T12:00:00Z`), ctx.timezone);
      const arr = byWeek.get(ws) ?? [];
      arr.push(p.steps);
      byWeek.set(ws, arr);
    }
    const weeklyAverages = [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, vals]) => ({
        weekStart,
        avgSteps: vals.reduce((a, b) => a + b, 0) / vals.length,
      }));
    const totalSteps = points.reduce((a, p) => a + p.steps, 0);
    const daysWithGoalReached =
      target !== null ? points.filter((p) => p.steps >= target).length : 0;
    const averageDaily = points.length ? totalSteps / points.length : 0;
    const bestDay = points.reduce<{ date: string; steps: number } | null>((best, p) => {
      if (p.steps === 0) return best;
      if (!best || p.steps > best.steps) return { date: p.date, steps: p.steps };
      return best;
    }, null);

    return {
      points,
      weeklyAverages,
      totalSteps,
      averageDaily,
      bestDay,
      goalTarget: target,
      daysWithGoalReached,
    };
  }
}
