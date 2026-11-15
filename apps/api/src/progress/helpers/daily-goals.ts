/**
 * As metas do dia (prancha Al-H5-Metas, #373): uma linha por meta que tem alvo,
 * com o valor de hoje e se ela foi atingida. É o "Metas 2/5" do topo do Hoje.
 *
 * Função pura para o cálculo ter teste sem banco: o `DashboardService` só junta
 * os números que já lê e entrega aqui.
 */

export interface DailyGoal {
  /** `kcal`, `protein`, `water`, `steps`, `workout` ou `nutrient:<chave>`. */
  key: string;
  label: string;
  unit: string;
  current: number;
  min: number | null;
  max: number | null;
  met: boolean;
  /** 0–100: a faixa conta contra o meio dela; só mínimo, contra ele; só máximo, contra ele. */
  percent: number;
  /** Só na linha de treino: o plano de hoje, quando há. */
  planName?: string | null;
}

export interface DailyGoalsInput {
  goals: {
    kcalMin: number;
    kcalMax: number;
    proteinMinG: number;
    proteinMaxG: number;
    dailyStepsTarget: number;
    dailyWaterTargetMl: number;
  } | null;
  consumed: { kcal: number; proteinG: number };
  waterMl: number;
  steps: number;
  /**
   * `planned`: o bloco de periodização marca treino para hoje. Sem bloco não há
   * como saber se hoje é dia de treino, e cobrar treino em dia de descanso faria
   * a contagem mentir; a linha entra só quando já houve treino.
   */
  workout: { planName: string | null; planned: boolean; completedToday: boolean };
  nutrients: Array<{
    nutrientKey: string;
    label: string;
    unit: string;
    min: number | null;
    max: number | null;
    total: number;
  }>;
}

export interface DailyGoals {
  met: number;
  total: number;
  items: DailyGoal[];
}

function percentOf(current: number, min: number | null, max: number | null): number {
  const ref = min != null && max != null ? (min + max) / 2 : (min ?? max ?? 0);
  if (ref <= 0) return 0;
  return Math.min(100, Math.round((current / ref) * 100));
}

function inRange(current: number, min: number | null, max: number | null): boolean {
  if (min != null && current < min) return false;
  if (max != null && current > max) return false;
  return true;
}

function row(
  key: string,
  label: string,
  unit: string,
  current: number,
  min: number | null,
  max: number | null,
): DailyGoal {
  return {
    key,
    label,
    unit,
    current,
    min,
    max,
    met: inRange(current, min, max),
    percent: percentOf(current, min, max),
  };
}

export function computeDailyGoals(input: DailyGoalsInput): DailyGoals {
  const { goals, consumed, workout } = input;
  const items: DailyGoal[] = [];

  if (goals) {
    items.push(row('kcal', 'Calorias', 'kcal', consumed.kcal, goals.kcalMin, goals.kcalMax));
    items.push(
      row('protein', 'Proteína', 'g', consumed.proteinG, goals.proteinMinG, goals.proteinMaxG),
    );
    if (goals.dailyWaterTargetMl > 0) {
      items.push(row('water', 'Água', 'mL', input.waterMl, goals.dailyWaterTargetMl, null));
    }
    if (goals.dailyStepsTarget > 0) {
      items.push(row('steps', 'Passos', 'passos', input.steps, goals.dailyStepsTarget, null));
    }
  }

  if (workout.planned || workout.completedToday) {
    items.push({
      key: 'workout',
      label: 'Treino',
      unit: '',
      current: workout.completedToday ? 1 : 0,
      min: 1,
      max: null,
      met: workout.completedToday,
      percent: workout.completedToday ? 100 : 0,
      planName: workout.planName,
    });
  }

  for (const n of input.nutrients) {
    if (n.min == null && n.max == null) continue;
    items.push(row(`nutrient:${n.nutrientKey}`, n.label, n.unit, n.total, n.min, n.max));
  }

  return { met: items.filter((i) => i.met).length, total: items.length, items };
}
