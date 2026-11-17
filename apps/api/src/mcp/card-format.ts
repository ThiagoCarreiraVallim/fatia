/**
 * Pedaços de texto dos cartões do chat (#384) que mais de uma tool usa.
 *
 * O rótulo de um cartão fica gravado na conversa e reaparece dias depois, então nada aqui diz
 * "hoje": o dia sai como "16/11", que continua verdade amanhã.
 */

/** "2026-11-16" → "16/11". Qualquer outra coisa volta como veio. */
export function dayMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/**
 * Onde fica o ponto de uma faixa sem consumo para marcar: no meio dela, ou no único limite
 * que houver. Sem limite nenhum, `null`.
 */
export function rangeCenter(min: number | null, max: number | null): number | null {
  if (min != null && max != null) return Math.round(((min + max) / 2) * 10) / 10;
  return min ?? max ?? null;
}
