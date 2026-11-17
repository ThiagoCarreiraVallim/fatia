'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  activeSessionIdFromError,
  pendingExercisesKey,
  startSessionBody,
  workoutApi,
  type PendingExercise,
  type WorkoutSession,
} from '@fatia/api-client';

/**
 * Começa uma sessão e leva ao treino em andamento (#381): o "Iniciar treino"
 * do Treino livre (Al-T17b) e o "Repetir" do histórico (Al-T11). Com plano,
 * segue o plano; sem plano, os exercícios escolhidos entram como pendentes
 * (`buildExerciseGroups`): nada de série falsa para eles aparecerem.
 *
 * Já havendo uma aberta (409, #350), a pessoa cai nela, sem os escolhidos:
 * misturar com o treino que já estava em andamento seria pior.
 */
export function useStartWithExercises() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async ({
      planId,
      pending,
    }: {
      planId: string | null;
      pending: PendingExercise[];
    }): Promise<WorkoutSession | null> => {
      try {
        return await workoutApi.startSession(startSessionBody(planId, pending));
      } catch (error) {
        if (activeSessionIdFromError(error)) return null;
        throw error;
      }
    },
    onSuccess: (session, { pending }) => {
      if (session) {
        qc.setQueryData(pendingExercisesKey(session.id), pending);
        qc.setQueryData(['workout', 'active'], session);
      }
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push('/workout');
    },
  });
}
