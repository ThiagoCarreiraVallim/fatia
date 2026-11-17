import {
  activeSessionIdFromError,
  pendingExercisesKey,
  type PendingExercise,
  type WorkoutSession,
} from '@fatia/api-client';

/** O pedaço do `QueryClient` que o início da sessão usa. */
interface StartSessionCache {
  setQueryData: (key: readonly unknown[], data: unknown) => unknown;
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => unknown;
}

export interface StartSessionVars {
  planId?: string | null;
  pending?: PendingExercise[];
}

/**
 * O que acontece depois do "Iniciar treino", fora do hook para o teste não
 * montar o React Native. Já existindo uma sessão aberta, a API responde 409
 * com o id dela (#350/#377) e a pessoa cai nela. Mas o 409 também é o segundo
 * toque de um duplo toque — o botão só desabilita no render seguinte —, e aí
 * a sessão "já aberta" é a que o primeiro toque acabou de abrir: abrir de novo
 * empilhava a mesma tela duas vezes.
 */
export function startSessionHandlers(qc: StartSessionCache, open: (sessionId: string) => void) {
  const opened = new Set<string>();
  return {
    onSuccess(session: WorkoutSession, { pending }: StartSessionVars) {
      if (pending?.length) qc.setQueryData(pendingExercisesKey(session.id), pending);
      qc.setQueryData(['workout', 'active'], session);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      opened.add(session.id);
      open(session.id);
    },
    onError(error: unknown) {
      const active = activeSessionIdFromError(error);
      if (!active) return;
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      if (opened.has(active)) return;
      opened.add(active);
      open(active);
    },
  };
}
