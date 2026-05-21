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
