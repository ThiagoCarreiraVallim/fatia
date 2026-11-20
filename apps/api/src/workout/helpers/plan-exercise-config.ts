import { BadRequestException } from '@nestjs/common';

/**
 * Regras da configuração do exercício no plano (#378). Um lugar só para a
 * rota, a tool MCP e o retrato do plano: o limite que a tela respeita é o que
 * a API grava, e o que a API grava é o que o retrato aceita.
 */

/** MAX = até a falha (sem número) e METERS = distância vêm do editor da equipe (#406). */
export const REP_UNITS = ['REPS', 'SECONDS', 'MAX', 'METERS'] as const;
/** PERCENT_1RM usa `loadPercent`; BAND é elástico, sem número (#406). */
export const LOAD_MODES = ['WEIGHT', 'BODYWEIGHT', 'PERCENT_1RM', 'BAND'] as const;
export const TECHNIQUES = ['NORMAL', 'DROP_SET', 'TO_FAILURE'] as const;
export const PLAN_SET_KINDS = ['WARMUP', 'NORMAL', 'DROP'] as const;
export const CARDIO_TARGETS = ['TIME', 'DISTANCE', 'CALORIES'] as const;
export const CARDIO_INTENSITIES = ['LIGHT', 'MODERATE', 'VIGOROUS'] as const;

export type RepUnitValue = (typeof REP_UNITS)[number];
export type LoadModeValue = (typeof LOAD_MODES)[number];
export type TechniqueValue = (typeof TECHNIQUES)[number];
export type PlanSetKindValue = (typeof PLAN_SET_KINDS)[number];
export type CardioTargetValue = (typeof CARDIO_TARGETS)[number];
export type CardioIntensityValue = (typeof CARDIO_INTENSITIES)[number];

export const MAX_TARGET_SETS = 50;
export const MAX_PLAN_SETS = 30;
/** Repetições (ou segundos, na prancha) de uma série. */
export const MAX_SET_REPS = 999;
export const MAX_LOAD_KG = 1000;
export const MAX_REST_SECONDS = 900;
export const MAX_PLAN_NOTES = 200;
/** 24 h — o teto de `SessionSet.durationSeconds` também cabe aqui. */
export const MAX_CARDIO_DURATION_SECONDS = 86_400;
/** 1.000 km. */
export const MAX_CARDIO_DISTANCE_METERS = 1_000_000;
/** Editor da equipe (#406): limites dos campos novos da linha. */
export const MAX_LOAD_PERCENT = 150;
export const MAX_CARDIO_CALORIES = 5000;
export const MAX_CARDIO_INCLINE = 40;
export const MIN_CARDIO_PACE = 60;
export const MAX_CARDIO_PACE = 1800;

export const DEFAULT_STRENGTH_SETS = 3;
export const DEFAULT_STRENGTH_REPS = '8-12';

/** "8-12", "8–12" ou "8 a 12": o par mínimo-máximo, quando a faixa é numérica. */
export function parseRepRange(targetReps: string): { min: number; max: number } | null {
  const m = /^\s*(\d+)\s*(?:-|–|—|a)\s*(\d+)\s*$/i.exec(targetReps);
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

/** Mínimo acima do máximo ("15-8") é erro de digitação, não faixa. */
export function assertRepRange(targetReps: string | undefined): void {
  if (targetReps === undefined) return;
  const range = parseRepRange(targetReps);
  if (range && range.min > range.max) {
    throw new BadRequestException(
      `Faixa de repetições inválida: o mínimo (${range.min}) passa do máximo (${range.max}).`,
    );
  }
}

export interface PlanSetInput {
  kind?: PlanSetKindValue;
  reps: number;
  loadKg?: number | null;
}

/**
 * O que a tabela série por série diz de séries e faixa, para o resto do produto
 * (sessão, prescrição, MCP) que lê `targetSets` × `targetReps`. O aquecimento
 * conta como série, mas fica fora da faixa: ela é a do trabalho.
 */
export function summarizeSets(sets: ReadonlyArray<PlanSetInput>): {
  targetSets: number;
  targetReps: string;
} {
  const work = sets.filter((s) => (s.kind ?? 'NORMAL') !== 'WARMUP');
  const reps = (work.length ? work : sets).map((s) => s.reps);
  const min = Math.min(...reps);
  const max = Math.max(...reps);
  return { targetSets: sets.length, targetReps: min === max ? String(min) : `${min}-${max}` };
}

export interface CardioFields {
  cardioTarget?: CardioTargetValue | null;
  cardioDurationSeconds?: number | null;
  cardioDistanceMeters?: number | null;
  cardioIntensity?: CardioIntensityValue | null;
}

export const hasCardioInput = (dto: CardioFields): boolean =>
  (dto.cardioTarget ?? null) !== null ||
  (dto.cardioDurationSeconds ?? null) !== null ||
  (dto.cardioDistanceMeters ?? null) !== null ||
  (dto.cardioIntensity ?? null) !== null;

/**
 * A meta de cardio depois da gravação (o que já estava, com o que chegou por
 * cima) tem que fazer sentido: meta por distância sem distância é um alvo que
 * a sessão não teria como mostrar.
 */
export function assertCardioTarget(merged: CardioFields): void {
  if (merged.cardioTarget === 'DISTANCE' && !merged.cardioDistanceMeters) {
    throw new BadRequestException('Meta por distância precisa da distância.');
  }
  if (merged.cardioTarget === 'TIME' && !merged.cardioDurationSeconds) {
    throw new BadRequestException('Meta por tempo precisa da duração.');
  }
}
