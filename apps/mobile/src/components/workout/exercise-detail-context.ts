import { createContext, useContext, useMemo } from 'react';

/**
 * O contexto que abre o detalhe do exercício, separado do host para que o
 * card e a mídia não importem o drawer (ciclo host → drawer → mídia → host).
 */

export type OpenExerciseDetail = (exerciseId: number) => void;

export const ExerciseDetailContext = createContext<OpenExerciseDetail | null>(null);

export function useOpenExerciseDetail(): OpenExerciseDetail {
  const open = useContext(ExerciseDetailContext);
  return useMemo(
    () =>
      open ??
      (() => {
        if (__DEV__) {
          console.warn(
            'ExerciseDetailCard fora de <ExerciseDetailHost>: o detalhe do exercício não abre.',
          );
        }
      }),
    [open],
  );
}
