import type { PlannedExercise, SessionSet } from './api/workout';

export interface ExerciseGroup {
  exerciseId: number;
  exerciseName: string;
  isCardio: boolean;
  sets: SessionSet[];
  targetSets?: number;
  targetReps?: string;
  isPlanned: boolean;
}

export function buildExerciseGroups(
  plannedExercises: PlannedExercise[] | undefined,
  sets: SessionSet[] | undefined,
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
      isCardio: pe.muscleGroup === 'CARDIO',
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
      isCardio: s.exercise.muscleGroup === 'CARDIO',
      sets: setsByExercise.get(s.exerciseId) ?? [],
      isPlanned: false,
    });
  }

  return groups;
}
