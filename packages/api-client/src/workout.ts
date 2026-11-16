import { apiFetch } from './http';
import type { MediaView } from './community-content';
import type { GymEquipmentState } from './community-exercises';
import type {
  CircuitConfigInput,
  CircuitDefinition,
  CircuitEvent,
  CircuitFormat,
  CircuitResult,
} from './workout/circuit-timer';

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
  /** Criado por uma comunidade (Fase 7b). */
  groupOwned?: boolean;
  /** Na busca: a comunidade da pessoa que destaca este exercício. */
  communityName?: string | null;
  /** No detalhe: o tutorial da comunidade da pessoa, se houver. */
  community?: CommunityGuide | null;
  /** Na busca e no detalhe: a pessoa marcou como favorito (#378). */
  favorite?: boolean;
}

/** Vídeo, fotos e dicas que a comunidade da pessoa pôs no exercício (ADR 030). */
export interface CommunityGuide {
  groupId: string;
  groupName: string;
  video: MediaView | null;
  photos: MediaView[];
  tips: string | null;
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

// Configuração do exercício no plano (#378, Al-T21 e Al-T21d).
export type PlanRepUnit = 'REPS' | 'SECONDS';
export type PlanLoadMode = 'WEIGHT' | 'BODYWEIGHT';
export type PlanTechnique = 'NORMAL' | 'DROP_SET' | 'TO_FAILURE';
export type PlanSetKind = 'WARMUP' | 'NORMAL' | 'DROP';
export type CardioTargetKind = 'TIME' | 'DISTANCE';
export type CardioIntensity = 'LIGHT' | 'MODERATE' | 'VIGOROUS';

/** Uma série da tabela série por série (Al-T21b). `reps` é segundos com `repUnit = SECONDS`. */
export interface PlanSet {
  order: number;
  kind: PlanSetKind;
  reps: number;
  loadKg: number | null;
}

/** O que a linha do plano configura, além de séries e faixa. */
export interface PlanExerciseConfig {
  repUnit: PlanRepUnit;
  loadMode: PlanLoadMode;
  /** Sempre em kg; a tela converte para lb. Com BODYWEIGHT, o peso extra. */
  startLoadKg: number | null;
  /** Nulo = o descanso padrão da sessão. */
  restSeconds: number | null;
  technique: PlanTechnique;
  biSetWithNext: boolean;
  notes: string | null;
  cardioTarget: CardioTargetKind | null;
  cardioDurationSeconds: number | null;
  cardioDistanceMeters: number | null;
  cardioIntensity: CardioIntensity | null;
}

/**
 * O exercício do plano como a sessão lê. A #377 usa `restSeconds` no timer,
 * a meta de cardio e a intensidade como guia, `biSetWithNext` na ordem de
 * execução e `sets` para a meta de cada série. `planExerciseId` identifica a
 * linha do plano (cada exercício entra uma vez por plano).
 */
export interface PlannedExercise extends Partial<PlanExerciseConfig> {
  /** Opcional só para quem monta a sessão à mão (testes, treino rápido); a API sempre manda. */
  planExerciseId?: string;
  exerciseId: number;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  order: number;
  targetSets: number;
  targetReps: string;
  sets?: PlanSet[];
}

/** As respostas rápidas do fim do treino (#377). Escalas de 1 a 5. */
export interface WorkoutCheckin {
  id: string;
  sessionId: string;
  skipped: boolean;
  difficulty: number | null;
  fatigue: number | null;
  pain: boolean | null;
  painLocation: string | null;
  motivation: number | null;
  note: string | null;
  answeredAt: string;
  updatedAt: string;
}

export interface WorkoutCheckinInput {
  skipped?: boolean;
  difficulty?: number;
  fatigue?: number;
  pain?: boolean;
  painLocation?: string;
  motivation?: number;
  note?: string;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  planId: string | null;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  /** "Como foi o treino?" (#377): 1 Leve … 5 No limite. */
  feeling?: number | null;
  checkin?: WorkoutCheckin | null;
  sets?: SessionSet[];
  plannedExercises?: PlannedExercise[];
  /** Ordem dos exercícios escolhida nesta sessão (ids). Vazia = a do plano. */
  exerciseOrder?: number[];
  /** Exercícios do plano tirados desta sessão — já fora de `plannedExercises`. */
  removedExerciseIds?: number[];
  /** O plano de onde a sessão veio, quando a listagem o inclui. */
  plan?: { id: string; name: string; kind?: WorkoutPlanKind } | null;
  /** Circuito (#380): o retrato, os toques e, no fim, o resultado. Nulo em treino de séries. */
  circuit?: CircuitSessionData | null;
}

/** `WorkoutSession.circuit`, versão 1. */
export interface CircuitSessionData {
  version: 1;
  definition: CircuitDefinition;
  /** Quando o relógio começou (ISO). */
  startedAt: string;
  events: CircuitEvent[];
  result: (Omit<CircuitResult, 'exercises'> & { exercises: CircuitResult['exercises'] }) | null;
  /** A última vez do mesmo circuito, congelada no começo (ausente nas sessões antigas). */
  previous?: CircuitPrevious | null;
}

export interface CircuitPrevious {
  sessionId: string;
  startedAt: string;
  roundsCompleted: number;
  partialExercises: number;
  finalTimeSeconds: number | null;
  intervalsCompleted: number | null;
  totalReps: number;
  elapsedSeconds: number;
}

export type WorkoutPlanKind = 'STRENGTH' | 'CIRCUIT';

/** A configuração do circuito como a API devolve (só os campos do formato preenchidos). */
export interface CircuitConfigView {
  format: CircuitFormat;
  durationSeconds: number | null;
  workSeconds: number | null;
  restSeconds: number | null;
  intervals: number | null;
  rounds: number | null;
  restBetweenRoundsSeconds: number | null;
}

/** O circuito no "Treino feito" (Al-T5) e no detalhe do histórico (Al-T11c, #381). */
export interface CircuitSummary {
  format: CircuitFormat;
  name: string;
  config: CircuitConfigInput;
  roundsCompleted: number;
  partialExercises: number;
  /** O exercício da vez quando parou no meio de um round. */
  stoppedAt: { exerciseId: number; name: string } | null;
  roundSeconds: number[];
  partialRoundSeconds: number | null;
  averageRoundSeconds: number | null;
  elapsedSeconds: number;
  finalTimeSeconds: number | null;
  intervalsCompleted: number | null;
  intervalsTotal: number | null;
  completed: boolean;
  totalReps: number;
  exercises: Array<{
    exerciseId: number;
    name: string;
    muscleGroup: string;
    unit: 'REPS' | 'SECONDS';
    target: number;
    sets: number;
    reps: number;
    seconds: number;
  }>;
  previous: {
    sessionId: string;
    startedAt: string;
    roundsCompleted: number;
    partialExercises: number;
    finalTimeSeconds: number | null;
    intervalsCompleted: number | null;
    totalReps: number;
    elapsedSeconds: number;
  } | null;
  comparison: {
    verdict: 'better' | 'same' | 'worse';
    roundsDelta: number | null;
    finalTimeDeltaSeconds: number | null;
    intervalsDelta: number | null;
    repsDelta: number;
    previousFinalTimeSeconds: number | null;
  } | null;
}

/** Corpo de "Salvar" do Novo circuito (Al-T22): também a edição. */
export interface CircuitInput extends CircuitConfigInput {
  name: string;
  format: CircuitFormat;
  exercises: Array<{ exerciseId: number; unit: 'REPS' | 'SECONDS'; target: number }>;
}

/** O que "Encerrar circuito" manda: os toques e o resultado contado pelo relógio. */
export interface CircuitFinishInput {
  events: CircuitEvent[];
  result: Pick<
    CircuitResult,
    | 'roundsCompleted'
    | 'partialExercises'
    | 'roundSeconds'
    | 'partialRoundSeconds'
    | 'elapsedSeconds'
    | 'finalTimeSeconds'
    | 'intervalsCompleted'
    | 'completed'
  >;
  feeling?: number;
  notes?: string;
}

/** Os grupos de força da semana (`GET /workout/muscles/week`). Cardio fica fora. */
export type StrengthMuscleGroup = 'peito' | 'costas' | 'pernas' | 'ombro' | 'braço' | 'core';

export interface WeeklySetsByMuscle {
  group: StrengthMuscleGroup;
  sets: number;
}

export interface RestedMuscle {
  group: StrengthMuscleGroup;
  /** Dias desde a última série; `null` = nenhuma nos últimos 60 dias. */
  daysSince: number | null;
}

export interface WeeklyMuscleSummary {
  /** Primeiro dos 7 dias contados (YYYY-MM-DD, fuso da pessoa). */
  from: string;
  /** Meta de séries por grupo na semana (12). */
  target: number;
  sets: WeeklySetsByMuscle[];
  rested: RestedMuscle[];
  suggestedPlan: { id: string; name: string; groups: StrengthMuscleGroup[] } | null;
  /** A semana do calendário, segunda a domingo (#377). */
  week?: TrainingWeek;
}

export interface TrainingWeek {
  /** Segunda-feira, YYYY-MM-DD. */
  start: string;
  days: { date: string; trained: boolean; active: boolean; today: boolean }[];
  /** Treinos terminados na semana. */
  done: number;
  /** Meta de treinos por semana; nula sem meta. */
  target: number | null;
}

export interface SummaryBestSet {
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  avgHeartRate: number | null;
}

export interface PostWorkoutQuestion {
  key: 'fatigue' | 'pain';
  kind: 'scale' | 'yes_no';
  label: string;
  scaleLabels?: [string, string];
}

/** O "Treino feito!" (`GET /workout/sessions/:id/summary`, prancha Al-T5-Fim). */
export interface WorkoutSessionSummary {
  sessionId: string;
  planId: string | null;
  planName: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  sets: number;
  volumeKg: number;
  feeling: number | null;
  /** A observação já gravada ("Como foi o treino?"). */
  notes: string | null;
  overallFeeling: number | null;
  comparison: {
    sessionId: string;
    startedAt: string;
    volumeDeltaPct: number | null;
    setsDelta: number;
    durationDeltaMinutes: number | null;
  } | null;
  records: {
    exerciseId: number;
    exerciseName: string;
    weightKg: number | null;
    reps: number | null;
    distanceMeters: number | null;
    durationSeconds: number | null;
  }[];
  muscles: {
    groups: { group: StrengthMuscleGroup; sets: number }[];
    primary: string[];
    secondary: string[];
  };
  exercises: {
    exerciseId: number;
    exerciseName: string;
    muscleGroup: MuscleGroup;
    isCardio: boolean;
    sets: number;
    best: SummaryBestSet | null;
    feeling: number | null;
    isRecord: boolean;
  }[];
  checkin: (Omit<WorkoutCheckin, 'sessionId'> & { sessionId?: string }) | null;
  /** Nulo: ninguém da equipe lê Treino, a folha de perguntas não aparece. */
  questions: { askedBy: string[]; items: PostWorkoutQuestion[] } | null;
  /** Circuito (#380): rounds, tempo por round, tempo final e a comparação. */
  circuit?: CircuitSummary | null;
}

/** "Seus números" do Como fazer (`GET /workout/exercises/:id/stats`). */
export interface ExerciseStats {
  exerciseId: number;
  isCardio: boolean;
  record: {
    weightKg: number | null;
    reps: number | null;
    distanceMeters: number | null;
    durationSeconds: number | null;
    date: string | null;
  } | null;
  last: {
    date: string;
    sets: number;
    best: Omit<SummaryBestSet, 'avgHeartRate'>;
    feeling: number | null;
  } | null;
  estimated1RM: number | null;
}

export interface WorkoutPlanExercise extends PlanExerciseConfig {
  id: string;
  planId: string;
  exerciseId: number;
  order: number;
  targetSets: number;
  targetReps: string;
  /** Série por série; vazia = `targetSets` séries iguais. */
  sets: PlanSet[];
  exercise: Exercise;
}

export interface WorkoutPlan {
  id: string;
  userId: string;
  name: string;
  /** Plano pronto da comunidade de onde veio (adoção). */
  fromTemplateId?: string | null;
  /** Plano de séries ou circuito (#380). Ausente em resposta antiga = séries. */
  kind?: WorkoutPlanKind;
  circuit?: CircuitConfigView | null;
  exercises: WorkoutPlanExercise[];
  /** Sessões encerradas com este plano (#378). */
  timesDone?: number;
  lastDoneAt?: string | null;
}

/** O que se pode mandar ao criar ou editar a linha do plano. `null` limpa o campo. */
export type PlanExerciseInput = Partial<{
  order: number;
  targetSets: number;
  targetReps: string;
  repUnit: PlanRepUnit;
  loadMode: PlanLoadMode;
  startLoadKg: number | null;
  restSeconds: number | null;
  technique: PlanTechnique;
  biSetWithNext: boolean;
  notes: string | null;
  cardioTarget: CardioTargetKind | null;
  cardioDurationSeconds: number | null;
  cardioDistanceMeters: number | null;
  cardioIntensity: CardioIntensity | null;
  /** Substitui a tabela inteira; `[]` volta a séries iguais. */
  sets: Array<{ kind: PlanSetKind; reps: number; loadKg?: number | null }> | null;
}>;

export const workoutApi = {
  /** Séries por grupo nos últimos 7 dias, os descansados e um plano que os trabalha. */
  getWeeklyMuscleSummary: () => apiFetch<WeeklyMuscleSummary>('/api/workout/muscles/week'),
  /** A última sessão concluída ou não, para o card "Repetir o último". */
  getLastSession: async (): Promise<WorkoutSession | null> =>
    (await workoutApi.listSessions({ limit: 1 }))[0] ?? null,
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
  /** Idempotente: finalizar de novo não muda o horário do fim (#377). */
  finishSession: (
    id: string,
    body?: { notes?: string; feeling?: number; checkin?: WorkoutCheckinInput },
  ) =>
    apiFetch<WorkoutSession>(`/api/workout/sessions/${id}/finish`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  /** O "Treino feito!": resumo, recordes, músculos e as perguntas da equipe. */
  getSessionSummary: (id: string) =>
    apiFetch<WorkoutSessionSummary>(`/api/workout/sessions/${id}/summary`),
  /** As respostas do fim do treino. PUT: reenviar substitui. */
  saveCheckin: (id: string, body: WorkoutCheckinInput) =>
    apiFetch<WorkoutCheckin>(`/api/workout/sessions/${id}/checkin`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  updateSession: (
    id: string,
    body: {
      notes?: string;
      feeling?: number | null;
      exerciseOrder?: number[];
      removedExerciseIds?: number[];
    },
  ) =>
    apiFetch<WorkoutSession>(`/api/workout/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
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
      /** Uma por toque em "Concluir série": o reenvio devolve a mesma série. */
      clientKey?: string;
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

  // Circuitos (#380)
  createCircuit: (body: CircuitInput) =>
    apiFetch<WorkoutPlan>('/api/workout/circuits', { method: 'POST', body: JSON.stringify(body) }),
  updateCircuit: (id: string, body: CircuitInput) =>
    apiFetch<WorkoutPlan>(`/api/workout/circuits/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  /** Os toques do circuito em andamento: a lista inteira, a cada toque. */
  saveCircuitProgress: (sessionId: string, events: CircuitEvent[]) =>
    apiFetch<{ events: number }>(`/api/workout/sessions/${sessionId}/circuit`, {
      method: 'PUT',
      body: JSON.stringify({ events }),
    }),
  finishCircuit: (sessionId: string, body: CircuitFinishInput) =>
    apiFetch<{ sessionId: string; alreadyFinished: boolean }>(
      `/api/workout/sessions/${sessionId}/circuit/finish`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  addPlanExercise: (planId: string, body: { exerciseId: number } & PlanExerciseInput) =>
    apiFetch<WorkoutPlanExercise>(`/api/workout/plans/${planId}/exercises`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /**
   * Seleção múltipla do "Adicionar exercício" (Al-T8): todos no fim, na ordem
   * dada, numa escrita só. Repetir o id repete o exercício no plano.
   */
  addPlanExercises: (planId: string, exerciseIds: number[]) =>
    apiFetch<WorkoutPlan>(`/api/workout/plans/${planId}/exercises/batch`, {
      method: 'POST',
      body: JSON.stringify({ exercises: exerciseIds.map((exerciseId) => ({ exerciseId })) }),
    }),
  updatePlanExercise: (planId: string, id: string, body: PlanExerciseInput) =>
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

  searchExercises: (
    q?: string,
    muscleGroup?: MuscleGroup,
    opts: { onlyMyGym?: boolean; favoritesOnly?: boolean; limit?: number } = {},
  ) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (muscleGroup) qs.set('muscleGroup', muscleGroup);
    if (opts.onlyMyGym) qs.set('onlyMyGym', 'true');
    if (opts.favoritesOnly) qs.set('favoritesOnly', 'true');
    if (opts.limit) qs.set('limit', String(opts.limit));
    const query = qs.toString();
    return apiFetch<Exercise[]>(`/api/workout/exercises${query ? `?${query}` : ''}`);
  },
  /** O equipamento das academias da pessoa (marcado e próprio), para o editor de exercício. */
  gymEquipment: () => apiFetch<GymEquipmentState>('/api/workout/equipment'),
  getExercise: (id: number) => apiFetch<Exercise>(`/api/workout/exercises/${id}`),
  /** A aba Favoritos do "Adicionar exercício" (#378). */
  listFavoriteExercises: () => apiFetch<Exercise[]>('/api/workout/exercises/favorites'),
  /** Estrela do Como fazer (#378). Idempotente nos dois sentidos. */
  setExerciseFavorite: (id: number, favorite: boolean) =>
    apiFetch<void>(`/api/workout/exercises/${id}/favorite`, {
      method: favorite ? 'PUT' : 'DELETE',
    }),
  /** Recorde, última vez e máximo estimado (prancha Al-T9, aba "Seu histórico"). */
  getExerciseStats: (id: number) => apiFetch<ExerciseStats>(`/api/workout/exercises/${id}/stats`),
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
  /**
   * Prescrição da próxima série (#144). `targetReps` é a faixa do plano, que a
   * tela já tem em mãos — sem ela a API assume 8-12.
   */
  getPrescription: (exerciseId: number, targetReps?: string) => {
    const qs = targetReps ? `?targetReps=${encodeURIComponent(targetReps)}` : '';
    return apiFetch<LoadPrescription>(`/api/workout/exercises/${exerciseId}/prescription${qs}`);
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

  // -------- Periodização em blocos (#145) --------

  getActiveBlock: () => apiFetch<TrainingBlock | null>('/api/workout/blocks/active'),
  createBlock: (body: { planId?: string; kind?: TrainingBlockKind; sessionsPerWeek?: number }) =>
    apiFetch<TrainingBlock>('/api/workout/blocks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteBlock: (id: string) => apiFetch<void>(`/api/workout/blocks/${id}`, { method: 'DELETE' }),
};

export type TrainingBlockKind = 'strength' | 'hypertrophy';

export type BlockFocus = 'accumulation' | 'peak' | 'deload';

/**
 * `state` distingue as cinco situações que a linha do tempo do bloco desenha.
 * `partial` e `done` são coisas diferentes de propósito: semana com uma sessão de
 * três conta como cumprida, mas a tela não pode dizer que foi cumprida à risca.
 */
export type BlockWeekState = 'done' | 'partial' | 'current' | 'upcoming' | 'missed';

export interface TrainingBlockWeek {
  weekNumber: number;
  focus: BlockFocus;
  /** Multiplicador sobre a carga da prescrição (#144), nunca uma carga absoluta. */
  intensityFactor: number;
  volumeFactor: number;
  /** Segunda-feira PLANEJADA, YYYY-MM-DD. */
  weekStart: string;
  /** Onde a semana caiu depois das reancoragens por falta. */
  effectiveWeekStart: string;
  effectiveWeekEnd: string;
  sessionsTarget: number;
  sessionsDone: number;
  /** Vezes que ESTA semana foi perdida por inteiro e reancorada adiante. */
  shiftedWeeks: number;
  state: BlockWeekState;
  /** Só vem preenchido em `currentWeek` e `nextWeek`. */
  summary?: string;
}

/**
 * `suggested` é discriminante: "sem deload" precisa dizer **por quê**. RPE que não
 * subiu e carga que subiu junto são motivos diferentes, e o segundo é progresso.
 */
export type DeloadSignal =
  | { suggested: true; rpeDelta: number; loadDeltaKg: number }
  | { suggested: false; reason: 'insufficient_history' | 'rpe_not_rising' | 'load_rising' };

export interface TrainingBlock {
  id: string;
  planId: string | null;
  planName: string | null;
  kind: TrainingBlockKind;
  kindLabel: string;
  repRange: string;
  startDate: string;
  weeksTotal: number;
  status: 'active' | 'completed' | 'abandoned';
  currentWeek: TrainingBlockWeek | null;
  nextWeek: TrainingBlockWeek | null;
  weeks: TrainingBlockWeek[];
  deload: DeloadSignal;
  /** A frase pronta para a tela. Vem da API para web e mobile dizerem o mesmo. */
  explanation: string;
}

/** Qual sinal decidiu a prescrição: o RPE registrado ou só as repetições. */
export type PrescriptionBasis = 'rpe' | 'reps';

export type PrescriptionAction = 'increase_load' | 'increase_reps' | 'hold';

export interface PrescribedSet {
  status: 'ok';
  weightKg: number;
  reps: number;
  restSeconds: number;
  basis: PrescriptionBasis;
  action: PrescriptionAction;
  /** `true` quando um teto de progressão cortou o salto proposto. */
  capped: boolean;
}

/**
 * `status` é discriminante de propósito: "não há sugestão" precisa dizer **por
 * que**. Um `null` faria a tela tratar "histórico curto demais" e "exercício de
 * cardio" como a mesma coisa, e a primeira é a que precisa ser explicada para a
 * pessoa não achar que a sugestão quebrou.
 */
export type LoadPrescription =
  PrescribedSet | { status: 'insufficient_history' } | { status: 'cardio_exercise' };

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
