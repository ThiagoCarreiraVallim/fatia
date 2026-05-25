import { apiFetch } from '../api';

export type GoalKind = 'weight' | 'body_fat' | 'workout_frequency' | 'step_count' | 'custom';
export type GoalStatus = 'active' | 'completed' | 'expired' | 'archived';

export interface Goal {
  id: string;
  userId: string;
  kind: GoalKind;
  title: string;
  description: string | null;
  startValue: number;
  targetValue: number;
  unit: string;
  lastReportedValue: number | null;
  deadline: string | null;
  status: GoalStatus;
  createdAt: string;
  completedAt: string | null;
  currentValue: number | null;
  progressPercent: number | null;
}

export interface CreateGoalInput {
  kind: GoalKind;
  title: string;
  description?: string;
  startValue?: number;
  targetValue: number;
  unit: string;
  deadline?: string;
  lastReportedValue?: number;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  targetValue?: number;
  unit?: string;
  deadline?: string;
  lastReportedValue?: number;
  status?: GoalStatus;
}

export const goalsApi = {
  list: (params: { status?: GoalStatus; kind?: GoalKind } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.kind) qs.set('kind', params.kind);
    return apiFetch<Goal[]>(`/api/goals${qs.toString() ? `?${qs.toString()}` : ''}`);
  },
  get: (id: string) => apiFetch<Goal>(`/api/goals/${id}`),
  create: (body: CreateGoalInput) =>
    apiFetch<Goal>('/api/goals', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: UpdateGoalInput) =>
    apiFetch<Goal>(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  complete: (id: string) => apiFetch<Goal>(`/api/goals/${id}/complete`, { method: 'POST' }),
  delete: (id: string) => apiFetch<void>(`/api/goals/${id}`, { method: 'DELETE' }),
};
