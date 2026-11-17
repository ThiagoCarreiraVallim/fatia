import type { GoalWithProgress } from '../goals.service';

type GoalForCard = Pick<
  GoalWithProgress,
  'title' | 'unit' | 'currentValue' | 'targetValue' | 'progressPercent' | 'status'
>;

/** Uma meta como item do cartão de progresso (prancha IA-Cartoes, #384). */
export function goalProgressItem(meta: GoalForCard) {
  return {
    title: meta.title,
    percent: meta.progressPercent ?? 0,
    detail:
      meta.currentValue === null
        ? `alvo ${meta.targetValue} ${meta.unit}`
        : `${meta.currentValue} de ${meta.targetValue} ${meta.unit}`,
    status: meta.status,
  };
}
