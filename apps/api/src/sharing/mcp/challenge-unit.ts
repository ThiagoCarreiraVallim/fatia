import type { ChallengeKindName } from '../../social/challenge-days';
import type { ChallengeMetric } from '../../social/challenge-metric';

/** A unidade do placar de cada métrica antiga; as de dias contam dias. */
const METRIC_UNIT: Record<ChallengeMetric, string> = {
  WORKOUT_SESSIONS: 'treinos',
  STEPS: 'passos',
  WATER_ML: 'ml',
  ACTIVE_DAYS: 'dias',
  KCAL_IN_RANGE_DAYS: 'dias',
  PROTEIN_TARGET_DAYS: 'dias',
  STREAK_DAYS: 'dias',
};

/**
 * A unidade do placar no cartão (#395): pontos no desafio de pontos, a da
 * métrica no tipo antigo e dias em todo o resto (foto, água, passos, nutrição).
 */
export function challengeUnit(kind: ChallengeKindName, metric: ChallengeMetric): string {
  if (kind === 'POINTS') return 'pts';
  if (kind === 'METRIC') return METRIC_UNIT[metric];
  return 'dias';
}
