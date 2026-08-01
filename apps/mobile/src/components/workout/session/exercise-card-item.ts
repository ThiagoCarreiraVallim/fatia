import type { Exercise, ExerciseGroup } from '@fatia/api-client';

/**
 * Monta o item que o `ExerciseDetailCard` espera a partir de um grupo da sessão.
 *
 * O grupo traz só o essencial (id, nome, alvos); os campos ricos do exercício
 * chegam quando alguém abre o detalhe, que os busca por id. O stub existe para
 * não duplicar esse molde em cada tela — no PWA ele está copiado em duas.
 */
export function groupCardItem(group: ExerciseGroup): {
  id: string;
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
} {
  const muscleGroup =
    group.sets[0]?.exercise?.muscleGroup ?? (group.isCardio ? 'cardio' : 'outros');

  return {
    id: String(group.exerciseId),
    exercise: {
      id: group.exerciseId,
      name: group.exerciseName,
      muscleGroup,
      source: 'SEED',
      createdByUserId: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: null,
      level: null,
      mechanic: null,
      instructions: [],
      youtubeVideoId: null,
      youtubeVideoIdPt: null,
    },
    targetSets: group.targetSets ?? group.sets.length,
    targetReps: group.targetReps ?? '—',
  };
}
