import { createContext, useCallback, useContext } from 'react';
import { useRouter } from 'expo-router';
import { exerciseDetailPath } from '@fatia/api-client';

/**
 * Abre o "Como fazer" (prancha `Al-T9`), que é uma tela: `/workout/exercise/:id`.
 *
 * Era um drawer hospedado por cada tela (`ExerciseDetailHost`); virou rota para
 * ter o vídeo grande no topo, como a prancha. Quem precisa fazer algo antes de
 * sair (a sessão guiada guarda o exercício aberto para voltar nele) põe um
 * provider com o próprio `open`; sem provider, só navega.
 */

export type OpenExerciseDetail = (exerciseId: number) => void;

export const ExerciseDetailContext = createContext<OpenExerciseDetail | null>(null);

export function useOpenExerciseDetail(): OpenExerciseDetail {
  const override = useContext(ExerciseDetailContext);
  const router = useRouter();
  const navigate = useCallback(
    (exerciseId: number) => router.push(exerciseDetailPath(exerciseId)),
    [router],
  );
  return override ?? navigate;
}
