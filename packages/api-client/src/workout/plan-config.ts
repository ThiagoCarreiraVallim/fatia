import type {
  CardioIntensity,
  PlanExerciseConfig,
  PlanSetKind,
  PlanTechnique,
  WorkoutPlanExercise,
} from '../workout';
import { MUSCLE_GROUP_LABEL } from '../community-exercises';
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

/** O que a API grava quando o exercício entra sem configuração (3 × 8-12). */
export const DEFAULT_PLAN_LINE = {
  targetSets: 3,
  targetReps: '8-12',
  repUnit: 'REPS',
  restSeconds: null,
  cardioTarget: null,
  cardioDurationSeconds: null,
  cardioDistanceMeters: null,
} as const;

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

/**
 * Cor de cada grupo na barra muscular (Al-T6/Al-T7), pelo nome do token do
 * tema: os dois clientes resolvem o token na própria paleta.
 */
export type MuscleGroupTone =
  'protein' | 'water' | 'ok' | 'steps' | 'carbs' | 'fat' | 'danger' | 'muted';

const GROUP_TONE: Record<string, MuscleGroupTone> = {
  peito: 'protein',
  costas: 'water',
  pernas: 'ok',
  ombro: 'steps',
  braço: 'carbs',
  core: 'fat',
  cardio: 'danger',
};

export const muscleGroupTone = (group: string): MuscleGroupTone => GROUP_TONE[group] ?? 'muted';

/** "peito" → "Peito"; grupo fora da lista sai com a inicial maiúscula. */
export const muscleGroupName = (group: string): string =>
  (MUSCLE_GROUP_LABEL as Record<string, string>)[group] ??
  group.charAt(0).toUpperCase() + group.slice(1);

/** O texto da barra para leitor de tela: "Peito 57%, Ombro 43%". */
export const muscleShareLabel = (share: ReturnType<typeof planMuscleShare>): string =>
  share.map((s) => `${muscleGroupName(s.group)} ${s.percent}%`).join(', ');

/** "6 exercícios · 19 séries · ~49 min" — a linha do card do plano. */
export function planSummaryLine(lines: ReadonlyArray<Line>): string {
  const sets = lines.reduce((acc, pe) => acc + pe.targetSets, 0);
  const n = lines.length;
  return `${n} ${n === 1 ? 'exercício' : 'exercícios'} · ${sets} ${sets === 1 ? 'série' : 'séries'} · ~${estimatePlanMinutes(lines)} min`;
}

/** "6 exercícios · 19 séries": o resumo do Al-T7, com os minutos à parte, à direita. */
export function planCountsLine(lines: ReadonlyArray<Pick<Line, 'targetSets'>>): string {
  const sets = lines.reduce((acc, pe) => acc + pe.targetSets, 0);
  const n = lines.length;
  return `${n} ${n === 1 ? 'exercício' : 'exercícios'} · ${sets} ${sets === 1 ? 'série' : 'séries'}`;
}

/** "3 · 10 séries · ~26 min": o resumo curto ao lado de "Exercícios" no Novo plano (Al-T19). */
export function planDraftSummary(lines: ReadonlyArray<Line>): string {
  if (!lines.length) return '';
  const sets = lines.reduce((acc, pe) => acc + pe.targetSets, 0);
  return `${lines.length} · ${sets} ${sets === 1 ? 'série' : 'séries'} · ~${estimatePlanMinutes(lines)} min`;
}

/**
 * Os chips do card do plano (Al-T6): os três primeiros exercícios, na ordem do
 * plano, com as duas primeiras palavras do nome ("Supino reto"), e um "+ N mais".
 */
export function planExerciseChips(
  exercises: ReadonlyArray<{ order: number; exercise: { name: string } }>,
): Array<{ label: string; name: string }> {
  const ordered = [...exercises].sort((a, b) => a.order - b.order);
  const chips = ordered.slice(0, 3).map((e, i) => ({
    label: String(i + 1),
    name: e.exercise.name.trim().split(/\s+/).slice(0, 2).join(' '),
  }));
  if (ordered.length > 3) chips.push({ label: '+', name: `${ordered.length - 3} mais` });
  return chips;
}

/**
 * Chips do card de circuito (Al-T6 › Circuitos): todos os exercícios, na ordem e
 * com o nome inteiro. O circuito é curto e a ordem é o próprio treino; cortar
 * em três e em duas palavras ("Thruster com") escondia o que vem a seguir.
 */
export function circuitExerciseChips(
  exercises: ReadonlyArray<{ order: number; exercise: { name: string } }>,
): Array<{ label: string; name: string }> {
  return [...exercises]
    .sort((a, b) => a.order - b.order)
    .map((e, i) => ({ label: String(i + 1), name: e.exercise.name.trim() }));
}

/** "feito 12 vezes · último há 4 dias" — o histórico no topo do plano (Al-T7). */
export function planHistoryLine(
  timesDone: number,
  lastDoneAt: string | null,
  now: Date = new Date(),
): string {
  if (!timesDone || !lastDoneAt) return 'ainda não feito';
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(lastDoneAt))) / 86_400_000);
  const when = days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
  return `feito ${timesDone} ${timesDone === 1 ? 'vez' : 'vezes'} · último ${when}`;
}
