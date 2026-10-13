import type { PlannedExercise, SessionSet } from './workout';
import { isCardioExercise } from './workout/is-cardio';

export interface ExerciseGroup {
  exerciseId: number;
  exerciseName: string;
  isCardio: boolean;
  sets: SessionSet[];
  targetSets?: number;
  targetReps?: string;
  isPlanned: boolean;
}

/** Exercício escolhido na busca que ainda não tem série registrada. */
export interface PendingExercise {
  id: number;
  name: string;
  muscleGroup: string;
}

/**
 * Agrupa as séries da sessão por exercício, na ordem: planejados, os que já
 * têm série e, por fim, os `pending` — escolhidos na busca do treino livre e
 * ainda sem série. Os pendentes existem só na tela: antes deles, o único jeito
 * de um exercício "aparecer" era registrar uma série falsa de 1 repetição, que
 * ia parar no volume, nos recordes e no histórico.
 */
export function buildExerciseGroups(
  plannedExercises: PlannedExercise[] | undefined,
  sets: SessionSet[] | undefined,
  pending: PendingExercise[] = [],
): ExerciseGroup[] {
  const setsByExercise = new Map<number, SessionSet[]>();
  for (const s of sets ?? []) {
    const arr = setsByExercise.get(s.exerciseId);
    if (arr) arr.push(s);
    else setsByExercise.set(s.exerciseId, [s]);
  }

  const groups: ExerciseGroup[] = [];
  const seen = new Set<number>();

  const planned = [...(plannedExercises ?? [])].sort((a, b) => a.order - b.order);
  for (const pe of planned) {
    seen.add(pe.exerciseId);
    groups.push({
      exerciseId: pe.exerciseId,
      exerciseName: pe.exerciseName,
      isCardio: isCardioExercise({ muscleGroup: pe.muscleGroup }),
      sets: setsByExercise.get(pe.exerciseId) ?? [],
      targetSets: pe.targetSets,
      targetReps: pe.targetReps,
      isPlanned: true,
    });
  }

  for (const s of sets ?? []) {
    if (seen.has(s.exerciseId)) continue;
    seen.add(s.exerciseId);
    groups.push({
      exerciseId: s.exerciseId,
      exerciseName: s.exercise.name,
      isCardio: isCardioExercise(s.exercise),
      sets: setsByExercise.get(s.exerciseId) ?? [],
      isPlanned: false,
    });
  }

  for (const p of pending) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    groups.push({
      exerciseId: p.id,
      exerciseName: p.name,
      isCardio: isCardioExercise({ muscleGroup: p.muscleGroup }),
      sets: [],
      isPlanned: false,
    });
  }

  return groups;
}

function isIncomplete(group: ExerciseGroup): boolean {
  if (group.isCardio) return group.sets.length === 0;
  const target = group.targetSets ?? 0;
  return target === 0 || group.sets.length < target;
}

/**
 * O exercício em foco na sessão: o `preferredId` (o que acabou de ser
 * escolhido na busca) se ainda estiver por fazer, senão o primeiro incompleto
 * que não foi pulado.
 */
export function pickFocusedGroup(
  groups: ExerciseGroup[],
  skipped: ReadonlySet<number>,
  preferredId?: number | null,
): ExerciseGroup | undefined {
  const open = (g: ExerciseGroup) => !skipped.has(g.exerciseId) && isIncomplete(g);
  const preferred = groups.find((g) => g.exerciseId === preferredId);
  if (preferred && open(preferred)) return preferred;
  return groups.find(open);
}
