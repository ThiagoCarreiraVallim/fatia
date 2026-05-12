import { apiFetch } from '../api';

export interface WeightLog {
  id: string;
  weightKg: number;
  loggedAt: string;
  notes: string | null;
}

export interface WeightProgress {
  points: { id: string; date: string; weightKg: number }[];
  weeklyAvg: { weekStart: string; avg: number }[];
  delta: number | null;
}

export interface StepsProgress {
  points: { date: string; steps: number }[];
  weeklyAvg: { weekStart: string; avg: number }[];
  daysHitGoal: number;
  dailyTarget: number;
}

export interface StrengthProgress {
  exerciseId: number;
  metric: string;
  points: { sessionId: string; date: string; value: number }[];
  weeklyAvg: { weekStart: string; avg: number }[];
}

export interface CardioProgress {
  exerciseId: number;
  metric: string;
  points: { sessionId: string; date: string; value: number }[];
  weeklyAvg: { weekStart: string; avg: number }[];
}

export interface VolumeProgress {
  weeks: { weekStart: string; volume: number }[];
  muscleGroup: string | null;
}

function tz() {
  return encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export const progressApi = {
  weightProgress: (days: number) =>
    apiFetch<WeightProgress>(`/api/progress/weight?days=${days}&timezone=${tz()}`),
  stepsProgress: (days: number) =>
    apiFetch<StepsProgress>(`/api/progress/steps?days=${days}&timezone=${tz()}`),
  strengthProgress: (exerciseId: number, metric: string, days: number) =>
    apiFetch<StrengthProgress>(
      `/api/progress/strength?exerciseId=${exerciseId}&metric=${metric}&days=${days}`,
    ),
  cardioProgress: (exerciseId: number, metric: string, days: number) =>
    apiFetch<CardioProgress>(
      `/api/progress/cardio?exerciseId=${exerciseId}&metric=${metric}&days=${days}`,
    ),
  volumeProgress: (days: number, muscleGroup?: string) =>
    apiFetch<VolumeProgress>(
      `/api/progress/volume?days=${days}${muscleGroup ? `&muscleGroup=${muscleGroup}` : ''}`,
    ),
  logWeight: (body: { weightKg: number; loggedAt: string; notes?: string }) =>
    apiFetch<WeightLog>('/api/weight-logs', { method: 'POST', body: JSON.stringify(body) }),
  listWeightLogs: (days?: number) =>
    apiFetch<WeightLog[]>(`/api/weight-logs${days ? `?days=${days}` : ''}`),
  deleteWeightLog: (id: string) => apiFetch<void>(`/api/weight-logs/${id}`, { method: 'DELETE' }),
  logSteps: (body: { date: string; steps: number; notes?: string }) =>
    apiFetch<{ id: string; steps: number; date: string }>('/api/step-logs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
