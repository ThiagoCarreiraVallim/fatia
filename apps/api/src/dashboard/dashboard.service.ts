import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NutritionSummaryService } from '../nutrition/nutrition-summary.service';
import { UserGoalsService } from '../nutrition/user-goals.service';
import { WeightLogService } from '../progress/weight-log.service';
import { StepLogService } from '../progress/step-log.service';
import { dateInTz, startOfWeekInTz } from '../progress/helpers/date-utils';
import { isCardioExercise } from '../workout/helpers/is-cardio';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nutritionSummary: NutritionSummaryService,
    private readonly userGoals: UserGoalsService,
    private readonly weightLogs: WeightLogService,
    private readonly stepLogs: StepLogService,
  ) {}

  async today(userId: string, timezone: string) {
    const date = dateInTz(new Date(), timezone);

    const [dayNutrition, goals, session, todayWeight, steps] = await Promise.all([
      this.nutritionSummary.getDay(userId, date),
      this.userGoals.get(userId),
      this.prisma.workoutSession.findFirst({
        where: {
          userId,
          startedAt: { gte: new Date(`${date}T00:00:00Z`) },
        },
        include: {
          sets: { select: { exerciseId: true, weightKg: true, reps: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.weightLog.findFirst({
        where: {
          userId,
          loggedAt: { gte: new Date(`${date}T00:00:00Z`) },
        },
        orderBy: { loggedAt: 'desc' },
      }),
      this.stepLogs.getStepsForDate(userId, date),
    ]);

    const lastWeightLog =
      todayWeight ??
      (await this.prisma.weightLog.findFirst({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
      }));

    const dailyStepsGoal = goals?.dailyStepsTarget ?? 8000;

    return {
      date,
      nutrition: {
        totals: dayNutrition.totals,
        mealsCount: dayNutrition.mealsCount,
        goals,
      },
      workout: {
        hasSession: !!session,
        sessionId: session?.id ?? null,
        exercisesLogged: session ? new Set(session.sets.map((s) => s.exerciseId)).size : 0,
        volumeKg: session
          ? session.sets.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
          : 0,
      },
      weight: {
        today: todayWeight?.weightKg ?? null,
        lastLogDate: lastWeightLog?.loggedAt?.toISOString().slice(0, 10) ?? null,
      },
      steps: {
        today: steps,
        goal: dailyStepsGoal,
        percentGoal: dailyStepsGoal > 0 ? Math.round((steps / dailyStepsGoal) * 100) : 0,
      },
    };
  }

  async week(userId: string, timezone: string) {
    const today = new Date();
    const weekStart = startOfWeekInTz(today, timezone);
    const weekStartDate = new Date(`${weekStart}T00:00:00Z`);

    const [sessions, stepHistory] = await Promise.all([
      this.prisma.workoutSession.findMany({
        where: { userId, startedAt: { gte: weekStartDate } },
        include: {
          sets: {
            include: { exercise: { select: { muscleGroup: true } } },
          },
        },
      }),
      this.stepLogs.getHistory(userId, 7, timezone),
    ]);

    const weekDays = stepHistory.map((d) => d.date);

    const dayNutritions = await Promise.all(
      weekDays.map((date) => this.nutritionSummary.getDay(userId, date)),
    );

    const goals = await this.userGoals.get(userId);
    const dailyStepsGoal = goals?.dailyStepsTarget ?? 8000;

    const daysWithData = dayNutritions.filter((d) => d.totals.kcal > 0);
    const avgKcal =
      daysWithData.length > 0
        ? Math.round(daysWithData.reduce((s, d) => s + d.totals.kcal, 0) / daysWithData.length)
        : 0;
    const avgProteinG =
      daysWithData.length > 0
        ? Math.round(
            (daysWithData.reduce((s, d) => s + d.totals.proteinG, 0) / daysWithData.length) * 10,
          ) / 10
        : 0;

    const sessionsCount = sessions.length;
    let totalDurationMin = 0;
    let totalVolumeKg = 0;
    let cardioMinutes = 0;

    for (const session of sessions) {
      if (session.completedAt && session.startedAt) {
        totalDurationMin += Math.round(
          (session.completedAt.getTime() - session.startedAt.getTime()) / 60000,
        );
      }
      for (const s of session.sets) {
        if (
          s.weightKg != null &&
          s.reps != null &&
          !isCardioExercise({ muscleGroup: s.exercise.muscleGroup })
        ) {
          totalVolumeKg += s.weightKg * s.reps;
        }
        if (
          isCardioExercise({ muscleGroup: s.exercise.muscleGroup }) &&
          s.durationSeconds != null
        ) {
          cardioMinutes += Math.round(s.durationSeconds / 60);
        }
      }
    }

    const totalSteps = stepHistory.reduce((s, d) => s + d.steps, 0);
    const daysHitGoal = stepHistory.filter((d) => d.steps >= dailyStepsGoal).length;
    const avgSteps = stepHistory.length > 0 ? Math.round(totalSteps / stepHistory.length) : 0;

    return {
      weekStart,
      nutrition: { avgKcal, avgProteinG },
      workout: {
        sessionsCount,
        totalDurationMin,
        totalVolumeKg: Math.round(totalVolumeKg * 100) / 100,
        cardioMinutes,
      },
      steps: { totalSteps, daysHitGoal, avgSteps },
    };
  }
}
