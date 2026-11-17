import { isCardioExercise } from './is-cardio';
import {
  DEFAULT_STRENGTH_REPS,
  MAX_CARDIO_DISTANCE_METERS,
  MAX_CARDIO_DURATION_SECONDS,
  MAX_LOAD_KG,
  MAX_SET_REPS,
  MAX_TARGET_SETS,
  type CardioTargetValue,
  type LoadModeValue,
  type RepUnitValue,
} from './plan-exercise-config';

/** Um exercício da sessão, com as séries que a pessoa fez, na ordem da sessão. */
export interface SessionExerciseSets {
  exerciseId: number;
  muscleGroup: string;
  sets: Array<{
    setNumber: number;
    weightKg: number | null;
    reps: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
  }>;
}

/** A linha do plano que a sessão vira. */
export interface PlanRowFromSession {
  exerciseId: number;
  order: number;
  targetSets: number;
  targetReps: string;
  repUnit: RepUnitValue;
  loadMode: LoadModeValue;
  startLoadKg: number | null;
  cardioTarget: CardioTargetValue | null;
  cardioDurationSeconds: number | null;
  cardioDistanceMeters: number | null;
}

const clamp = (value: number, max: number) => Math.min(value, max);

function range(values: number[]): string {
  const min = clamp(Math.min(...values), MAX_SET_REPS);
  const max = clamp(Math.max(...values), MAX_SET_REPS);
  return min === max ? String(min) : `${min}-${max}`;
}

/**
 * "Salvar como plano" (#381): as metas são as observadas. Força guarda quantas
 * séries foram feitas, a faixa de repetições (ou de segundos, na série por
 * tempo) e a carga da primeira série como carga inicial. Cardio guarda a
 * distância e o tempo somados como meta de cardio (#378): por distância quando
 * houve distância, senão por tempo.
 *
 * Exercício sem série fica de fora: não há o que observar.
 */
export function planExercisesFromSession(
  exercises: readonly SessionExerciseSets[],
): PlanRowFromSession[] {
  const rows: PlanRowFromSession[] = [];
  for (const ex of exercises) {
    if (ex.sets.length === 0) continue;
    const sets = [...ex.sets].sort((a, b) => a.setNumber - b.setNumber);
    const order = rows.length + 1;

    if (isCardioExercise(ex)) {
      const distance = sets.reduce((acc, s) => acc + (s.distanceMeters ?? 0), 0);
      const duration = sets.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0);
      rows.push({
        exerciseId: ex.exerciseId,
        order,
        targetSets: 1,
        targetReps: '',
        repUnit: 'REPS',
        loadMode: 'WEIGHT',
        startLoadKg: null,
        cardioTarget: distance > 0 ? 'DISTANCE' : duration > 0 ? 'TIME' : null,
        cardioDurationSeconds: duration > 0 ? clamp(duration, MAX_CARDIO_DURATION_SECONDS) : null,
        cardioDistanceMeters: distance > 0 ? clamp(distance, MAX_CARDIO_DISTANCE_METERS) : null,
      });
      continue;
    }

    const reps = sets.map((s) => s.reps).filter((r): r is number => r != null && r > 0);
    const seconds = sets
      .map((s) => s.durationSeconds)
      .filter((d): d is number => d != null && d > 0);
    const bySeconds = reps.length === 0 && seconds.length > 0;
    const firstLoad = sets.find((s) => (s.weightKg ?? 0) > 0)?.weightKg ?? null;
    rows.push({
      exerciseId: ex.exerciseId,
      order,
      targetSets: clamp(sets.length, MAX_TARGET_SETS),
      targetReps: reps.length ? range(reps) : bySeconds ? range(seconds) : DEFAULT_STRENGTH_REPS,
      repUnit: bySeconds ? 'SECONDS' : 'REPS',
      loadMode: firstLoad === null ? 'BODYWEIGHT' : 'WEIGHT',
      startLoadKg: firstLoad === null ? null : clamp(firstLoad, MAX_LOAD_KG),
      cardioTarget: null,
      cardioDurationSeconds: null,
      cardioDistanceMeters: null,
    });
  }
  return rows;
}
