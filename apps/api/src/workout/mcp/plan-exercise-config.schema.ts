import { z } from 'zod';
import {
  CARDIO_INTENSITIES,
  CARDIO_TARGETS,
  LOAD_MODES,
  MAX_CARDIO_DISTANCE_METERS,
  MAX_CARDIO_DURATION_SECONDS,
  MAX_LOAD_KG,
  MAX_PLAN_NOTES,
  MAX_PLAN_SETS,
  MAX_REST_SECONDS,
  MAX_SET_REPS,
  PLAN_SET_KINDS,
  REP_UNITS,
  TECHNIQUES,
} from '../helpers/plan-exercise-config';

/**
 * A configuração do exercício no plano (#378), igual em `add_exercise_to_plan`
 * e `update_plan_exercise`. Os limites são os do REST (`PlanExerciseConfigDto`).
 * `null` limpa o campo na edição.
 */
export const planExerciseConfigShape = {
  restSeconds: z
    .number()
    .int()
    .min(0)
    .max(MAX_REST_SECONDS)
    .nullable()
    .optional()
    .describe('Descanso entre séries, em segundos (ex.: 60, 90). null = padrão da sessão'),
  technique: z
    .enum(TECHNIQUES)
    .optional()
    .describe('NORMAL | DROP_SET (baixa a carga na última série) | TO_FAILURE (até a falha)'),
  biSetWithNext: z
    .boolean()
    .optional()
    .describe('Faz este e o próximo exercício em sequência e só então descansa'),
  startLoadKg: z
    .number()
    .min(0)
    .max(MAX_LOAD_KG)
    .nullable()
    .optional()
    .describe('Carga inicial em kg (com loadMode BODYWEIGHT, o peso extra)'),
  loadMode: z.enum(LOAD_MODES).optional().describe('WEIGHT (carga externa) | BODYWEIGHT'),
  repUnit: z
    .enum(REP_UNITS)
    .optional()
    .describe('REPS (padrão) | SECONDS (a série é contada em segundos, como a prancha)'),
  notes: z
    .string()
    .max(MAX_PLAN_NOTES)
    .nullable()
    .optional()
    .describe('Observação curta: pegada, banco, cadência'),
  cardioTarget: z
    .enum(CARDIO_TARGETS)
    .nullable()
    .optional()
    .describe('Só em exercício de cardio: meta por TIME (duração) ou DISTANCE (distância)'),
  cardioDurationSeconds: z
    .number()
    .int()
    .min(1)
    .max(MAX_CARDIO_DURATION_SECONDS)
    .nullable()
    .optional()
    .describe('Duração alvo do cardio, em segundos (ex.: 1200 = 20 min)'),
  cardioDistanceMeters: z
    .number()
    .min(1)
    .max(MAX_CARDIO_DISTANCE_METERS)
    .nullable()
    .optional()
    .describe('Distância alvo do cardio, em metros (ex.: 3000 = 3 km)'),
  cardioIntensity: z
    .enum(CARDIO_INTENSITIES)
    .nullable()
    .optional()
    .describe('Intensidade do cardio: LIGHT | MODERATE | VIGOROUS (a faixa de FC sai da idade)'),
} as const;

/** Série por série (pirâmide, aquecimento, drop). Substitui a tabela inteira; [] volta ao simples. */
export const planSetsSchema = z
  .array(
    z.object({
      kind: z.enum(PLAN_SET_KINDS).optional().describe('WARMUP | NORMAL (padrão) | DROP'),
      reps: z.number().int().min(1).max(MAX_SET_REPS).describe('Repetições (ou segundos)'),
      loadKg: z.number().min(0).max(MAX_LOAD_KG).nullable().optional().describe('Carga em kg'),
    }),
  )
  .max(MAX_PLAN_SETS);

export type PlanExerciseConfigInput = {
  [K in keyof typeof planExerciseConfigShape]?: z.infer<(typeof planExerciseConfigShape)[K]>;
};
