'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  activeSessionIdFromError,
  workoutApi,
  type PendingExercise,
  type WorkoutSession,
} from '@fatia/api-client';

/** Onde a sessão aberta guarda os escolhidos ainda sem série (o app usa a mesma chave). */
export const pendingKey = (sessionId: string) => ['workout', 'session', sessionId, 'pending'];

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
    }: {
      planId: string | null;
      pending: PendingExercise[];
    }): Promise<WorkoutSession | null> => {
      try {
        return await workoutApi.startSession({
          planId: planId ?? undefined,
          startedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (activeSessionIdFromError(error)) return null;
        throw error;
      }
    },
    onSuccess: (session, { pending }) => {
      if (session) {
        qc.setQueryData(pendingKey(session.id), pending);
        qc.setQueryData(['workout', 'active'], session);
      }
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push('/workout');
    },
  });
}
