import { useCallback } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  addPendingExercise,
  dropPendingExercise,
  endedExercisesKey,
  toggleEndedExercise,
  pendingExercisesKey,
  pendingExercisesQueryOptions,
  type PendingExercise,
} from '@fatia/api-client';

/**
 * Exercícios escolhidos na busca e ainda sem série (ver `buildExerciseGroups`).
 * Não vão ao servidor — uma série falsa sujaria volume e recordes —, mas
 * precisam valer nas duas telas da sessão: a guiada e o "Treino atual"
 * (prancha `Al-T17`). O cache do React Query é o lugar comum das duas, sem
 * contexto novo em volta da rota; chave e regras vêm de `@fatia/api-client`,
 * as mesmas do PWA.
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

  // Tirar do treino: dos escolhidos e dos encerrados (`forgetRemovedExercise`).
  const drop = useCallback(
    (exerciseId: number) => forgetRemovedExercise(qc, sessionId, exerciseId),
    [qc, sessionId],
  );

  return { pending: query.data, add, drop };
}

/**
 * Tirar o exercício do treino (#473): some dos escolhidos na busca e deixa de
 * estar encerrado. Reescolhido depois, ele volta aberto, e não "Encerrado".
 */
export function forgetRemovedExercise(qc: QueryClient, sessionId: string, exerciseId: number) {
  qc.setQueryData<PendingExercise[]>(pendingExercisesKey(sessionId), (current) =>
    dropPendingExercise(current, exerciseId),
  );
  qc.setQueryData<number[]>(endedExercisesKey(sessionId), (current) =>
    toggleEndedExercise(current, exerciseId, false),
  );
}

/**
 * O exercício que o "Treino atual" pediu para a sessão guiada abrir
 * (Continuar / Retomar / Iniciar). Mesmo cache, pelo mesmo motivo: a sessão
 * guiada está embaixo na pilha e não recebe parâmetro de quem volta para ela.
 */
export function useFocusRequest(sessionId: string) {
  const qc = useQueryClient();
  const key = ['workout', 'session', sessionId, 'focus'] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => qc.getQueryData<number | null>(key) ?? null,
    initialData: null as number | null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const request = useCallback(
    (exerciseId: number | null) => qc.setQueryData<number | null>(key, exerciseId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, sessionId],
  );
  return { focus: query.data, request };
}

/**
 * "Encerrar exercício" (#473): os exercícios encerrados antes das séries
 * todas. Mesmo cache dos escolhidos, pelo mesmo motivo: valem na sessão guiada
 * e no "Treino atual", e sobrevivem a sair e voltar.
 */
export function useEndedExercises(sessionId: string) {
  const qc = useQueryClient();
  const key = endedExercisesKey(sessionId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => qc.getQueryData<number[]>(key) ?? [],
    initialData: [] as number[],
    ...pendingExercisesQueryOptions,
  });
  const setEnded = useCallback(
    (exerciseId: number, ended: boolean) =>
      qc.setQueryData<number[]>(key, (current) => toggleEndedExercise(current, exerciseId, ended)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, sessionId],
  );
  return { ended: query.data, setEnded };
}
