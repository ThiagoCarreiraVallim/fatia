import type { PendingExercise } from '../session-view';

/**
 * Exercícios escolhidos na busca e ainda sem série (ver `buildExerciseGroups`).
 * Não vão ao servidor — uma série falsa sujaria volume e recordes —, mas
 * precisam valer em todas as telas da sessão e sobreviver a sair dela e
 * voltar. O lugar é o cache do React Query, com esta chave, nos dois apps.
 */
export const pendingExercisesKey = (sessionId: string) =>
  ['workout', 'session', sessionId, 'pending'] as const;

/**
 * Opções da consulta dos escolhidos: nunca "envelhecem" (não há servidor a
 * consultar) e nunca são coletadas — a coleta padrão (5 min) apagaria a lista
 * de quem saiu da tela do treino e voltou depois.
 */
export const pendingExercisesQueryOptions = {
  staleTime: Infinity,
  gcTime: Infinity,
} as const;

/** Põe o exercício no fim da lista; escolhido duas vezes, fica uma. */
export function addPendingExercise(
  current: PendingExercise[] | undefined,
  exercise: PendingExercise,
): PendingExercise[] {
  const list = current ?? [];
  return list.some((p) => p.id === exercise.id) ? list : [...list, exercise];
}

/** Tira o exercício da lista. */
export function dropPendingExercise(
  current: PendingExercise[] | undefined,
  exerciseId: number,
): PendingExercise[] {
  return (current ?? []).filter((p) => p.id !== exerciseId);
}

/**
 * O corpo do `startSession` do Treino livre e do "Repetir" (web e app): sem
 * plano, a ordem dos escolhidos vai junto como `exerciseOrder`, para o detalhe
 * e o "Salvar como plano" saírem na ordem em que a pessoa escolheu.
 */
export function startSessionBody(
  planId: string | null | undefined,
  pending: readonly PendingExercise[] | undefined,
  now: Date = new Date(),
): { planId?: string; startedAt: string; exerciseOrder?: number[] } {
  const order = !planId && pending?.length ? { exerciseOrder: pending.map((p) => p.id) } : {};
  return { planId: planId ?? undefined, startedAt: now.toISOString(), ...order };
}
