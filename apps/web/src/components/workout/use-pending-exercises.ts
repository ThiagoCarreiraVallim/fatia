'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addPendingExercise,
  dropPendingExercise,
  pendingExercisesKey,
  pendingExercisesQueryOptions,
  type PendingExercise,
} from '@fatia/api-client';

/**
 * Exercícios escolhidos na busca e ainda sem série, no cache comum do React
 * Query (mesma chave e regras do app, em `@fatia/api-client`). Observado aqui,
 * não some com a coleta do cache; `add` e `drop` gravam nele, então tirar um
 * exercício vale quando a sessão volta à tela.
 */
export function usePendingExercises(sessionId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: pendingExercisesKey(sessionId),
    queryFn: () => qc.getQueryData<PendingExercise[]>(pendingExercisesKey(sessionId)) ?? [],
    initialData: [] as PendingExercise[],
    ...pendingExercisesQueryOptions,
  });

  const add = useCallback(
    (exercise: PendingExercise) =>
      qc.setQueryData<PendingExercise[]>(pendingExercisesKey(sessionId), (current) =>
        addPendingExercise(current, exercise),
      ),
    [qc, sessionId],
  );

  const drop = useCallback(
    (exerciseId: number) =>
      qc.setQueryData<PendingExercise[]>(pendingExercisesKey(sessionId), (current) =>
        dropPendingExercise(current, exerciseId),
      ),
    [qc, sessionId],
  );

  return { pending: query.data, add, drop };
}
