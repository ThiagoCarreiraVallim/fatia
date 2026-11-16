import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Circuitos (#380): a configuração por formato, o retrato que a sessão
 * guarda, as séries que o fim grava e a comparação com a última vez.
 *
 * O relógio (fases, rounds, tempo final) é do `@fatia/api-client`
 * (`workout/circuit-timer.ts`), o mesmo na web e no app: o servidor recebe o
 * resultado já contado e só confere faixas. As séries saem daqui, pelas
 * mesmas contas de `circuitTotals` de lá.
 */

export const CIRCUIT_FORMATS = ['AMRAP', 'EMOM', 'TABATA', 'FOR_TIME'] as const;
export type CircuitFormatValue = (typeof CIRCUIT_FORMATS)[number];

export const CIRCUIT_EVENT_TYPES = [
  'mark',
  'round',
  'unround',
  'skip',
  'pause',
  'resume',
  'end',
] as const;

/** Teto de toques guardados (o mesmo `MAX_CIRCUIT_EVENTS` do api-client). */
export const MAX_CIRCUIT_EVENTS = 2000;
export const MAX_CIRCUIT_EXERCISES = 20;
/** Reps ou segundos de um exercício por round. */
export const MAX_CIRCUIT_TARGET = 600;

/** As faixas de cada campo, em segundos ou contagem. */
export const CIRCUIT_LIMITS = {
  durationSeconds: [60, 7200],
  workSeconds: [5, 600],
  restSeconds: [0, 600],
  intervals: [1, 60],
  rounds: [1, 100],
  restBetweenRoundsSeconds: [0, 900],
} as const;

type ConfigField = keyof typeof CIRCUIT_LIMITS;

export type CircuitConfigData = Record<ConfigField, number | null>;

/** Os campos de cada formato: o que é obrigatório e o que tem padrão. */
const FIELDS: Record<CircuitFormatValue, Partial<Record<ConfigField, number | 'required'>>> = {
  AMRAP: { durationSeconds: 'required' },
  EMOM: { durationSeconds: 'required' },
  TABATA: { workSeconds: 'required', restSeconds: 'required', intervals: 'required' },
  FOR_TIME: { rounds: 'required', restBetweenRoundsSeconds: 0 },
};

const LABELS: Record<ConfigField, string> = {
  durationSeconds: 'duração',
  workSeconds: 'trabalho',
  restSeconds: 'descanso',
  intervals: 'intervalos',
  rounds: 'rounds',
  restBetweenRoundsSeconds: 'descanso entre rounds',
};

/**
 * Só os campos do formato ficam gravados; os outros viram nulo. Faltar campo
 * obrigatório ou sair da faixa é 400 com o nome do campo em português.
 */
export function normalizeCircuitConfig(
  format: CircuitFormatValue,
  input: Partial<Record<ConfigField, number | null | undefined>>,
): CircuitConfigData {
  const out: CircuitConfigData = {
    durationSeconds: null,
    workSeconds: null,
    restSeconds: null,
    intervals: null,
    rounds: null,
    restBetweenRoundsSeconds: null,
  };
  for (const [field, rule] of Object.entries(FIELDS[format]) as [
    ConfigField,
    number | 'required',
  ][]) {
    const raw = input[field];
    const value = raw ?? (rule === 'required' ? null : rule);
    if (value === null || !Number.isInteger(value)) {
      throw new BadRequestException(`Informe ${LABELS[field]} do circuito.`);
    }
    const [min, max] = CIRCUIT_LIMITS[field];
    if (value < min || value > max) {
      throw new BadRequestException(`O valor de ${LABELS[field]} vai de ${min} a ${max}.`);
    }
    out[field] = value;
  }
  if (format === 'EMOM' && out.durationSeconds! % 60 !== 0) {
    throw new BadRequestException('O EMOM dura minutos inteiros.');
  }
  return out;
}

const itemSchema = z.object({
  exerciseId: z.number().int().positive(),
  name: z.string().max(200),
  muscleGroup: z.string().max(50),
  unit: z.enum(['REPS', 'SECONDS']),
  target: z.number().int().min(1).max(MAX_CIRCUIT_TARGET),
});

const configSchema = z.object({
  durationSeconds: z.number().int().optional(),
  workSeconds: z.number().int().optional(),
  restSeconds: z.number().int().optional(),
  intervals: z.number().int().optional(),
  rounds: z.number().int().optional(),
  restBetweenRoundsSeconds: z.number().int().optional(),
});

export const circuitDefinitionSchema = z.object({
  format: z.enum(CIRCUIT_FORMATS),
  name: z.string().max(100),
  config: configSchema,
  exercises: z.array(itemSchema).max(MAX_CIRCUIT_EXERCISES),
});

export type CircuitDefinitionV1 = z.infer<typeof circuitDefinitionSchema>;

export const circuitEventSchema = z.object({
  type: z.enum(CIRCUIT_EVENT_TYPES),
  at: z.number().int().nonnegative(),
});

export type CircuitEventV1 = z.infer<typeof circuitEventSchema>;

const exerciseTotalSchema = z.object({
  exerciseId: z.number().int().positive(),
  sets: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative(),
  seconds: z.number().int().nonnegative(),
});

/** O resultado gravado no fim. `totalReps` e `exercises` são contados aqui, no servidor. */
export const circuitResultSchema = z.object({
  roundsCompleted: z.number().int().nonnegative(),
  partialExercises: z.number().int().nonnegative(),
  roundSeconds: z.array(z.number().int().nonnegative()),
  partialRoundSeconds: z.number().int().nonnegative().nullable(),
  elapsedSeconds: z.number().int().nonnegative(),
  finalTimeSeconds: z.number().int().nonnegative().nullable(),
  intervalsCompleted: z.number().int().nonnegative().nullable(),
  completed: z.boolean(),
  totalReps: z.number().int().nonnegative(),
  exercises: z.array(exerciseTotalSchema),
});

export type CircuitResultV1 = z.infer<typeof circuitResultSchema>;

/** `WorkoutSession.circuit`, versão 1. */
export const circuitJsonSchema = z.object({
  version: z.literal(1),
  definition: circuitDefinitionSchema,
  /** Quando o relógio começou (ISO). */
  startedAt: z.string(),
  events: z.array(circuitEventSchema).max(MAX_CIRCUIT_EVENTS),
  result: circuitResultSchema.nullable(),
});

export type CircuitJsonV1 = z.infer<typeof circuitJsonSchema>;

/** Lê a coluna `Json`; o que não é v1 válido volta nulo (nunca 500). */
export function parseCircuitJson(json: unknown): CircuitJsonV1 | null {
  const parsed = circuitJsonSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** O número de "15", "30" ou "8-12" (o maior da faixa); 1 quando não há número. */
function targetOf(targetReps: string): number {
  const nums = (targetReps.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0);
  return Math.min(MAX_CIRCUIT_TARGET, nums.length ? Math.max(...nums) : 1);
}

export interface PlanForCircuit {
  name: string;
  circuit: ({ format: CircuitFormatValue } & CircuitConfigData) | null;
  exercises: ReadonlyArray<{
    exerciseId: number;
    targetReps: string;
    repUnit: 'REPS' | 'SECONDS';
    order: number;
    exercise: { name: string; muscleGroup: string };
  }>;
}

/** O retrato do circuito no começo da sessão: o histórico não muda quando o plano muda. */
export function circuitDefinitionFromPlan(plan: PlanForCircuit): CircuitDefinitionV1 {
  if (!plan.circuit) throw new BadRequestException('Este plano não é um circuito.');
  const { format, ...fields } = plan.circuit;
  const config = Object.fromEntries(
    Object.entries(fields).filter(([k, v]) => k in CIRCUIT_LIMITS && typeof v === 'number'),
  ) as CircuitDefinitionV1['config'];
  return {
    format,
    name: plan.name,
    config,
    exercises: [...plan.exercises]
      .sort((a, b) => a.order - b.order)
      .slice(0, MAX_CIRCUIT_EXERCISES)
      .map((pe) => ({
        exerciseId: pe.exerciseId,
        name: pe.exercise.name,
        muscleGroup: pe.exercise.muscleGroup,
        unit: pe.repUnit,
        target: targetOf(pe.targetReps),
      })),
  };
}

export interface CircuitCounts {
  roundsCompleted: number;
  partialExercises: number;
  intervalsCompleted: number | null;
}

export interface CircuitSetRow {
  exerciseId: number;
  setNumber: number;
  reps: number | null;
  durationSeconds: number | null;
  /** Idempotência: repetir o fim não duplica (`@@unique([sessionId, clientKey])`). */
  clientKey: string;
}

/**
 * Uma série por vez que o exercício foi feito: por round (AMRAP e For Time,
 * mais o round parcial), por minuto (EMOM) ou por intervalo de trabalho
 * (Tabata, com o tempo de trabalho). O número da série conta por exercício.
 */
export function circuitSetRows(def: CircuitDefinitionV1, counts: CircuitCounts): CircuitSetRow[] {
  const n = def.exercises.length;
  if (n === 0) return [];
  const rows: CircuitSetRow[] = [];
  const perExercise = new Map<number, number>();
  const push = (i: number, reps: number | null, seconds: number | null) => {
    const e = def.exercises[i];
    const setNumber = (perExercise.get(e.exerciseId) ?? 0) + 1;
    perExercise.set(e.exerciseId, setNumber);
    rows.push({
      exerciseId: e.exerciseId,
      setNumber,
      reps,
      durationSeconds: seconds,
      clientKey: `circuit:${rows.length}`,
    });
  };
  const byTarget = (i: number) => {
    const e = def.exercises[i];
    push(i, e.unit === 'REPS' ? e.target : null, e.unit === 'SECONDS' ? e.target : null);
  };
  if (def.format === 'AMRAP' || def.format === 'FOR_TIME') {
    for (let r = 0; r < counts.roundsCompleted; r++) for (let i = 0; i < n; i++) byTarget(i);
    for (let i = 0; i < Math.min(n, counts.partialExercises); i++) byTarget(i);
  } else if (def.format === 'EMOM') {
    for (let m = 0; m < (counts.intervalsCompleted ?? 0); m++) byTarget(m % n);
  } else {
    const work = def.config.workSeconds ?? 20;
    for (let k = 0; k < (counts.intervalsCompleted ?? 0); k++) push(k % n, null, work);
  }
  return rows;
}

/** Totais por exercício, a partir das séries que o fim grava. */
export function circuitTotalsFromRows(rows: CircuitSetRow[]): CircuitResultV1['exercises'] {
  const map = new Map<number, CircuitResultV1['exercises'][number]>();
  for (const r of rows) {
    const t = map.get(r.exerciseId) ?? { exerciseId: r.exerciseId, sets: 0, reps: 0, seconds: 0 };
    t.sets += 1;
    t.reps += r.reps ?? 0;
    t.seconds += r.durationSeconds ?? 0;
    map.set(r.exerciseId, t);
  }
  return [...map.values()];
}

type Comparable = Pick<
  CircuitResultV1,
  | 'roundsCompleted'
  | 'partialExercises'
  | 'finalTimeSeconds'
  | 'intervalsCompleted'
  | 'totalReps'
  | 'completed'
>;

export interface CircuitComparison {
  verdict: 'better' | 'same' | 'worse';
  roundsDelta: number | null;
  /** For Time terminado nas duas vezes: negativo é mais rápido. */
  finalTimeDeltaSeconds: number | null;
  intervalsDelta: number | null;
  repsDelta: number;
  previousFinalTimeSeconds: number | null;
}

const sign = (n: number): CircuitComparison['verdict'] =>
  n > 0 ? 'better' : n < 0 ? 'worse' : 'same';

/** "Melhor que a última vez" (Al-T4e, Al-T11c), pelo critério de cada formato. */
export function compareCircuitResults(
  format: CircuitFormatValue,
  exerciseCount: number,
  current: Comparable,
  previous: Comparable | null,
): CircuitComparison | null {
  if (!previous) return null;
  const n = Math.max(1, exerciseCount);
  const score = (r: Comparable) => r.roundsCompleted * n + r.partialExercises;
  const hasRounds = format === 'AMRAP' || format === 'FOR_TIME';
  const bothFinal = current.finalTimeSeconds !== null && previous.finalTimeSeconds !== null;

  let verdict: CircuitComparison['verdict'];
  if (format === 'FOR_TIME') {
    if (bothFinal) verdict = sign(previous.finalTimeSeconds! - current.finalTimeSeconds!);
    else if (current.finalTimeSeconds !== null) verdict = 'better';
    else if (previous.finalTimeSeconds !== null) verdict = 'worse';
    else verdict = sign(score(current) - score(previous));
  } else if (format === 'AMRAP') {
    verdict = sign(score(current) - score(previous));
  } else if (current.totalReps > 0 || previous.totalReps > 0) {
    verdict = sign(current.totalReps - previous.totalReps);
  } else {
    verdict = sign((current.intervalsCompleted ?? 0) - (previous.intervalsCompleted ?? 0));
  }

  return {
    verdict,
    roundsDelta: hasRounds ? current.roundsCompleted - previous.roundsCompleted : null,
    finalTimeDeltaSeconds: bothFinal
      ? current.finalTimeSeconds! - previous.finalTimeSeconds!
      : null,
    intervalsDelta: hasRounds
      ? null
      : (current.intervalsCompleted ?? 0) - (previous.intervalsCompleted ?? 0),
    repsDelta: current.totalReps - previous.totalReps,
    previousFinalTimeSeconds: previous.finalTimeSeconds,
  };
}
