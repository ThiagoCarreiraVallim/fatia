/**
 * Deload por sinal real, não só por calendário (#145).
 *
 * A issue pede deload "sugerido a partir de sinal real (queda de desempenho, RPE
 * subindo com a mesma carga), não só de calendário". O sinal **antecipa** a semana
 * de deload que já existe no bloco; nunca cria uma quinta semana.
 *
 * São **duas** condições juntas, e não uma:
 *
 * - RPE médio subindo pelo menos 1 ponto ao longo da janela; **e**
 * - carga igual ou menor no mesmo período.
 *
 * RPE subindo com carga subindo é progresso, não fadiga — é literalmente o que
 * dupla progressão faz de propósito. Uma condição só transformaria toda semana boa
 * em motivo de deload.
 */

/** Sessões comparadas. Três porque é a mesma janela da prescrição (#144). */
export const DELOAD_WINDOW = 3;

/** Subida de RPE que deixa de ser ruído de auto-avaliação. */
const MIN_RPE_RISE = 1;

export interface DeloadPoint {
  /** RPE médio da sessão. `null` quando ninguém preencheu — a sessão é ignorada. */
  avgRpe: number | null;
  /** Carga da série de referência da sessão. */
  topSetKg: number;
}

export type DeloadSignal =
  | { suggested: true; rpeDelta: number; loadDeltaKg: number }
  | { suggested: false; reason: 'insufficient_history' | 'rpe_not_rising' | 'load_rising' };

/**
 * @param points Sessões da **mais recente para a mais antiga**, como
 *   `PrescriptionService` já entrega (`orderBy: { startedAt: 'desc' }`).
 */
export function detectDeloadSignal(points: DeloadPoint[]): DeloadSignal {
  // Sessão sem RPE não é sessão com RPE baixo: sem o número não há sinal nenhum,
  // e completar a janela com ela produziria um delta inventado.
  const comRpe = points
    .filter((point): point is DeloadPoint & { avgRpe: number } => point.avgRpe !== null)
    .slice(0, DELOAD_WINDOW);

  if (comRpe.length < DELOAD_WINDOW) return { suggested: false, reason: 'insufficient_history' };

  const recente = comRpe[0];
  const antiga = comRpe[DELOAD_WINDOW - 1];

  const rpeDelta = recente.avgRpe - antiga.avgRpe;
  if (rpeDelta < MIN_RPE_RISE) return { suggested: false, reason: 'rpe_not_rising' };

  const loadDeltaKg = recente.topSetKg - antiga.topSetKg;
  if (loadDeltaKg > 0) return { suggested: false, reason: 'load_rising' };

  return { suggested: true, rpeDelta, loadDeltaKg };
}
