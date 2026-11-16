import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { activeSessionIdFromError, workoutApi, type PendingExercise } from '@fatia/api-client';

/**
 * Começa uma sessão (com plano ou livre) e abre a tela dela. Já existindo uma
 * aberta, a API responde 409 com o id dela (#350/#377): em vez de erro, a
 * pessoa cai no treino que já estava em andamento — sem misturar nele os
 * exercícios escolhidos para o novo.
 *
 * `pending` são os exercícios escolhidos antes de começar (Treino livre e o
 * "Repetir" do histórico, #381): entram na sessão como escolhidos e ainda sem
 * série, no mesmo cache de `usePendingExercises`.
 */
export function useStartSession() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: ({ planId }: { planId?: string | null; pending?: PendingExercise[] }) =>
      workoutApi.startSession({ planId: planId ?? undefined, startedAt: new Date().toISOString() }),
    onSuccess: (session, { pending }) => {
      if (pending?.length) qc.setQueryData(['workout', 'session', session.id, 'pending'], pending);
      qc.setQueryData(['workout', 'active'], session);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(`/workout/session/${session.id}` as Href);
    },
    onError: (error) => {
      const open = activeSessionIdFromError(error);
      if (!open) return;
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(`/workout/session/${open}` as Href);
    },
  });
}
