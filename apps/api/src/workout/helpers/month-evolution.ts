/**
 * "Maior evolução do mês" (#382, prancha Al-G5): o 1RM estimado do começo e do fim do período,
 * em %. Em % e em 1RM estimado para comparar exercícios de cargas e repetições bem diferentes.
 *
 * "Mês" são os últimos 30 dias, e não o mês do calendário: no dia 2 o mês do calendário não tem
 * evolução nenhuma a mostrar, e a prancha compara 30 out com 2 nov.
 */
export const EVOLUTION_WINDOW_DAYS = 30;

export interface MonthEvolution {
  /** Melhor 1RM estimado da primeira sessão do período. */
  startE1RM: number;
  /** Melhor 1RM estimado da última sessão do período. */
  endE1RM: number;
  /** Variação em %, uma casa. Negativa quando caiu: não se esconde. */
  percent: number;
}

export function monthEvolution(
  points: ReadonlyArray<{ sessionId: string; at: Date; e1rm: number }>,
  now: Date,
): MonthEvolution | null {
  const since = now.getTime() - EVOLUTION_WINDOW_DAYS * 86_400_000;
  const bySession = new Map<string, { at: Date; e1rm: number }>();
  for (const p of points) {
    if (p.at.getTime() < since || p.at.getTime() > now.getTime()) continue;
    const current = bySession.get(p.sessionId);
    if (!current || p.e1rm > current.e1rm) bySession.set(p.sessionId, { at: p.at, e1rm: p.e1rm });
  }
  const sessions = [...bySession.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (sessions.length < 2) return null;
  const start = sessions[0].e1rm;
  const end = sessions[sessions.length - 1].e1rm;
  if (start <= 0) return null;
  return {
    startE1RM: start,
    endE1RM: end,
    percent: Math.round((end / start - 1) * 1000) / 10,
  };
}

/** O destaque: a maior evolução positiva. Sem nenhuma, não há o que destacar. */
export function pickHighlight<T extends { monthEvolution: MonthEvolution | null }>(
  records: readonly T[],
): T | null {
  let best: T | null = null;
  for (const r of records) {
    if (!r.monthEvolution || r.monthEvolution.percent <= 0) continue;
    if (!best || r.monthEvolution.percent > best.monthEvolution!.percent) best = r;
  }
  return best;
}
