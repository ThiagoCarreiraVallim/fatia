import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StepLogService } from './step-log.service';
import { WeightLogService } from './weight-log.service';
import { addDaysIso, dayBoundsInTz, todayInTz, weekStartInTz } from './helpers/date-tz';

interface UserCtx {
  userId: string;
  timezone: string;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stepLogs: StepLogService,
    private readonly weightLogs: WeightLogService,
  ) {}

  async today(ctx: UserCtx) {
    const date = todayInTz(ctx.timezone);
    const { start: dayStart, end: dayEnd } = dayBoundsInTz(date, ctx.timezone);

    const [meals, goals, sessionInProgress, completedSession, latestWeight, stepsToday] =
      await Promise.all([
        this.prisma.meal.findMany({
          where: { userId: ctx.userId, eatenAt: { gte: dayStart, lte: dayEnd } },
          include: { items: true },
        }),
        this.prisma.userGoals.findUnique({ where: { userId: ctx.userId } }),
        this.prisma.workoutSession.findFirst({
          where: { userId: ctx.userId, completedAt: null, startedAt: { gte: dayStart } },
          select: { id: true, startedAt: true },
          orderBy: { startedAt: 'desc' },
        }),
        this.prisma.workoutSession.findFirst({
          where: {
            userId: ctx.userId,
            completedAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        this.weightLogs.getLatest(ctx.userId),
        this.stepLogs.getStepsForDate(date, ctx.userId),
      ]);

    const consumed = meals
      .flatMap((m) => m.items)
      .reduce(
        (acc, i) => ({
          kcal: acc.kcal + i.kcal,
          proteinG: acc.proteinG + i.proteinG,
          carbsG: acc.carbsG + i.carbsG,
          fatG: acc.fatG + i.fatG,
        }),
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      );

    const onTrack = goals ? consumed.kcal >= goals.kcalMin && consumed.kcal <= goals.kcalMax : null;

    const stepsTarget = goals?.dailyStepsTarget ?? null;
    const stepsGoalReached = stepsTarget !== null ? stepsToday.steps >= stepsTarget : null;

    const latestWeightToday =
      latestWeight && latestWeight.loggedAt >= dayStart && latestWeight.loggedAt <= dayEnd;

    const [nutritionStreak, workoutWeeks, stepsStreak] = await Promise.all([
      this.computeNutritionStreak(ctx),
      this.computeWorkoutWeeks(ctx),
      this.computeStepsStreak(ctx, stepsTarget),
    ]);

    return {
      date,
      nutrition: {
        consumed,
        goals,
        mealsLogged: meals.length,
        onTrack,
      },
      workout: {
        plannedToday: null as { planId: string; name: string } | null,
        sessionInProgress,
        completedToday: !!completedSession,
      },
      weight: {
        latest: latestWeight
          ? { weightKg: latestWeight.weightKg, loggedAt: latestWeight.loggedAt.toISOString() }
          : null,
        loggedToday: !!latestWeightToday,
      },
      steps: {
        today: stepsToday.steps,
        target: stepsTarget,
        goalReached: stepsGoalReached,
        logged: stepsToday.logCount > 0,
      },
      streak: {
        nutritionDays: nutritionStreak,
        workoutWeeks,
        stepsDays: stepsStreak,
      },
    };
  }

  async week(ctx: UserCtx) {
    const today = todayInTz(ctx.timezone);
    const weekStart = weekStartInTz(new Date(`${today}T12:00:00Z`), ctx.timezone);
    const weekEnd = addDaysIso(weekStart, 6);
    const startDate = new Date(`${weekStart}T00:00:00Z`);
    const endDate = new Date(`${weekEnd}T23:59:59Z`);

    const [meals, goals, sessions, weightLogs] = await Promise.all([
      this.prisma.meal.findMany({
        where: { userId: ctx.userId, eatenAt: { gte: startDate, lte: endDate } },
        include: { items: true },
      }),
      this.prisma.userGoals.findUnique({ where: { userId: ctx.userId } }),
      this.prisma.workoutSession.findMany({
        where: {
          userId: ctx.userId,
          completedAt: { gte: startDate, lte: endDate },
        },
        include: {
          plan: { select: { name: true } },
          sets: { include: { exercise: { select: { muscleGroup: true } } } },
        },
      }),
      this.prisma.weightLog.findMany({
        where: { userId: ctx.userId, loggedAt: { gte: startDate, lte: endDate } },
        orderBy: { loggedAt: 'asc' },
      }),
    ]);

    const byDate = new Map<string, { kcal: number; proteinG: number }>();
    for (const m of meals) {
      const date = m.eatenAt.toISOString().slice(0, 10);
      const cur = byDate.get(date) ?? { kcal: 0, proteinG: 0 };
      for (const i of m.items) {
        cur.kcal += i.kcal;
        cur.proteinG += i.proteinG;
      }
      byDate.set(date, cur);
    }
    const days = [...byDate.values()];
    const avgKcal = days.length ? days.reduce((a, d) => a + d.kcal, 0) / days.length : 0;
    const avgProteinG = days.length ? days.reduce((a, d) => a + d.proteinG, 0) / days.length : 0;
    const daysOnTrack = goals
      ? days.filter((d) => d.kcal >= goals.kcalMin && d.kcal <= goals.kcalMax).length
      : 0;

    const sessionInfos = sessions.map((s) => {
      const volumeKg = s.sets
        .filter((set) => set.weightKg && set.reps && set.exercise.muscleGroup !== 'cardio')
        .reduce((a, set) => a + (set.weightKg ?? 0) * (set.reps ?? 0), 0);
      return {
        date: s.startedAt.toISOString().slice(0, 10),
        planName: s.plan?.name ?? null,
        volumeKg,
      };
    });

    const cardioSets = sessions.flatMap((s) =>
      s.sets.filter((set) => set.exercise.muscleGroup === 'cardio'),
    );
    const cardioSessionIds = new Set(
      sessions
        .filter((s) => s.sets.some((set) => set.exercise.muscleGroup === 'cardio'))
        .map((s) => s.id),
    );
    const totalDurationSeconds = cardioSets.reduce((a, s) => a + (s.durationSeconds ?? 0), 0);
    const totalDistanceMeters = cardioSets.reduce((a, s) => a + (s.distanceMeters ?? 0), 0);

    let totalSteps = 0;
    let daysWithGoalReached = 0;
    const stepsTarget = goals?.dailyStepsTarget ?? null;
    for (let i = 0; i < 7; i++) {
      const d = addDaysIso(weekStart, i);
      const { steps } = await this.stepLogs.getStepsForDate(d, ctx.userId);
      totalSteps += steps;
      if (stepsTarget !== null && steps >= stepsTarget) daysWithGoalReached++;
    }
    const avgDaily = totalSteps / 7;

    const startKg = weightLogs.length ? weightLogs[0].weightKg : null;
    const currentKg = weightLogs.length ? weightLogs[weightLogs.length - 1].weightKg : null;
    const deltaKg = startKg !== null && currentKg !== null ? currentKg - startKg : null;

    return {
      weekStart,
      weekEnd,
      nutrition: { avgKcal, avgProteinG, daysOnTrack },
      workouts: {
        completed: sessions.length,
        target: goals?.weeklyWorkouts ?? 0,
        sessions: sessionInfos,
      },
      cardio: {
        sessionCount: cardioSessionIds.size,
        totalDurationSeconds,
        totalDistanceMeters,
      },
      steps: { totalSteps, avgDaily, daysWithGoalReached, target: stepsTarget },
      weight: { startKg, currentKg, deltaKg },
    };
  }

  private async computeNutritionStreak(ctx: UserCtx): Promise<number> {
    const today = todayInTz(ctx.timezone);
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = addDaysIso(today, -i);
      const { start, end } = dayBoundsInTz(d, ctx.timezone);
      const hasMeal = await this.prisma.meal.count({
        where: { userId: ctx.userId, eatenAt: { gte: start, lte: end } },
      });
      if (hasMeal === 0) break;
      streak++;
    }
    return streak;
  }

  private async computeWorkoutWeeks(ctx: UserCtx): Promise<number> {
    const today = todayInTz(ctx.timezone);
    let weeks = 0;
    for (let i = 0; i < 12; i++) {
      const ref = addDaysIso(today, -7 * i);
      const ws = weekStartInTz(new Date(`${ref}T12:00:00Z`), ctx.timezone);
      const we = addDaysIso(ws, 6);
      const count = await this.prisma.workoutSession.count({
        where: {
          userId: ctx.userId,
          completedAt: { gte: new Date(`${ws}T00:00:00Z`), lte: new Date(`${we}T23:59:59Z`) },
        },
      });
      if (count === 0) break;
      weeks++;
    }
    return weeks;
  }

  private async computeStepsStreak(ctx: UserCtx, target: number | null): Promise<number> {
    if (target === null) return 0;
    const today = todayInTz(ctx.timezone);
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = addDaysIso(today, -i);
      const { steps } = await this.stepLogs.getStepsForDate(d, ctx.userId);
      if (steps < target) break;
      streak++;
    }
    return streak;
  }
}
