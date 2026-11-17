import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Circuitos (#380): a configuração por formato, o retrato que a sessão
 * guarda, as séries que o fim grava e a comparação com a última vez.
 *
 * O relógio (fases, rounds, tempo final) é do `@fatia/design`
 * (`circuit-timer.ts`), o mesmo da web e do app: o fim com toques é contado de
 * novo aqui por ele, e o resultado do cliente é só uma dica. Sem toques
 * (registro pelo MCP), o resultado passa por `checkCircuitResultBounds`. As
 * séries saem daqui, pelas mesmas contas de `circuitTotals` de lá.
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
/**
 * Menor tempo plausível de um exercício de reps num round (s). O de segundos
 * leva o próprio alvo. Com isso o AMRAP tem teto de rounds pelo tempo.
 */
export const MIN_SECONDS_PER_EXERCISE = 3;
/**
 * Teto de séries que um fim de circuito grava. O maior circuito legítimo é o
 * For Time de 100 rounds × 20 exercícios (2.000); o AMRAP de 2 h com 20
 * exercícios de reps cabe em 2.400.
 */
export const MAX_CIRCUIT_SETS = 2400;
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
/**
 * A última vez do mesmo circuito, congelada no começo da sessão: a tela do
 * relógio compara no fim (Al-T4e) antes de salvar.
 */
export const circuitPreviousSchema = z.object({
  sessionId: z.string(),
  startedAt: z.string(),
  roundsCompleted: z.number().int().min(0),
  partialExercises: z.number().int().min(0),
  finalTimeSeconds: z.number().int().min(0).nullable(),
  intervalsCompleted: z.number().int().min(0).nullable(),
  totalReps: z.number().int().min(0),
  elapsedSeconds: z.number().int().min(0),
});

export type CircuitPreviousV1 = z.infer<typeof circuitPreviousSchema>;

export const circuitJsonSchema = z.object({
  version: z.literal(1),
  definition: circuitDefinitionSchema,
  /** Quando o relógio começou (ISO). */
  startedAt: z.string(),
  // Um a mais que o corpo aceita: o "end" que o servidor põe no fim de uma
  // lista já cheia (`CircuitSessionService.countFromEvents`). Sem ele o JSON
  // gravado deixava de ser lido, e o resumo voltava sem o circuito.
  events: z.array(circuitEventSchema).max(MAX_CIRCUIT_EVENTS + 1),
  result: circuitResultSchema.nullable(),
  /** Opcional: as sessões gravadas antes deste campo não o têm. */
  previous: circuitPreviousSchema.nullable().optional(),
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

/** O JSON da sessão que começa: o retrato, sem toques e sem resultado. */
export function newCircuitJson(
  definition: CircuitDefinitionV1,
  startedAt: Date,
  previous: { sessionId: string; startedAt: Date; json: CircuitJsonV1 } | null = null,
): CircuitJsonV1 {
  const r = previous?.json.result;
  return {
    version: 1,
    definition,
    startedAt: startedAt.toISOString(),
    events: [],
    result: null,
    previous:
      previous && r
        ? {
            sessionId: previous.sessionId,
            startedAt: previous.startedAt.toISOString(),
            roundsCompleted: r.roundsCompleted,
            partialExercises: r.partialExercises,
            finalTimeSeconds: r.finalTimeSeconds,
            intervalsCompleted: r.intervalsCompleted,
            totalReps: r.totalReps,
            elapsedSeconds: r.elapsedSeconds,
          }
        : null,
  };
}

/** Quantos minutos (EMOM) ou intervalos (Tabata) o circuito tem. */
export function circuitIntervalsTotal(def: CircuitDefinitionV1): number | null {
  if (def.format === 'TABATA') return def.config.intervals ?? null;
  if (def.format === 'EMOM') return Math.ceil((def.config.durationSeconds ?? 0) / 60);
  return null;
}

/**
 * O circuito no "Treino feito" (Al-T5) e no detalhe da sessão do histórico
 * (Al-T11c, #381). Nulo enquanto a sessão não tem resultado.
 */
export interface CircuitSummaryView {
  format: CircuitFormatValue;
  name: string;
  config: CircuitDefinitionV1['config'];
  roundsCompleted: number;
  partialExercises: number;
  /** O exercício da vez quando o circuito parou no meio de um round ("o tempo acabou no Box jump"). */
  stoppedAt: { exerciseId: number; name: string } | null;
  roundSeconds: number[];
  partialRoundSeconds: number | null;
  averageRoundSeconds: number | null;
  elapsedSeconds: number;
  finalTimeSeconds: number | null;
  intervalsCompleted: number | null;
  intervalsTotal: number | null;
  /** Chegou ao fim (tempo, rounds ou intervalos), e não foi encerrado antes. */
  completed: boolean;
  totalReps: number;
  /** Na ordem do circuito: o alvo por round e o total feito. */
  exercises: Array<{
    exerciseId: number;
    name: string;
    muscleGroup: string;
    unit: 'REPS' | 'SECONDS';
    target: number;
    sets: number;
    reps: number;
    seconds: number;
  }>;
  previous: {
    sessionId: string;
    startedAt: Date;
    roundsCompleted: number;
    partialExercises: number;
    finalTimeSeconds: number | null;
    intervalsCompleted: number | null;
    totalReps: number;
    elapsedSeconds: number;
  } | null;
  comparison: CircuitComparison | null;
}

export function circuitSummaryView(
  current: CircuitJsonV1,
  previous: { sessionId: string; startedAt: Date; json: CircuitJsonV1 } | null,
): CircuitSummaryView | null {
  const r = current.result;
  if (!r) return null;
  const def = current.definition;
  const prev = previous?.json.result ? { ...previous, result: previous.json.result } : null;
  const hasRounds = def.format === 'AMRAP' || def.format === 'FOR_TIME';
  const stopped =
    hasRounds && r.finalTimeSeconds === null && r.partialRoundSeconds !== null
      ? def.exercises[r.partialExercises]
      : undefined;
  const totals = new Map(r.exercises.map((e) => [e.exerciseId, e]));
  const seen = new Set<number>();
  return {
    format: def.format,
    name: def.name,
    config: def.config,
    roundsCompleted: r.roundsCompleted,
    partialExercises: r.partialExercises,
    stoppedAt: stopped ? { exerciseId: stopped.exerciseId, name: stopped.name } : null,
    roundSeconds: r.roundSeconds,
    partialRoundSeconds: r.partialRoundSeconds,
    averageRoundSeconds: r.roundSeconds.length
      ? Math.round(r.roundSeconds.reduce((a, b) => a + b, 0) / r.roundSeconds.length)
      : null,
    elapsedSeconds: r.elapsedSeconds,
    finalTimeSeconds: r.finalTimeSeconds,
    intervalsCompleted: r.intervalsCompleted,
    intervalsTotal: circuitIntervalsTotal(def),
    completed: r.completed,
    totalReps: r.totalReps,
    exercises: def.exercises
      .filter((e) => !seen.has(e.exerciseId) && seen.add(e.exerciseId))
      .map((e) => {
        const t = totals.get(e.exerciseId);
        return { ...e, sets: t?.sets ?? 0, reps: t?.reps ?? 0, seconds: t?.seconds ?? 0 };
      }),
    previous: prev
      ? {
          sessionId: prev.sessionId,
          startedAt: prev.startedAt,
          roundsCompleted: prev.result.roundsCompleted,
          partialExercises: prev.result.partialExercises,
          finalTimeSeconds: prev.result.finalTimeSeconds,
          intervalsCompleted: prev.result.intervalsCompleted,
          totalReps: prev.result.totalReps,
          elapsedSeconds: prev.result.elapsedSeconds,
        }
      : null,
    comparison: compareCircuitResults(def.format, def.exercises.length, r, prev?.result ?? null),
  };
}

/** Os números de um resultado que as faixas conferem. */
export interface CircuitResultCounts extends CircuitCounts {
  roundSeconds: number[];
  elapsedSeconds: number;
  finalTimeSeconds: number | null;
}

/** Duração total do circuito em segundos; nulo no For Time, que não tem. */
export function circuitTotalSeconds(def: CircuitDefinitionV1): number | null {
  const c = def.config;
  if (def.format === 'AMRAP' || def.format === 'EMOM') return c.durationSeconds ?? null;
  if (def.format === 'TABATA') {
    return ((c.workSeconds ?? 0) + (c.restSeconds ?? 0)) * (c.intervals ?? 0);
  }
  return null;
}

/** O menor tempo plausível de um round: 3 s por exercício de reps, o alvo nos de segundos. */
function minRoundSeconds(def: CircuitDefinitionV1): number {
  const sum = def.exercises.reduce(
    (acc, e) => acc + (e.unit === 'SECONDS' ? e.target : MIN_SECONDS_PER_EXERCISE),
    0,
  );
  return Math.max(1, sum);
}

/**
 * As faixas de um resultado (revisão da #380): o que o relógio do cliente ou o
 * MCP mandam não pode gravar séries que o circuito não comporta. 400 com o
 * motivo em português.
 *
 * `roundTimesOptional`: no registro sem relógio (MCP) a pessoa pode não saber o
 * tempo de cada round; aí a lista pode vir vazia, mas nunca pela metade.
 */
export function checkCircuitResultBounds(
  def: CircuitDefinitionV1,
  r: CircuitResultCounts,
  opts: { roundTimesOptional?: boolean } = {},
): void {
  const n = def.exercises.length;
  const hasRounds = def.format === 'AMRAP' || def.format === 'FOR_TIME';
  const total = circuitTotalSeconds(def);
  if (hasRounds && r.partialExercises >= Math.max(1, n)) {
    throw new BadRequestException('O round parcial tem menos exercícios que o circuito.');
  }
  if (def.format === 'FOR_TIME' && r.roundsCompleted > (def.config.rounds ?? 0)) {
    throw new BadRequestException('Mais rounds do que o circuito tem.');
  }
  if (def.format === 'AMRAP' && total !== null) {
    const max = Math.floor(total / minRoundSeconds(def));
    if (r.roundsCompleted > max) {
      throw new BadRequestException(`Mais rounds do que cabem no tempo do circuito (até ${max}).`);
    }
  }
  if (def.format === 'TABATA' || def.format === 'EMOM') {
    const intervals =
      def.format === 'TABATA'
        ? (def.config.intervals ?? 0)
        : Math.floor((def.config.durationSeconds ?? 0) / 60);
    if ((r.intervalsCompleted ?? 0) > intervals) {
      throw new BadRequestException('Mais intervalos do que o circuito tem.');
    }
  }
  if (total !== null && r.elapsedSeconds > total + 1) {
    throw new BadRequestException('O tempo passa da duração do circuito.');
  }
  if (hasRounds) {
    const times = r.roundSeconds.length;
    const missingAll = times === 0 && opts.roundTimesOptional;
    if (times !== r.roundsCompleted && !missingAll) {
      throw new BadRequestException('Mande um tempo de round para cada round completo.');
    }
  }
  if (def.format === 'FOR_TIME' && r.finalTimeSeconds !== null) {
    const allRounds = r.roundsCompleted === (def.config.rounds ?? 0) && r.partialExercises === 0;
    // Cada tempo de round é arredondado: tolera meio segundo por round.
    const sum = r.roundSeconds.reduce((a, b) => a + b, 0);
    if (!allRounds || r.finalTimeSeconds <= 0 || r.finalTimeSeconds < sum - r.roundSeconds.length) {
      throw new BadRequestException(
        'O tempo final só vale com todos os rounds feitos, e não é menor que a soma dos rounds.',
      );
    }
  }
  const sets = hasRounds
    ? r.roundsCompleted * n + Math.min(n, r.partialExercises)
    : (r.intervalsCompleted ?? 0);
  if (sets > MAX_CIRCUIT_SETS) {
    throw new BadRequestException(`Um circuito grava até ${MAX_CIRCUIT_SETS} séries.`);
  }
}
