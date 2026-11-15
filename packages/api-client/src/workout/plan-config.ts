import type {
  CardioIntensity,
  PlanExerciseConfig,
  PlanSetKind,
  PlanTechnique,
  WorkoutPlanExercise,
} from '../workout';
import { isCardioExercise } from './is-cardio';

/**
 * Regras das telas de plano (#378): Planos, Plano, Adicionar e Configurar
 * exercício. Num lugar só para web e app dizerem e calcularem o mesmo.
 */

/** Os atalhos de descanso da prancha (Al-T21). O campo também aceita digitar. */
export const REST_OPTIONS = [45, 60, 90, 120, 180] as const;

/** Até onde a tela deixa ir; a API corta no mesmo número. */
export const PLAN_LIMITS = {
  sets: 50,
  perSetRows: 30,
  reps: 999,
  loadKg: 1000,
  restSeconds: 900,
  notes: 200,
  cardioMinutes: 1440,
  cardioKm: 1000,
} as const;

/**
 * Técnicas da prancha (Al-T21). "Bi-set com o próximo" é um chip ao lado das
 * outras, mas na API é `biSetWithNext` (só marcação e ordem; o circuito é a #380).
 */
export type TechniqueChoice = PlanTechnique | 'BI_SET';

export const TECHNIQUE_OPTIONS: ReadonlyArray<{
  value: TechniqueChoice;
  label: string;
  description: string;
}> = [
  { value: 'NORMAL', label: 'Normal', description: 'Séries com descanso entre elas.' },
  {
    value: 'BI_SET',
    label: 'Bi-set com o próximo',
    description: 'Faz este e o próximo exercício em sequência, depois descansa.',
  },
  {
    value: 'DROP_SET',
    label: 'Drop-set',
    description: 'Na última série, baixa a carga e continua até a falha.',
  },
  {
    value: 'TO_FAILURE',
    label: 'Até a falha',
    description: 'Todas as séries vão até não sair mais nenhuma repetição.',
  },
];

export const SET_KIND_LABEL: Record<PlanSetKind, string> = {
  WARMUP: 'aquec.',
  NORMAL: 'normal',
  DROP: 'drop',
};

/** Toque no tipo da série: aquecimento → normal → drop → aquecimento. */
export const nextSetKind = (kind: PlanSetKind): PlanSetKind =>
  kind === 'WARMUP' ? 'NORMAL' : kind === 'NORMAL' ? 'DROP' : 'WARMUP';

export const INTENSITY_OPTIONS: ReadonlyArray<{ value: CardioIntensity; label: string }> = [
  { value: 'LIGHT', label: 'Leve' },
  { value: 'MODERATE', label: 'Moderada' },
  { value: 'VIGOROUS', label: 'Forte' },
];

/** "8-12" → { min: '8', max: '12' }; "10" → 10 a 10; "AMRAP" → vazio. */
export function splitRepRange(targetReps: string): { min: string; max: string } {
  const range = /^\s*(\d+)\s*(?:-|–|—|a)\s*(\d+)\s*$/i.exec(targetReps);
  if (range) return { min: range[1], max: range[2] };
  const single = /^\s*(\d+)\s*$/.exec(targetReps);
  if (single) return { min: single[1], max: single[1] };
  return { min: '', max: '' };
}

export const joinRepRange = (min: string, max: string): string =>
  min.trim() === max.trim() ? min.trim() : `${min.trim()}-${max.trim()}`;

/** A validação da faixa, no momento em que se digita (a API recusa o mesmo). */
export function repRangeError(min: string, max: string): string | null {
  if (!min.trim() || !max.trim()) return 'Informe as repetições.';
  const a = Number(min);
  const b = Number(max);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) {
    return 'Use números a partir de 1.';
  }
  if (a > PLAN_LIMITS.reps || b > PLAN_LIMITS.reps) return `Até ${PLAN_LIMITS.reps}.`;
  if (a > b) return 'O mínimo passa do máximo.';
  return null;
}

/** 45 → "45 s"; 60 → "1 min"; 90 → "1:30". */
export function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec ? `${min}:${String(sec).padStart(2, '0')}` : `${min} min`;
}

/** Trabalho de uma série de força, para a estimativa de minutos. */
const WORK_SECONDS = 40;
/** Descanso quando o plano não diz (o padrão da sessão). */
const DEFAULT_REST_SECONDS = 90;
/** Ritmo de esteira/bike para estimar a meta por distância: 6 min/km. */
const CARDIO_SECONDS_PER_KM = 360;

type Line = Pick<
  WorkoutPlanExercise,
  | 'targetSets'
  | 'targetReps'
  | 'repUnit'
  | 'restSeconds'
  | 'cardioTarget'
  | 'cardioDurationSeconds'
  | 'cardioDistanceMeters'
> & { exercise: { muscleGroup: string } };

function lineSeconds(pe: Line): number {
  if (isCardioExercise(pe.exercise)) {
    if (pe.cardioTarget === 'TIME' && pe.cardioDurationSeconds) return pe.cardioDurationSeconds;
    if (pe.cardioTarget === 'DISTANCE' && pe.cardioDistanceMeters) {
      return (pe.cardioDistanceMeters / 1000) * CARDIO_SECONDS_PER_KM;
    }
    return 10 * 60;
  }
  const rest = pe.restSeconds ?? DEFAULT_REST_SECONDS;
  return pe.targetSets * (WORK_SECONDS + rest);
}

/** "~min" do resumo do plano (Al-T7, Al-T19). */
export function estimatePlanMinutes(lines: ReadonlyArray<Line>): number {
  return Math.round(lines.reduce((acc, pe) => acc + lineSeconds(pe), 0) / 60);
}

/** Séries por grupo muscular, em %, maior primeiro (a barra do Al-T6/Al-T7). */
export function planMuscleShare(
  lines: ReadonlyArray<Pick<Line, 'targetSets' | 'exercise'>>,
): Array<{ group: string; sets: number; percent: number }> {
  const byGroup = new Map<string, number>();
  for (const pe of lines) {
    const g = pe.exercise.muscleGroup;
    byGroup.set(g, (byGroup.get(g) ?? 0) + pe.targetSets);
  }
  const total = [...byGroup.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  return [...byGroup.entries()]
    .map(([group, sets]) => ({ group, sets, percent: Math.round((sets / total) * 100) }))
    .sort((a, b) => b.sets - a.sets);
}

const numberPt = (n: number, digits = 1) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: digits });

/** "20 min" ou "3 km"; nulo quando o cardio ainda não tem meta. */
export function cardioTargetSummary(
  pe: Pick<PlanExerciseConfig, 'cardioTarget' | 'cardioDurationSeconds' | 'cardioDistanceMeters'>,
): string | null {
  if (pe.cardioTarget === 'TIME' && pe.cardioDurationSeconds) {
    return `${numberPt(pe.cardioDurationSeconds / 60)} min`;
  }
  if (pe.cardioTarget === 'DISTANCE' && pe.cardioDistanceMeters) {
    return `${numberPt(pe.cardioDistanceMeters / 1000, 2)} km`;
  }
  return null;
}

/** "4 × 8–10", "3 × 30–45 s" ou a meta do cardio — o número da direita da linha. */
export function planExerciseSummary(pe: Line & Parameters<typeof cardioTargetSummary>[0]): string {
  if (isCardioExercise(pe.exercise)) return cardioTargetSummary(pe) ?? 'sem meta';
  const reps = pe.targetReps.replace(/\s*-\s*/, '–');
  const unit = pe.repUnit === 'SECONDS' ? ' s' : '';
  return reps ? `${pe.targetSets} × ${reps}${unit}` : `${pe.targetSets} séries`;
}

/**
 * Faixas de FC das três intensidades (Al-T21d), sobre a FC máxima estimada
 * 220 − idade: leve 60–70%, moderada 70–80%, forte 80–90%. Sem idade, nulo —
 * a tela pede a data de nascimento em vez de inventar.
 */
export function heartRateZones(
  age: number | null,
): Record<CardioIntensity, [number, number]> | null {
  if (age === null || age < 10 || age > 100) return null;
  const max = 220 - age;
  const at = (p: number) => Math.round(max * p);
  return {
    LIGHT: [at(0.6), at(0.7)],
    MODERATE: [at(0.7), at(0.8)],
    VIGOROUS: [at(0.8), at(0.9)],
  };
}

/** O botão do Al-T8, que já diz quantos vão entrar. */
export const addSelectionLabel = (n: number): string =>
  n === 0 ? 'Selecione os exercícios' : `Adicionar ${n} ${n === 1 ? 'exercício' : 'exercícios'}`;
