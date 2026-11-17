/**
 * As listas que mostram sessões: a das sessões e o histórico (#381, com os
 * totais do topo). Terminar, responder as perguntas, mudar a sensação, corrigir
 * uma série ou apagar uma sessão deixa as duas velhas — o histórico ficava de
 * fora e só se corrigia no próximo refetch.
 */
export const SESSION_LIST_KEYS = [
  ['workout', 'sessions'],
  ['workout', 'history'],
] as const;

/** O pedaço do `QueryClient` que invalida (sem depender do React Query aqui). */
interface Invalidates {
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => unknown;
}

export function invalidateSessionLists(qc: Invalidates): void {
  for (const queryKey of SESSION_LIST_KEYS) void qc.invalidateQueries({ queryKey: [...queryKey] });
}
