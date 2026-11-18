import type { ChallengeKindName } from '../../social/challenge-days';
import type { ChallengeDetail } from '../challenge.service';
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

/**
 * O desafio como a IA o recebe (#395 I7): sem a `activity`, que traz ids de
 * check-in, horários e o link da própria foto — nada disso passa pela IA
 * (ADR 044 §10). O ranking e o hoje do próprio usuário ficam.
 */
export function challengeForAi(detail: ChallengeDetail): Omit<ChallengeDetail, 'activity'> {
  const resto: Partial<ChallengeDetail> = { ...detail };
  delete resto.activity;
  return resto as Omit<ChallengeDetail, 'activity'>;
}
