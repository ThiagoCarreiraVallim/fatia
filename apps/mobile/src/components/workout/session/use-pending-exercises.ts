import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PendingExercise } from '@fatia/api-client';

/**
 * Exercícios escolhidos na busca e ainda sem série (ver `buildExerciseGroups`).
 * Não vão ao servidor — uma série falsa sujaria volume e recordes —, mas
 * precisam valer nas duas telas da sessão: a guiada e o "Treino atual"
 * (prancha `Al-T17`). O cache do React Query é o lugar comum das duas, sem
 * contexto novo em volta da rota.
 */
export function usePendingExercises(sessionId: string) {
  const qc = useQueryClient();
  const key = ['workout', 'session', sessionId, 'pending'] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => qc.getQueryData<PendingExercise[]>(key) ?? [],
    initialData: [] as PendingExercise[],
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const add = useCallback(
    (exercise: PendingExercise) =>
      qc.setQueryData<PendingExercise[]>(key, (current = []) =>
        current.some((p) => p.id === exercise.id) ? current : [...current, exercise],
      ),
    // A chave é derivada só do id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, sessionId],
  );

  const drop = useCallback(
    (exerciseId: number) =>
      qc.setQueryData<PendingExercise[]>(key, (current = []) =>
        current.filter((p) => p.id !== exerciseId),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, sessionId],
  );

  return { pending: query.data, add, drop };
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
