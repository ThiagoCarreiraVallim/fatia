'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { activeSessionIdFromError, circuitRunPath, workoutApi } from '@fatia/api-client';

/**
 * Começa o circuito e abre o relógio (Al-T4, T4b, T4c, T4d). Já existindo uma
 * sessão aberta (409, outra aba, o app), a pessoa cai nela pelo `/workout`, que
 * leva ao relógio quando é circuito e à sessão de séries quando não é.
 */
export function useStartCircuit() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (planId: string) =>
      workoutApi.startSession({ planId, startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.setQueryData(['workout', 'active'], session);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(circuitRunPath(session.id));
    },
    onError: (error) => {
      if (!activeSessionIdFromError(error)) return;
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push('/workout');
    },
  });
}
