import { formatDecimal } from './format';
import { buildExerciseGroups, orderExerciseGroups, pickFocusedGroup } from './session-view';
import type { WorkoutSession } from './workout';

/**
 * A barra "treino em andamento" (prancha `Al-T-Cards-treino`): 56 px acima do
 * menu, em toda tela de ver, enquanto houver sessão aberta. Web e app montam o
 * mesmo texto a partir daqui.
 *
 * AMRAP e intervalos dependem dos circuitos da #380: o modo existe para a barra
 * já saber desenhá-los, mas só aparece com o dado do circuito, que hoje não há.
 */
export type ActiveWorkoutBarMode = 'strength' | 'rest' | 'cardio' | 'amrap' | 'intervals';

export interface ActiveWorkoutBarView {
  mode: ActiveWorkoutBarMode;
  /** O exercício em foco, "Descanso" ou o nome do circuito. */
  title: string;
  detail: string;
  /** O relógio da direita: tempo de treino, ou o que resta do descanso. */
  clock: string;
}

/** O descanso como o provider global o expõe. */
export interface RestSnapshot {
  remaining: number | null;
  running: boolean;
}

/** Circuito em andamento (#380). Ausente hoje. */
export type CircuitSnapshot =
  | { kind: 'amrap'; name: string; rounds: number; remainingSeconds: number }
  | {
      kind: 'intervals';
      name: string;
      round: number;
      totalRounds: number;
      remainingSeconds: number;
    };

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function elapsed(session: WorkoutSession, now: Date): string {
  return formatClock((now.getTime() - new Date(session.startedAt).getTime()) / 1000);
}

/** O exercício em foco e o texto "série X de Y" (ou a distância, no cardio). */
function focus(session: WorkoutSession) {
  const groups = orderExerciseGroups(
    buildExerciseGroups(session.plannedExercises, session.sets),
    session.exerciseOrder,
  );
  // Sem nada por fazer (treino livre), o foco é o último exercício que teve série.
  const group = pickFocusedGroup(groups, new Set()) ?? groups.at(-1);
  if (!group) return null;
  if (group.isCardio) {
    const meters = group.sets.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0);
    return {
      group,
      detail: meters > 0 ? `${formatDecimal(meters / 1000)} km` : 'em andamento',
    };
  }
  const done = group.sets.length;
  const detail = group.targetSets
    ? `série ${Math.min(done + 1, group.targetSets)} de ${group.targetSets}`
    : `série ${done + 1}`;
  return { group, detail };
}

export function activeWorkoutBarView(
  session: WorkoutSession,
  rest: RestSnapshot | null,
  now: Date = new Date(),
  circuit?: CircuitSnapshot | null,
): ActiveWorkoutBarView {
  if (circuit?.kind === 'amrap') {
    return {
      mode: 'amrap',
      title: circuit.name,
      detail: `${circuit.rounds} rounds`,
      clock: formatClock(circuit.remainingSeconds),
    };
  }
  if (circuit?.kind === 'intervals') {
    return {
      mode: 'intervals',
      title: circuit.name,
      detail: `rodada ${circuit.round} de ${circuit.totalRounds}`,
      clock: formatClock(circuit.remainingSeconds),
    };
  }

  const current = focus(session);
  if (rest?.running && (rest.remaining ?? 0) > 0) {
    return {
      mode: 'rest',
      title: 'Descanso',
      detail: current ? `próxima: ${current.group.exerciseName} · ${current.detail}` : 'respire',
      clock: formatClock(rest.remaining!),
    };
  }
  if (!current) {
    return {
      mode: 'strength',
      title: 'Treino livre',
      detail: 'em andamento',
      clock: elapsed(session, now),
    };
  }
  return {
    mode: current.group.isCardio ? 'cardio' : 'strength',
    title: current.group.exerciseName,
    detail: current.detail,
    clock: elapsed(session, now),
  };
}

/** Nome acessível da barra: o que ela mostra e para onde leva. */
export function activeWorkoutBarLabel(view: ActiveWorkoutBarView): string {
  return `Treino em andamento: ${view.title}, ${view.detail}, ${view.clock}. Abrir a sessão`;
}

export interface LastSessionSummary {
  name: string;
  durationMinutes: number | null;
  sets: number;
  /** Peso × repetições das séries de força, em toneladas. */
  volumeTons: number;
}

/**
 * O card "Repetir o último" (prancha `Al-T-Cards-treino`). O humor ("Puxado")
 * só entra quando a #377 criar a sensação do treino.
 */
export function lastSessionSummary(
  session: WorkoutSession,
  planName?: string | null,
): LastSessionSummary {
  const sets = session.sets ?? [];
  const kg = sets.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
  const end = session.completedAt ? new Date(session.completedAt).getTime() : null;
  return {
    name: planName ?? session.plan?.name ?? 'Treino livre',
    durationMinutes:
      end === null ? null : Math.round((end - new Date(session.startedAt).getTime()) / 60_000),
    sets: sets.length,
    volumeTons: Math.round(kg / 100) / 10,
  };
}
