import { apiFetch } from '../api';

export type MuscleGroup =
  | 'CHEST'
  | 'BACK'
  | 'SHOULDERS'
  | 'BICEPS'
  | 'TRICEPS'
  | 'LEGS'
  | 'GLUTES'
  | 'CORE'
  | 'CARDIO'
  | 'FULL_BODY'
  | 'OTHER';

export type ExerciseSource = 'SEED' | 'CUSTOM';

export interface Exercise {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  source: ExerciseSource;
  createdByUserId: string | null;
}

export interface SessionSet {
  id: string;
  sessionId: string;
  exerciseId: number;
  setNumber: number;
  // strength
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  // cardio
  durationSeconds: number | null;
  distanceMeters: number | null;
  avgHeartRate: number | null;
  kcalBurned: number | null;
  notes: string | null;
  exercise: Exercise;
}

export interface PlannedExercise {
  exerciseId: number;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  order: number;
  targetSets: number;
  targetReps: string;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  planId: string | null;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  sets?: SessionSet[];
  plannedExercises?: PlannedExercise[];
}

export interface WorkoutPlanExercise {
  id: string;
  planId: string;
  exerciseId: number;
  order: number;
  targetSets: number;
  targetReps: string;
  exercise: Exercise;
}

export interface WorkoutPlan {
  id: string;
  userId: string;
  name: string;
  exercises: WorkoutPlanExercise[];
}

export const workoutApi = {
  // Sessions
  getActiveSession: () => apiFetch<WorkoutSession | null>('/api/workout/sessions/active'),
  getSession: (id: string) => apiFetch<WorkoutSession>(`/api/workout/sessions/${id}`),
  listSessions: (params?: { date?: string; cursor?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.date) qs.set('date', params.date);
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiFetch<WorkoutSession[]>(`/api/workout/sessions${q ? `?${q}` : ''}`);
  },
  startSession: (body: { planId?: string; startedAt?: string; notes?: string }) =>
    apiFetch<WorkoutSession>('/api/workout/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  finishSession: (id: string, body?: { notes?: string }) =>
    apiFetch<WorkoutSession>(`/api/workout/sessions/${id}/finish`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  deleteSession: (id: string) =>
    apiFetch<void>(`/api/workout/sessions/${id}`, { method: 'DELETE' }),

  // Sets
  logSet: (
    sessionId: string,
    body: {
      exerciseId: number;
      weightKg?: number;
      reps?: number;
      rpe?: number;
      durationSeconds?: number;
      distanceMeters?: number;
      avgHeartRate?: number;
      kcalBurned?: number;
      notes?: string;
    },
  ) =>
    apiFetch<SessionSet>(`/api/workout/sessions/${sessionId}/sets`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSet: (
    sessionId: string,
    id: string,
    body: {
      weightKg?: number;
      reps?: number;
      rpe?: number;
      durationSeconds?: number;
      distanceMeters?: number;
      avgHeartRate?: number;
      kcalBurned?: number;
      notes?: string;
    },
  ) =>
    apiFetch<SessionSet>(`/api/workout/sessions/${sessionId}/sets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteSet: (sessionId: string, id: string) =>
    apiFetch<void>(`/api/workout/sessions/${sessionId}/sets/${id}`, { method: 'DELETE' }),

  // Plans
  listPlans: () => apiFetch<WorkoutPlan[]>('/api/workout/plans'),
  getPlan: (id: string) => apiFetch<WorkoutPlan>(`/api/workout/plans/${id}`),
  createPlan: (body: { name: string }) =>
    apiFetch<WorkoutPlan>('/api/workout/plans', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePlan: (id: string, body: { name?: string }) =>
    apiFetch<WorkoutPlan>(`/api/workout/plans/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deletePlan: (id: string) => apiFetch<void>(`/api/workout/plans/${id}`, { method: 'DELETE' }),

  // Plan exercises
  addPlanExercise: (
    planId: string,
    body: { exerciseId: number; order: number; targetSets: number; targetReps: string },
  ) =>
    apiFetch<WorkoutPlanExercise>(`/api/workout/plans/${planId}/exercises`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePlanExercise: (
    planId: string,
    id: string,
    body: { order?: number; targetSets?: number; targetReps?: string },
  ) =>
    apiFetch<WorkoutPlanExercise>(`/api/workout/plans/${planId}/exercises/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  removePlanExercise: (planId: string, id: string) =>
    apiFetch<void>(`/api/workout/plans/${planId}/exercises/${id}`, { method: 'DELETE' }),

  // Exercises
  searchExercises: (q?: string, muscleGroup?: MuscleGroup) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (muscleGroup) qs.set('muscleGroup', muscleGroup);
    const query = qs.toString();
    return apiFetch<Exercise[]>(`/api/workout/exercises${query ? `?${query}` : ''}`);
  },
  getLastSet: (exerciseId: number) =>
    apiFetch<SessionSet | null>(`/api/workout/exercises/${exerciseId}/last-set`),
  getPersonalRecord: (exerciseId: number) =>
    apiFetch<
      | { weightKg: number | null; reps: number | null; sessionDate: string }
      | {
          distanceMeters: number | null;
          durationSeconds: number | null;
          sessionDate: string | null;
        }
      | null
    >(`/api/workout/exercises/${exerciseId}/pr`),
};
