import { addDaysIso } from './date-tz';
import { JANELA_DIAS, TOLERANCIA_DIARIA, computeStreak } from './compute-streak';

/**
 * Constância (#382, prancha Al-G12) e o "dia ativo" do app inteiro.
 *
 * Um dia é ativo quando ao menos uma das quatro áreas foi cumprida: refeição registrada, treino
 * concluído, água na meta ou passos na meta (decisão do dono, #382). A sequência do Hoje, o
 * `GET /streak`, a tool `get_streak`, as conquistas de sequência e a grade da Constância leem
 * todos daqui — um cálculo só, para que o número de um lugar nunca desminta o de outro.
 *
 * Funções puras: o `ConsistencyService` lê o banco e entrega os conjuntos já no dia local.
 */

export const CONSISTENCY_AREAS = ['meal', 'workout', 'water', 'steps'] as const;
export type ConsistencyArea = (typeof CONSISTENCY_AREAS)[number];

export const CONSISTENCY_RANGES = ['month', 'quarter', 'year'] as const;
export type ConsistencyRange = (typeof CONSISTENCY_RANGES)[number];

/** Dias de cada período, terminando hoje: "30 dias", "90 dias" e "1 ano" da prancha. */
const RANGE_DAYS: Record<ConsistencyRange, number> = { month: 30, quarter: 90, year: 365 };

export interface DayAreas {
  /** `YYYY-MM-DD` no fuso da pessoa. */
  date: string;
  meal: boolean;
  workout: boolean;
  water: boolean;
  steps: boolean;
  /** Áreas cumpridas no dia, de 0 a 4: a cor da célula. */
  count: number;
}

export interface DaySources {
  mealDays: ReadonlySet<string>;
  workoutDays: ReadonlySet<string>;
  /** Água do dia: a SOMA dos registros (cada copo é um registro). */
  waterMlByDay: ReadonlyMap<string, number>;
  /** Passos do dia: o MAIOR registro (ADR 007), nunca a soma de fontes. */
  stepsByDay: ReadonlyMap<string, number>;
  /** `null` sem meta declarada: sem meta não há o que bater. */
  waterTargetMl: number | null;
  stepsTarget: number | null;
}

export function consistencyWindow(range: ConsistencyRange, today: string) {
  return { from: addDaysIso(today, -(RANGE_DAYS[range] - 1)), to: today };
}

/** Cada data de `from` a `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) dates.push(d);
  return dates;
}

const reached = (value: number | undefined, target: number | null): boolean =>
  target !== null && target > 0 && (value ?? 0) >= target;

export function buildDayAreas(from: string, to: string, sources: DaySources): DayAreas[] {
  return datesBetween(from, to).map((date) => {
    const meal = sources.mealDays.has(date);
    const workout = sources.workoutDays.has(date);
    const water = reached(sources.waterMlByDay.get(date), sources.waterTargetMl);
    const steps = reached(sources.stepsByDay.get(date), sources.stepsTarget);
    return {
      date,
      meal,
      workout,
      water,
      steps,
      count: [meal, workout, water, steps].filter(Boolean).length,
    };
  });
}

export function activeDates(days: readonly DayAreas[]): Set<string> {
  return new Set(days.filter((d) => d.count > 0).map((d) => d.date));
}

/** A sequência de hoje, com a tolerância de faltas da #147 (um dia perdido não zera nada). */
export function currentStreak(active: ReadonlySet<string>, today: string) {
  return computeStreak({
    ativos: active,
    corrente: today,
    anterior: (d) => addDaysIso(d, -1),
    janela: JANELA_DIAS,
    tolerancia: TOLERANCIA_DIARIA,
  });
}

/**
 * O recorde do período: a maior sequência que termina num dia dele, com a MESMA regra da
 * sequência atual. Medir "a sequência como seria naquele dia" para cada dia ativo garante isso
 * por construção — um segundo algoritmo de sequência acabaria discordando do primeiro numa
 * fronteira de tolerância. A sequência conta inteira, mesmo a parte de antes do período.
 */
export function longestStreak(active: ReadonlySet<string>, from: string, to: string): number {
  let best = 0;
  for (const date of datesBetween(from, to)) {
    if (!active.has(date)) continue;
    best = Math.max(best, currentStreak(active, date).periodos);
  }
  return best;
}

export interface AreaCount {
  days: number;
  /** Contra o que se compara; `null` quando a área não tem meta. */
  of: number | null;
}

export function areaSummary(
  days: readonly DayAreas[],
  goals: {
    weeklyWorkouts: number | null;
    waterTargetMl: number | null;
    stepsTarget: number | null;
  },
): Record<ConsistencyArea, AreaCount> {
  const total = days.length;
  const count = (area: ConsistencyArea) => days.filter((d) => d[area]).length;
  const hasTarget = (t: number | null) => t !== null && t > 0;
  return {
    meal: { days: count('meal'), of: total },
    // Treino não é diário: a meta é por semana, então o denominador é o das semanas cheias do
    // período (30 dias = 4 semanas × meta). Cobrar treino todo dia faria o descanso parecer falha.
    workout: {
      days: count('workout'),
      of: hasTarget(goals.weeklyWorkouts)
        ? Math.floor(total / 7) * (goals.weeklyWorkouts as number)
        : null,
    },
    water: { days: count('water'), of: hasTarget(goals.waterTargetMl) ? total : null },
    steps: { days: count('steps'), of: hasTarget(goals.stepsTarget) ? total : null },
  };
}
