import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StepLogService } from './step-log.service';
import { WeightLogService } from './weight-log.service';
import { WaterLogService } from './water-log.service';
import { StreakService } from './streak.service';
import { AchievementService, type AchievementEntry } from './achievement.service';
import { addDaysIso, dayBoundsInTz, todayInTz, weekStartInTz } from './helpers/date-tz';

interface UserCtx {
  userId: string;
  timezone: string;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stepLogs: StepLogService,
    private readonly weightLogs: WeightLogService,
    private readonly waterLogs: WaterLogService,
    private readonly streaks: StreakService,
    private readonly achievements: AchievementService,
  ) {}

  async today(ctx: UserCtx) {
    const date = todayInTz(ctx.timezone);
    const { start: dayStart, end: dayEnd } = dayBoundsInTz(date, ctx.timezone);

    const [
      meals,
      goals,
      sessionInProgress,
      completedSession,
      latestWeight,
      stepsToday,
      waterToday,
      streak,
    ] = await Promise.all([
      this.prisma.meal.findMany({
        // `lt`, não `lte`: o `end` do `dayBoundsInTz` é a meia-noite do dia SEGUINTE, então
        // `lte` faz o instante da virada pertencer aos dois dias. O resto do produto já usa
        // `lt` (nutrition-summary, nutrient-target, meal) — só o dashboard divergia, e por
        // isso a mesma refeição podia somar em dois lugares com respostas diferentes.
        where: { userId: ctx.userId, eatenAt: { gte: dayStart, lt: dayEnd } },
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
          completedAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.weightLogs.getLatest(ctx.userId),
      this.stepLogs.getStepsForDate(date, ctx.userId),
      this.waterLogs.getForDate(date, ctx.userId),
      this.streaks.compute(ctx),
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

    const waterTargetMl = goals?.dailyWaterTargetMl ?? null;
    const waterGoalReached = waterTargetMl !== null ? waterToday.totalMl >= waterTargetMl : null;

    const latestWeightToday =
      latestWeight && latestWeight.loggedAt >= dayStart && latestWeight.loggedAt <= dayEnd;

    // Só LÊ. Desbloquear aqui gravaria em `UserAchievement` no meio de um `GET` — a tool
    // `get_today_summary` declara `readOnlyHint: true` e o Claude a chama sem confirmar, então
    // "quanto comi hoje?" acabava criando até 7 linhas. Quem escreve é `refresh_achievements`.
    //
    // Conquista é enfeite; dashboard é o produto. Se a leitura falhar, a tela ainda abre — e o
    // erro fica no log em vez de virar 500 na cara de quem só queria ver as calorias.
    let achievements: AchievementEntry[] = [];
    try {
      achievements = await this.achievements.list(ctx);
    } catch (err: unknown) {
      this.logger.error({
        event: 'achievement_read_failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }

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
      water: {
        todayMl: waterToday.totalMl,
        targetMl: waterTargetMl,
        goalReached: waterGoalReached,
        logged: waterToday.logCount > 0,
      },
      streak,
      achievements,
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
}
