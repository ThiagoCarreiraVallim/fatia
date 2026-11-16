import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { activeSessionIdFromError, circuitRunPath, workoutApi } from '@fatia/api-client';

/**
 * Começa o circuito e abre o relógio. Já existindo uma sessão aberta (409), a
 * pessoa cai nela: a rota da sessão leva ao relógio quando é circuito.
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
      router.push(circuitRunPath(session.id) as Href);
    },
    onError: (error) => {
      const open = activeSessionIdFromError(error);
      if (!open) return;
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(`/workout/session/${open}` as Href);
    },
  });
}
