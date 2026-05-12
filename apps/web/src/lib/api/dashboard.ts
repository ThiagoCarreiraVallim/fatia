import { apiFetch } from '../api';

export interface TodaySummary {
  date: string;
  nutrition: {
    totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
    mealsCount: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    goals: any | null;
  };
  workout: {
    hasSession: boolean;
    sessionId: string | null;
    exercisesLogged: number;
    volumeKg: number;
  };
  weight: { today: number | null; lastLogDate: string | null };
  steps: { today: number; goal: number; percentGoal: number };
}

export const dashboardApi = {
  today: (timezone?: string) =>
    apiFetch<TodaySummary>(
      `/api/dashboard/today?timezone=${encodeURIComponent(timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
    ),
};
