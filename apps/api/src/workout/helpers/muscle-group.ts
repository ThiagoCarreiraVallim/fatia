import { z } from 'zod';

export const CANONICAL_MUSCLE_GROUPS = [
  'peito',
  'costas',
  'pernas',
  'ombro',
  'braço',
  'core',
  'cardio',
] as const;

export const MUSCLE_GROUP_MAX_LENGTH = 50;

/**
 * Chaves anatômicas (em inglês) usadas em primaryMuscles/secondaryMuscles.
 * DEVEM permanecer em inglês: casam com os `data-muscle` dos SVGs do diagrama
 * muscular (apps/web/public/muscle-*.svg) — é isso que faz a coloração funcionar.
 */
export const ANATOMICAL_MUSCLES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export type AnatomicalMuscle = (typeof ANATOMICAL_MUSCLES)[number];

/**
 * Lista de músculos para primary/secondary: cada item ∈ ANATOMICAL_MUSCLES.
 *
 * É uma FÁBRICA, não uma constante. Reusar a mesma instância de schema Zod em
 * dois campos do mesmo input faz o conversor de JSON Schema deduplicar por
 * identidade de objeto e emitir `$ref` no segundo:
 *
 *     primaryMuscles:   { type: 'array', items: {...} }
 *     secondaryMuscles: { $ref: '#/properties/primaryMuscles' }
 *
 * É JSON Schema válido, mas cliente que não resolve `$ref` — o portal de
 * submissão do diretório, entre outros — enxerga o campo sem tipo. Uma
 * instância nova por campo mantém os dois inlinados.
 */
export const muscleListSchema = () =>
  z
    .array(z.enum(ANATOMICAL_MUSCLES))
    .describe('Lista de músculos em INGLÊS (chaves do diagrama): ' + ANATOMICAL_MUSCLES.join(', '));

export const MUSCLE_GROUP_PATTERN = /^\p{L}+(?:[ -]\p{L}+)*$/u;

const normalize = (v: unknown): unknown => (typeof v === 'string' ? v.trim().toLowerCase() : v);

export const muscleGroupSchema = z.preprocess(
  normalize,
  z
    .string()
    .min(1, 'muscleGroup cannot be empty')
    .max(
      MUSCLE_GROUP_MAX_LENGTH,
      `muscleGroup must have at most ${MUSCLE_GROUP_MAX_LENGTH} characters`,
    )
    .regex(MUSCLE_GROUP_PATTERN, 'muscleGroup must contain only letters, spaces, and hyphens'),
);
