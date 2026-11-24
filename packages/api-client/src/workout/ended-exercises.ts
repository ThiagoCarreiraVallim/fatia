import type { ExerciseGroup } from '../session-view';

/**
 * Exercícios encerrados antes de completar as séries ("Encerrar exercício",
 * #473): a pessoa pulou as que faltavam e seguiu. Como os escolhidos na busca
 * (`pending-exercises.ts`), não vão ao servidor — não há série a gravar, e a
 * sessão continua dizendo a verdade sobre o que foi feito —, mas valem em todas
 * as telas da sessão e sobrevivem a sair dela e voltar.
 */
export const endedExercisesKey = (sessionId: string) =>
  ['workout', 'session', sessionId, 'ended'] as const;

/** Encerra (`ended`) ou retoma o exercício; encerrado duas vezes, fica um. */
export function toggleEndedExercise(
  current: readonly number[] | undefined,
  exerciseId: number,
  ended: boolean,
): number[] {
  const list = (current ?? []).filter((id) => id !== exerciseId);
  return ended ? [...list, exerciseId] : list;
}

/** Marca `ended` nos grupos encerrados: contam como completos em toda a sessão. */
export function markEndedExercises(
  groups: ExerciseGroup[],
  ended: readonly number[] | undefined,
): ExerciseGroup[] {
  if (!ended || ended.length === 0) return groups;
  const set = new Set(ended);
  return groups.map((g) => (set.has(g.exerciseId) ? { ...g, ended: true } : g));
}
