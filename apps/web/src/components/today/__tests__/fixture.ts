import type { StreakResult, TodaySummary, WeightProgress } from '@fatia/api-client';

const streak = (periodos: number): StreakResult => ({
  periodos,
  faltasUsadas: 0,
  faltasPermitidas: 0,
  periodoCorrenteEmAberto: false,
  janelaEsgotada: false,
});

/** Um Hoje da prancha Al-H1: 2 de 5 metas, 800 mL de água, 70,2 kg. */
export function todaySummary(partial: Partial<TodaySummary> = {}): TodaySummary {
  return {
    date: '2026-11-14',
    nutrition: {
      consumed: { kcal: 934, proteinG: 71, carbsG: 133, fatG: 12 },
      goals: {
        kcalMin: 1800,
        kcalMax: 2200,
        proteinMinG: 130,
        proteinMaxG: 150,
        carbsMinG: 200,
        carbsMaxG: 240,
        fatMinG: 55,
        fatMaxG: 70,
        dailyStepsTarget: 8000,
        dailyWaterTargetMl: 2500,
      },
      mealsLogged: 2,
      onTrack: true,
    },
    workout: {
      plannedToday: { planId: 'p1', name: 'Legs' },
      nextPlan: { planId: 'p1', name: 'Legs', source: 'BLOCK', exerciseCount: 6 },
      sessionInProgress: null,
      completedToday: false,
    },
    weight: {
      latest: { weightKg: 70.2, loggedAt: '2026-11-13T10:00:00.000Z' },
      loggedToday: false,
      change30dKg: -2.5,
    },
    steps: { today: 4231, target: 8000, goalReached: false, logged: true },
    water: { todayMl: 800, targetMl: 2500, goalReached: false, logged: true },
    streak: {
      activeDays: streak(12),
      nutritionDays: streak(3),
      workoutWeeks: streak(1),
      stepsDays: streak(0),
      stepsTargetSet: true,
    },
    achievements: [],
    dailyGoals: {
      met: 2,
      total: 5,
      items: [
        {
          key: 'kcal',
          label: 'Calorias',
          unit: 'kcal',
          current: 934,
          min: 1800,
          max: 2200,
          met: false,
          percent: 47,
        },
        {
          key: 'protein',
          label: 'Proteína',
          unit: 'g',
          current: 140,
          min: 130,
          max: 150,
          met: true,
          percent: 100,
        },
        {
          key: 'water',
          label: 'Água',
          unit: 'mL',
          current: 800,
          min: 2500,
          max: null,
          met: false,
          percent: 32,
        },
        {
          key: 'steps',
          label: 'Passos',
          unit: 'passos',
          current: 8100,
          min: 8000,
          max: null,
          met: true,
          percent: 100,
        },
        {
          key: 'workout',
          label: 'Treino',
          unit: '',
          current: 0,
          min: null,
          max: null,
          met: false,
          percent: 0,
          planName: 'Legs',
        },
      ],
    },
    inbox: { unread: 0 },
    todo: { count: 0, items: [] },
    receivedPlan: null,
    nextEvent: null,
    ...partial,
  };
}

/** Pesagens de 30 dias: 72,7 → 70,2, a última ontem e a anterior na sexta. */
export function weightProgress(partial: Partial<WeightProgress> = {}): WeightProgress {
  return {
    points: [
      { date: '2026-10-16', weightKg: 72.7 },
      { date: '2026-11-06', weightKg: 70.4 },
      { date: '2026-11-13', weightKg: 70.2 },
    ],
    weeklyAverages: [],
    totalDeltaKg: -2.5,
    currentWeightKg: 70.2,
    latest: {
      id: 'w-last',
      weightKg: 70.2,
      date: '2026-11-13',
      loggedAt: '2026-11-13T10:00:00.000Z',
    },
    previous: { weightKg: 70.4, date: '2026-11-06' },
    deltaSinceLastKg: -0.2,
    ...partial,
  };
}
