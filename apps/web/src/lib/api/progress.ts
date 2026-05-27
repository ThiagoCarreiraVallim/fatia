import { apiFetch } from '../api';

export interface WeightLog {
  id: string;
  weightKg: number;
  loggedAt: string;
  notes: string | null;
}

export interface StepLog {
  id: string;
  date: string;
  steps: number;
  source: string;
  loggedAt: string;
  notes: string | null;
}

export interface WeightProgress {
  points: Array<{ date: string; weightKg: number }>;
  weeklyAverages: Array<{ weekStart: string; avgKg: number; deltaKg: number | null }>;
  totalDeltaKg: number;
  currentWeightKg: number | null;
}

export interface StrengthProgress {
  exercise: { id: number; name: string };
  metric: string;
  points: Array<{
    sessionDate: string;
    sessionId: string;
    value: number;
    bestSet: { weightKg: number; reps: number };
  }>;
  startValue: number | null;
  currentValue: number | null;
  deltaPercent: number | null;
}

export interface CardioProgress {
  exercise: { id: number; name: string };
  metric: string;
  points: Array<{
    sessionDate: string;
    sessionId: string;
    durationSeconds: number;
    distanceMeters: number | null;
    paceSecondsPerKm: number | null;
    kcalBurned: number | null;
    value: number;
  }>;
  bestSession: { sessionId: string; sessionDate: string; value: number } | null;
}

export interface StepsProgress {
  points: Array<{ date: string; steps: number; goalReached: boolean | null }>;
  weeklyAverages: Array<{ weekStart: string; avgSteps: number }>;
  totalSteps: number;
  averageDaily: number;
  bestDay: { date: string; steps: number } | null;
  goalTarget: number | null;
  daysWithGoalReached: number;
}

export interface WaterLog {
  id: string;
  date: string;
  ml: number;
  loggedAt: string;
  notes: string | null;
}

export interface WaterProgress {
  points: Array<{ date: string; totalMl: number; goalReached: boolean | null }>;
  totalMl: number;
  averageDailyMl: number;
  bestDay: { date: string; totalMl: number } | null;
  goalTargetMl: number | null;
  daysWithGoalReached: number;
}

export interface TodaySummary {
  date: string;
  nutrition: {
    consumed: { kcal: number; proteinG: number; carbsG: number; fatG: number };
    goals: {
      kcalMin: number;
      kcalMax: number;
      proteinMinG: number;
      proteinMaxG: number;
      carbsMinG: number;
      carbsMaxG: number;
      fatMinG: number;
      fatMaxG: number;
      dailyStepsTarget: number;
    } | null;
    mealsLogged: number;
    onTrack: boolean | null;
  };
  workout: {
    plannedToday: { planId: string; name: string } | null;
    sessionInProgress: { id: string; startedAt: string } | null;
    completedToday: boolean;
  };
  weight: { latest: { weightKg: number; loggedAt: string } | null; loggedToday: boolean };
  steps: { today: number; target: number | null; goalReached: boolean | null; logged: boolean };
  water: {
    todayMl: number;
    targetMl: number | null;
    goalReached: boolean | null;
    logged: boolean;
  };
  streak: { nutritionDays: number; workoutWeeks: number; stepsDays: number };
}

export const progressApi = {
  // Weight logs
  listWeights: (params: { from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    return apiFetch<{ logs: WeightLog[]; nextCursor?: string }>(
      `/api/weight-logs${qs.toString() ? `?${qs.toString()}` : ''}`,
    );
  },
  createWeight: (body: { weightKg: number; loggedAt?: string; notes?: string }) =>
    apiFetch<WeightLog>('/api/weight-logs', { method: 'POST', body: JSON.stringify(body) }),
  updateWeight: (id: string, body: { weightKg?: number; notes?: string }) =>
    apiFetch<WeightLog>(`/api/weight-logs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteWeight: (id: string) => apiFetch<void>(`/api/weight-logs/${id}`, { method: 'DELETE' }),

  // Step logs
  listSteps: (params: { from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    return apiFetch<{ logs: StepLog[]; nextCursor?: string }>(
      `/api/step-logs${qs.toString() ? `?${qs.toString()}` : ''}`,
    );
  },
  createStep: (body: { steps: number; date?: string; notes?: string }) =>
    apiFetch<StepLog>('/api/step-logs', { method: 'POST', body: JSON.stringify(body) }),
  updateStep: (id: string, body: { steps?: number; notes?: string }) =>
    apiFetch<StepLog>(`/api/step-logs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteStep: (id: string) => apiFetch<void>(`/api/step-logs/${id}`, { method: 'DELETE' }),

  // Water logs
  listWater: (params: { from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    return apiFetch<{ logs: WaterLog[]; nextCursor?: string }>(
      `/api/water-logs${qs.toString() ? `?${qs.toString()}` : ''}`,
    );
  },
  createWater: (body: { ml: number; date?: string; notes?: string }) =>
    apiFetch<WaterLog>('/api/water-logs', { method: 'POST', body: JSON.stringify(body) }),
  updateWater: (id: string, body: { ml?: number; date?: string; notes?: string }) =>
    apiFetch<WaterLog>(`/api/water-logs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteWater: (id: string) => apiFetch<void>(`/api/water-logs/${id}`, { method: 'DELETE' }),
  waterForDate: (date: string) =>
    apiFetch<{ date: string; totalMl: number; logCount: number }>(
      `/api/water-logs/by-date/${date}`,
    ),

  // Progress queries
  weight: (days: number) => apiFetch<WeightProgress>(`/api/progress/weight?days=${days}`),
  strength: (exerciseId: number, days: number, metric: string) =>
    apiFetch<StrengthProgress>(
      `/api/progress/strength?exerciseId=${exerciseId}&days=${days}&metric=${metric}`,
    ),
  cardio: (exerciseId: number, days: number, metric: string) =>
    apiFetch<CardioProgress>(
      `/api/progress/cardio?exerciseId=${exerciseId}&days=${days}&metric=${metric}`,
    ),
  steps: (days: number) => apiFetch<StepsProgress>(`/api/progress/steps?days=${days}`),
  water: (days: number) => apiFetch<WaterProgress>(`/api/progress/water?days=${days}`),

  // Dashboard
  today: () => apiFetch<TodaySummary>('/api/dashboard/today'),
};
