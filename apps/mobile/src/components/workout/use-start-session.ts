import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { activeSessionIdFromError, workoutApi } from '@fatia/api-client';

/**
 * Começa uma sessão (com plano ou livre) e abre a tela dela. Já existindo uma
 * aberta, a API responde 409 com o id dela (#350/#377): em vez de erro, a
 * pessoa cai no treino que já estava em andamento.
 *
 * `then` escolhe a rota depois de abrir — o "Só cardio" abre a sessão já com a
 * busca filtrada em cardio.
 */
export function useStartSession() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: ({ planId }: { planId?: string | null; then?: 'cardio' }) =>
      workoutApi.startSession({ planId: planId ?? undefined, startedAt: new Date().toISOString() }),
    onSuccess: (session, { then }) => {
      qc.setQueryData(['workout', 'active'], session);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(
        (then === 'cardio'
          ? `/workout/session/${session.id}?add=cardio`
          : `/workout/session/${session.id}`) as Href,
      );
    },
    onError: (error) => {
      const open = activeSessionIdFromError(error);
      if (!open) return;
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(`/workout/session/${open}` as Href);
    },
  });
}
