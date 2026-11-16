import { isCardioExercise } from './helpers/is-cardio';
import { sessionKind, type SessionKind } from './helpers/session-kind';

/** A sessão como o histórico lê: as séries com o nome e o grupo do exercício. */
export interface HistorySessionInput {
  id: string;
  planId: string | null;
  /** Retrato do plano ao começar; sobrevive à exclusão do plano. */
  fromPlan?: boolean;
  planName?: string | null;
  startedAt: Date;
  completedAt: Date | null;
  feeling: number | null;
  notes: string | null;
  plan: { name: string } | null;
  sets: Array<{
    exerciseId: number;
    weightKg: number | null;
    reps: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
    avgHeartRate: number | null;
    exercise: { name: string; muscleGroup: string };
  }>;
}

/** Uma linha do histórico (prancha `Al-T10`). O texto da linha é da tela. */
export interface HistoryItem {
  id: string;
  startedAt: Date;
  completedAt: Date | null;
  kind: SessionKind;
  /**
   * O nome do plano (o atual, ou o do retrato se o plano foi apagado). Nulo no
   * treino livre: a tela escreve "Treino livre".
   */
  title: string | null;
  /** "Como foi o treino?", 1 a 5. */
  feeling: number | null;
  notes: string | null;
  durationMinutes: number | null;
  strengthExercises: number;
  strengthSets: number;
  /** Só força, em kg (a tela converte). */
  volumeKg: number;
  cardioExercises: number;
  /** O primeiro cardio da sessão, somado: "Esteira · 5,1 km · 146 bpm". */
  cardio: {
    exerciseName: string;
    distanceMeters: number | null;
    durationSeconds: number | null;
    avgHeartRate: number | null;
  } | null;
}

/** O histórico com os totais do topo (sessões, duração média e volume). */
export interface WorkoutHistory {
  totals: { sessions: number; avgDurationMinutes: number | null; volumeKg: number };
  items: HistoryItem[];
  /** Passe como `cursor` para a próxima página (opaco); nulo no fim. */
  nextCursor: string | null;
}

export function historyItemOf(session: HistorySessionInput): HistoryItem {
  const strength = session.sets.filter((s) => !isCardioExercise(s.exercise));
  const cardio = session.sets.filter((s) => isCardioExercise(s.exercise));
  const volume = strength.reduce((acc, s) => acc + (s.weightKg ?? 0) * (s.reps ?? 0), 0);

  let cardioSummary: HistoryItem['cardio'] = null;
  const firstCardio = cardio[0];
  if (firstCardio) {
    const own = cardio.filter((s) => s.exerciseId === firstCardio.exerciseId);
    const distance = own.reduce((acc, s) => acc + (s.distanceMeters ?? 0), 0);
    const duration = own.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0);
    const hrs = own.map((s) => s.avgHeartRate).filter((h): h is number => h != null);
    cardioSummary = {
      exerciseName: firstCardio.exercise.name,
      distanceMeters: distance || null,
      durationSeconds: duration || null,
      avgHeartRate: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    };
  }

  return {
    id: session.id,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    kind: sessionKind(session),
    title: session.plan?.name ?? session.planName ?? null,
    feeling: session.feeling,
    notes: session.notes,
    durationMinutes: session.completedAt
      ? Math.round((session.completedAt.getTime() - session.startedAt.getTime()) / 60_000)
      : null,
    strengthExercises: new Set(strength.map((s) => s.exerciseId)).size,
    strengthSets: strength.length,
    volumeKg: Math.round(volume * 10) / 10,
    cardioExercises: new Set(cardio.map((s) => s.exerciseId)).size,
    cardio: cardioSummary,
  };
}
