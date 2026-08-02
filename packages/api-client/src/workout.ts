import { apiFetch } from './http';

export type MuscleGroup =
  | 'peito'
  | 'costas'
  | 'pernas'
  | 'ombro'
  | 'braço'
  | 'core'
  | 'cardio'
  // `string & {}` mantém o autocomplete das opções acima sem fechar o tipo — o
  // catálogo aceita grupo muscular fora da lista. A regra que reclamava disto
  // era `ban-types`, removida no typescript-eslint v8; a sucessora
  // (`no-empty-object-type`) não reclama deste caso, por isso não há diretiva
  // de exceção aqui — e o `eslint --fix` do pre-commit apaga a que houver.
  | (string & {});

export type ExerciseSource = 'SEED' | 'CUSTOM';

export interface Exercise {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  source: ExerciseSource;
  createdByUserId: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  level: string | null;
  mechanic: string | null;
  instructions: string[];
  youtubeVideoId: string | null;
  youtubeVideoIdPt: string | null;
}

// Campos editáveis de um exercício (custom ou cópia). Músculos devem usar as chaves
// em inglês do diagrama (chest, abdominals, ...).
export type ExerciseEditInput = Partial<{
  name: string;
  muscleGroup: MuscleGroup;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  level: string;
  mechanic: string;
  instructions: string[];
  youtubeVideoId: string;
  youtubeVideoIdPt: string;
}>;

export interface SessionSet {
  id: string;
  sessionId: string;
  exerciseId: number;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
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
  /**
   * Reordena exercícios do plano em **uma** escrita.
   *
   * Reordenar por `updatePlanExercise` exige um PATCH por exercício movido, e
   * duas escritas para uma operação lógica não são atômicas: entre a primeira e
   * a segunda a lista fica num estado que ninguém pediu. Aqui a API resolve
   * tudo dentro de uma transação e devolve o plano inteiro já reordenado.
   *
   * Contrato: a API grava `order` **exatamente nos ids enviados** e não toca em
   * mais nada do plano. Por isso mande só quem mudou de posição — incluir quem
   * ficou parado sobrescreveria o `order` que outro cliente (o Claude, via
   * `reorder_plan_exercises`) pode ter acabado de gravar.
   *
   * A mesma frase está na descrição do tool MCP e em `docs/MCP.md`; os três
   * consomem este endpoint e precisam dizer a mesma coisa.
   */
  reorderPlanExercises: (planId: string, exercises: Array<{ id: string; order: number }>) =>
    apiFetch<WorkoutPlan>(`/api/workout/plans/${planId}/exercises/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ exercises }),
    }),

  searchExercises: (q?: string, muscleGroup?: MuscleGroup) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (muscleGroup) qs.set('muscleGroup', muscleGroup);
    const query = qs.toString();
    return apiFetch<Exercise[]>(`/api/workout/exercises${query ? `?${query}` : ''}`);
  },
  getExercise: (id: number) => apiFetch<Exercise>(`/api/workout/exercises/${id}`),
  updateExercise: (id: number, body: ExerciseEditInput) =>
    apiFetch<Exercise>(`/api/workout/exercises/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  // Cria (ou reaproveita) a cópia editável de um exercício base. Retorna a cópia (custom).
  cloneExercise: (id: number, body?: ExerciseEditInput) =>
    apiFetch<Exercise>(`/api/workout/exercises/${id}/clone`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  /**
   * Última série registrada do exercício. Com `before` (ISO), só sessões
   * iniciadas **antes** disso — é assim que a sessão em andamento fica de fora
   * sem o chamador ter de filtrar o que já veio.
   */
  getLastSet: (exerciseId: number, before?: string) => {
    const qs = before ? `?before=${encodeURIComponent(before)}` : '';
    return apiFetch<SessionSet | null>(`/api/workout/exercises/${exerciseId}/last-set${qs}`);
  },
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
  listPersonalRecords: () => apiFetch<PersonalRecordEntry[]>('/api/workout/records'),
};

export interface PersonalRecordEntry {
  exerciseId: number;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  type: 'strength' | 'cardio';
  maxWeightKg: number | null;
  repsAtMax: number | null;
  estimated1RM: number | null;
  maxDistanceMeters: number | null;
  bestDurationSeconds: number | null;
  achievedAt: string | null;
  lastPerformedAt: string | null;
  totalSets: number;
}
