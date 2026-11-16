import type { CircuitSnapshot } from '../active-workout-bar';
import { formatDecimal } from '../format';
import type {
  CircuitFinishInput,
  CircuitInput,
  CircuitPrevious,
  CircuitSummary,
  WorkoutPlan,
} from '../workout';
import {
  circuitResult,
  circuitState,
  type CircuitDefinition,
  type CircuitExerciseTotal,
  type CircuitFormat,
  type CircuitItem,
  type CircuitRun,
  type CircuitState,
} from './circuit-timer';

/**
 * Textos e contas de tela dos circuitos (#380), os mesmos na web e no app:
 * Novo circuito (Al-T22), as telas do relógio (Al-T4, T4b, T4c, T4d, T4e), a
 * aba Circuitos (Al-T6) e o circuito no "Treino feito".
 */

/** Os quatro cartões de formato do Al-T22, com o texto da prancha. */
export const CIRCUIT_FORMAT_OPTIONS: ReadonlyArray<{
  format: CircuitFormat;
  title: string;
  subtitle: string;
}> = [
  { format: 'AMRAP', title: 'AMRAP', subtitle: 'máximo de rounds no tempo' },
  { format: 'EMOM', title: 'EMOM', subtitle: 'uma tarefa a cada minuto' },
  { format: 'TABATA', title: 'Tabata', subtitle: 'trabalho e descanso em intervalos' },
  { format: 'FOR_TIME', title: 'Rounds', subtitle: 'N rounds, conta o tempo' },
];

/** Os passos do −/+ da prancha; os números também são digitáveis. */
export const CIRCUIT_STEPS = {
  minutes: { min: 1, max: 120, step: 1 },
  workSeconds: { min: 5, max: 600, step: 5 },
  restSeconds: { min: 0, max: 600, step: 5 },
  intervals: { min: 1, max: 60, step: 1 },
  rounds: { min: 1, max: 100, step: 1 },
  restBetweenRounds: { min: 0, max: 900, step: 15 },
  reps: { min: 1, max: 600, step: 1 },
  seconds: { min: 5, max: 600, step: 5 },
} as const;

/** O alvo de quem troca entre reps e tempo (prancha: 10 reps, 30 s). */
export const CIRCUIT_UNIT_DEFAULT = { REPS: 10, SECONDS: 30 } as const;

export type CircuitDraftItem = CircuitItem;

/** O formulário do Novo circuito. Os campos de todos os formatos ficam, e só os do escolhido vão. */
export interface CircuitDraft {
  name: string;
  /** A pessoa mexeu no nome: trocar de formato não o substitui mais. */
  nameTouched: boolean;
  format: CircuitFormat;
  minutes: number;
  workSeconds: number;
  restSeconds: number;
  intervals: number;
  rounds: number;
  restBetweenRounds: number;
  exercises: CircuitDraftItem[];
}

export function newCircuitDraft(): CircuitDraft {
  return {
    name: 'AMRAP 12',
    nameTouched: false,
    format: 'AMRAP',
    minutes: 12,
    workSeconds: 20,
    restSeconds: 10,
    intervals: 8,
    rounds: 5,
    restBetweenRounds: 60,
    exercises: [],
  };
}

/** O nome que acompanha o formato enquanto a pessoa não escreve o dela (prancha). */
export function defaultCircuitName(d: Pick<CircuitDraft, 'format' | 'minutes' | 'rounds'>): string {
  if (d.format === 'AMRAP') return `AMRAP ${d.minutes}`;
  if (d.format === 'EMOM') return `EMOM ${d.minutes}`;
  if (d.format === 'TABATA') return 'Tabata';
  return `${d.rounds} rounds`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Duração curta, sem zero à esquerda: "2:28", "14:34", "1:02:10". O relógio
 * da tela que corre usa `formatClock` ("08:42"), como nas pranchas.
 */
export function formatShortClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "4" e "2,5": uma casa só quando precisa. */
const decimal = (n: number) => (Number.isInteger(n) ? String(n) : formatDecimal(n));

/** A linha de resumo do Al-T22, embaixo dos campos do formato. */
export function circuitDraftSummary(d: CircuitDraft): string {
  const n = plural(d.exercises.length, 'exercício', 'exercícios');
  if (d.format === 'FOR_TIME') {
    return `${plural(d.rounds, 'round', 'rounds')} · ${n} · descanso de ${d.restBetweenRounds} s entre rounds`;
  }
  if (d.format === 'TABATA') {
    const total = Math.round((((d.workSeconds + d.restSeconds) * d.intervals) / 60) * 10) / 10;
    return `${d.intervals} × ${d.workSeconds} s / ${d.restSeconds} s · ${decimal(total)} min no total`;
  }
  return `${d.minutes} min · ${n}${d.format === 'EMOM' ? ' · um por minuto, em rodízio' : ''}`;
}

export function circuitDraftErrors(d: CircuitDraft): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push('Dê um nome ao circuito.');
  if (d.exercises.length === 0) out.push('Adicione pelo menos um exercício.');
  return out;
}

/** O corpo de `POST/PUT /workout/circuits`, só com os campos do formato. */
export function circuitDraftToInput(d: CircuitDraft): CircuitInput {
  const fields =
    d.format === 'AMRAP' || d.format === 'EMOM'
      ? { durationSeconds: d.minutes * 60 }
      : d.format === 'TABATA'
        ? { workSeconds: d.workSeconds, restSeconds: d.restSeconds, intervals: d.intervals }
        : { rounds: d.rounds, restBetweenRoundsSeconds: d.restBetweenRounds };
  return {
    name: d.name.trim(),
    format: d.format,
    ...fields,
    exercises: d.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      unit: e.unit,
      target: e.target,
    })),
  };
}

const firstNumber = (text: string) => {
  const nums = (text.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0);
  return nums.length ? Math.max(...nums) : 1;
};

/** O circuito salvo de volta no formulário (editar). */
export function draftFromCircuitPlan(plan: WorkoutPlan): CircuitDraft {
  const base = newCircuitDraft();
  const c = plan.circuit;
  return {
    ...base,
    name: plan.name,
    nameTouched: true,
    format: c?.format ?? 'AMRAP',
    minutes: c?.durationSeconds ? Math.round(c.durationSeconds / 60) : base.minutes,
    workSeconds: c?.workSeconds ?? base.workSeconds,
    restSeconds: c?.restSeconds ?? base.restSeconds,
    intervals: c?.intervals ?? base.intervals,
    rounds: c?.rounds ?? base.rounds,
    restBetweenRounds: c?.restBetweenRoundsSeconds ?? base.restBetweenRounds,
    exercises: [...plan.exercises]
      .sort((a, b) => a.order - b.order)
      .map((pe) => ({
        exerciseId: pe.exerciseId,
        name: pe.exercise.name,
        muscleGroup: pe.exercise.muscleGroup,
        unit: pe.repUnit ?? 'REPS',
        target: firstNumber(pe.targetReps),
      })),
  };
}

/** O selo colorido de cada formato (Al-T6 e topo do relógio): `bdg pro | trial | com`. */
export function circuitBadge(format: CircuitFormat): {
  label: string;
  tone: 'pro' | 'trial' | 'com';
} {
  if (format === 'TABATA') return { label: 'Tabata', tone: 'trial' };
  if (format === 'EMOM') return { label: 'EMOM', tone: 'com' };
  if (format === 'FOR_TIME') return { label: 'For Time', tone: 'pro' };
  return { label: 'AMRAP', tone: 'pro' };
}

const minutesOf = (seconds: number | null | undefined) => Math.round((seconds ?? 0) / 60);

/** O selo do topo das telas do relógio: "AMRAP 12", "EMOM 10", "For Time · 5 rounds". */
export function circuitHeader(def: Pick<CircuitDefinition, 'format' | 'config' | 'name'>): string {
  const c = def.config;
  if (def.format === 'AMRAP') return `AMRAP ${minutesOf(c.durationSeconds)}`;
  if (def.format === 'EMOM') return `EMOM ${minutesOf(c.durationSeconds)}`;
  if (def.format === 'FOR_TIME') return `For Time · ${plural(c.rounds ?? 0, 'round', 'rounds')}`;
  return def.name.toLowerCase().startsWith('tabata') ? def.name : `Tabata · ${def.name}`;
}

/** O valor à direita do exercício: "15" ou "30 s". */
export function circuitItemValue(item: Pick<CircuitItem, 'unit' | 'target'>): string {
  return item.unit === 'SECONDS' ? `${item.target} s` : String(item.target);
}

/** O "agora": "Burpee × 10", "Prancha × 30 s". */
export function circuitNowLabel(item: Pick<CircuitItem, 'name' | 'unit' | 'target'>): string {
  return `${item.name} × ${circuitItemValue(item)}`;
}

/** O resumo do card na aba Circuitos (Al-T6). */
export function circuitPlanSummary(plan: Pick<WorkoutPlan, 'circuit' | 'exercises'>): string {
  const c = plan.circuit;
  const n = plural(plan.exercises.length, 'exercício', 'exercícios');
  if (!c) return n;
  if (c.format === 'AMRAP') return `máximo de rounds em ${minutesOf(c.durationSeconds)} min · ${n}`;
  if (c.format === 'EMOM') return `a cada minuto, ${minutesOf(c.durationSeconds)} min · ${n}`;
  if (c.format === 'TABATA')
    return `${c.intervals} × ${c.workSeconds} s / ${c.restSeconds} s · ${n}`;
  const rest = c.restBetweenRoundsSeconds ? ` · ${c.restBetweenRoundsSeconds} s entre rounds` : '';
  return `${plural(c.rounds ?? 0, 'round', 'rounds')} · ${n}${rest}`;
}

/** "Kettlebell, burpee e prancha": a lista em minúsculas, com "e" no fim. */
function joinNames(names: string[]): string {
  const low = names.map((n) => n.toLowerCase());
  if (low.length <= 1) return low.join('');
  return `${low.slice(0, -1).join(', ')} e ${low.at(-1)}`;
}

/** A linha do estado concluído das telas do relógio (Al-T4b, T4d, T4e). */
export function circuitDoneLine(
  def: CircuitDefinition,
  r: {
    intervalsCompleted: number | null;
    elapsedSeconds: number;
    roundsCompleted: number;
    totals: CircuitExerciseTotal[];
  },
): string {
  const minutes = decimal(Math.round((r.elapsedSeconds / 60) * 10) / 10);
  if (def.format === 'TABATA') {
    return `${plural(r.intervalsCompleted ?? 0, 'intervalo', 'intervalos')} · ${minutes} min`;
  }
  if (def.format === 'EMOM') {
    const parts = def.exercises
      .map((e) => {
        const t = r.totals.find((x) => x.exerciseId === e.exerciseId);
        if (!t || t.sets === 0) return null;
        return e.unit === 'SECONDS'
          ? `${formatShortClock(t.seconds)} de ${e.name.toLowerCase()}`
          : `${t.reps} ${e.name.toLowerCase()}`;
      })
      .filter((x): x is string => x !== null);
    const list =
      parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`;
    return `${plural(r.intervalsCompleted ?? 0, 'minuto', 'minutos')}${list ? ` · ${list}` : ''}`;
  }
  return `${plural(r.roundsCompleted, 'round', 'rounds')} · ${joinNames(def.exercises.map((e) => e.name))}`;
}

/** O circuito na barra "treino em andamento" (Al-T-Cards-treino). */
export function circuitBarSnapshot(def: CircuitDefinition, s: CircuitState): CircuitSnapshot {
  if (def.format === 'AMRAP') {
    return {
      kind: 'amrap',
      name: def.name,
      rounds: s.roundsCompleted,
      remainingSeconds: s.clockSeconds,
    };
  }
  if (def.format === 'FOR_TIME') {
    return {
      kind: 'intervals',
      name: def.name,
      round: Math.min(def.config.rounds ?? 1, s.roundsCompleted + 1),
      totalRounds: def.config.rounds ?? 1,
      remainingSeconds: s.clockSeconds,
    };
  }
  return {
    kind: 'intervals',
    name: def.name,
    round: (s.phase?.index ?? s.intervalsCompleted ?? 0) + 1,
    totalRounds: s.phase?.count ?? s.intervalsCompleted ?? 0,
    remainingSeconds: s.clockSeconds,
  };
}

/** Os números do topo do circuito no "Treino feito" e no Al-T11c. */
export function circuitResultFacts(c: CircuitSummary): Array<{ value: string; label: string }> {
  const avg = {
    value: c.averageRoundSeconds ? formatShortClock(c.averageRoundSeconds) : '—',
    label: 'média/round',
  };
  if (c.format === 'FOR_TIME') {
    return [
      c.finalTimeSeconds !== null
        ? { value: formatShortClock(c.finalTimeSeconds), label: 'tempo final' }
        : { value: formatShortClock(c.elapsedSeconds), label: 'tempo' },
      {
        value: c.partialExercises
          ? `${c.roundsCompleted} + ${c.partialExercises}`
          : String(c.roundsCompleted),
        label: c.partialExercises ? 'rounds + exerc.' : 'rounds',
      },
      avg,
    ];
  }
  if (c.format === 'AMRAP') {
    return [
      { value: `${c.roundsCompleted} + ${c.partialExercises}`, label: 'rounds + exerc.' },
      { value: `${minutesOf(c.elapsedSeconds)}′`, label: 'duração' },
      avg,
    ];
  }
  return [
    {
      value: `${c.intervalsCompleted ?? 0}/${c.intervalsTotal ?? c.intervalsCompleted ?? 0}`,
      label: c.format === 'EMOM' ? 'minutos' : 'intervalos',
    },
    { value: `${minutesOf(c.elapsedSeconds)}′`, label: 'duração' },
    { value: String(c.totalReps), label: 'reps no total' },
  ];
}

/** O selo "melhor que a última vez" (Al-T4e) e o "+1 round" (Al-T11c). */
export function circuitComparisonLabel(
  c: Pick<CircuitSummary, 'format' | 'comparison'>,
): { text: string; tone: 'ok' | 'neutral' } | null {
  const cmp = c.comparison;
  if (!cmp) return null;
  if (c.format === 'FOR_TIME' && cmp.previousFinalTimeSeconds !== null) {
    const prev = formatShortClock(cmp.previousFinalTimeSeconds);
    if (cmp.verdict === 'better') return { text: `melhor que a última vez · ${prev}`, tone: 'ok' };
    if (cmp.verdict === 'same') return { text: `igual à última vez · ${prev}`, tone: 'neutral' };
    return { text: `a última vez · ${prev}`, tone: 'neutral' };
  }
  if (c.format === 'AMRAP' && cmp.roundsDelta) {
    const d = cmp.roundsDelta;
    const text = `${d > 0 ? '+' : ''}${d} ${Math.abs(d) === 1 ? 'round' : 'rounds'} vs. a última vez`;
    return { text, tone: d > 0 ? 'ok' : 'neutral' };
  }
  if (cmp.verdict === 'better') return { text: 'melhor que a última vez', tone: 'ok' };
  if (cmp.verdict === 'same') return { text: 'igual à última vez', tone: 'neutral' };
  return { text: 'abaixo da última vez', tone: 'neutral' };
}

/**
 * O selo do fim na tela do relógio, antes de salvar (Al-T4e): For Time compara
 * o tempo final, AMRAP os rounds. Os outros formatos não têm selo ali.
 */
export function circuitLiveComparison(
  format: CircuitFormat,
  r: { roundsCompleted: number; partialExercises: number; finalTimeSeconds: number | null },
  previous: CircuitPrevious | null | undefined,
): { text: string; tone: 'ok' | 'neutral' } | null {
  if (!previous) return null;
  if (format === 'FOR_TIME') {
    if (r.finalTimeSeconds === null || previous.finalTimeSeconds === null) return null;
    const d = r.finalTimeSeconds - previous.finalTimeSeconds;
    return circuitComparisonLabel({
      format,
      comparison: {
        verdict: d < 0 ? 'better' : d === 0 ? 'same' : 'worse',
        roundsDelta: 0,
        finalTimeDeltaSeconds: d,
        intervalsDelta: null,
        repsDelta: 0,
        previousFinalTimeSeconds: previous.finalTimeSeconds,
      },
    });
  }
  if (format !== 'AMRAP') return null;
  const roundsDelta = r.roundsCompleted - previous.roundsCompleted;
  if (!roundsDelta) return null;
  return circuitComparisonLabel({
    format,
    comparison: {
      verdict: roundsDelta > 0 ? 'better' : 'worse',
      roundsDelta,
      finalTimeDeltaSeconds: null,
      intervalsDelta: null,
      repsDelta: 0,
      previousFinalTimeSeconds: null,
    },
  });
}

/** "round 5 · 2:07*": as linhas do "Tempo de cada round" (Al-T11c), com o parcial marcado. */
export function circuitRoundRows(
  c: Pick<CircuitSummary, 'roundSeconds' | 'partialRoundSeconds' | 'finalTimeSeconds'>,
): Array<{ label: string; value: string; seconds: number; partial: boolean }> {
  const rows = c.roundSeconds.map((s, i) => ({
    label: `round ${i + 1}`,
    value: formatShortClock(s),
    seconds: s,
    partial: false,
  }));
  if (c.partialRoundSeconds && c.finalTimeSeconds === null) {
    rows.push({
      label: `round ${rows.length + 1}`,
      value: `${formatShortClock(c.partialRoundSeconds)}*`,
      seconds: c.partialRoundSeconds,
      partial: true,
    });
  }
  return rows;
}

/** O total de um exercício no fim: "67 reps" ou "2:00". */
export function circuitExerciseTotal(e: {
  unit: 'REPS' | 'SECONDS';
  reps: number;
  seconds: number;
}) {
  return e.unit === 'SECONDS' ? formatShortClock(e.seconds) : `${e.reps} reps`;
}

/**
 * O corpo do "Encerrar" e do "Salvar treino": os toques (com um "end" agora,
 * quando o relógio ainda corria) e o resultado só com os campos que a API
 * aceita; os totais por exercício o servidor recalcula.
 */
export function circuitFinishBody(
  def: CircuitDefinition,
  run: CircuitRun,
  now: number,
): CircuitFinishInput {
  const events =
    circuitState(def, run, now).status === 'done'
      ? run.events
      : [...run.events, { type: 'end' as const, at: now }];
  const r = circuitResult(def, { ...run, events }, now);
  return {
    events,
    result: {
      roundsCompleted: r.roundsCompleted,
      partialExercises: r.partialExercises,
      roundSeconds: r.roundSeconds,
      partialRoundSeconds: r.partialRoundSeconds,
      elapsedSeconds: r.elapsedSeconds,
      finalTimeSeconds: r.finalTimeSeconds,
      intervalsCompleted: r.intervalsCompleted,
      completed: r.completed,
    },
  };
}

export type CircuitDot = 'done' | 'work' | 'rest' | 'todo';

export interface CircuitIntervalsView {
  /** "TRABALHE", "DESCANSE", "MINUTO 4 DE 10" ou "PAUSADO". */
  phaseLabel: string;
  tone: 'work' | 'rest';
  /** O número gigante: o que resta da fase. */
  seconds: number;
  now: string;
  next: string;
  dots: CircuitDot[];
  foot: string;
}

/** A tela de intervalos, a mesma para Tabata (Al-T4b) e EMOM (Al-T4d). */
export function circuitIntervalsView(
  def: CircuitDefinition,
  s: CircuitState,
): CircuitIntervalsView {
  const phase = s.phase;
  const emom = def.format === 'EMOM';
  const count = phase?.count ?? s.intervalsCompleted ?? 0;
  const index = phase?.index ?? count;
  const tone = phase?.kind === 'rest' ? 'rest' : 'work';
  const exercise = (i: number | null | undefined) =>
    i === null || i === undefined ? undefined : def.exercises[i];
  const current = exercise(phase?.exerciseIndex);

  let phaseLabel = emom
    ? `MINUTO ${index + 1} DE ${count}`
    : tone === 'work'
      ? 'TRABALHE'
      : 'DESCANSE';
  if (s.status === 'paused') phaseLabel = 'PAUSADO';

  let now = '';
  if (phase) {
    if (tone === 'rest') now = 'Respira';
    else if (current) now = emom ? circuitNowLabel(current) : current.name;
  }

  let next = 'fim';
  if (phase?.next) {
    const nextExercise = exercise(phase.next.exerciseIndex);
    if (phase.next.kind === 'rest') next = 'descanso';
    else if (nextExercise)
      next = emom ? `minuto ${index + 2} · ${nextExercise.name}` : nextExercise.name;
  }

  const dots = Array.from({ length: count }, (_, k): CircuitDot => {
    if (k < index) return 'done';
    if (k === index && phase) return tone;
    return s.status === 'done' ? 'done' : 'todo';
  });

  const foot = emom
    ? 'Faça as repetições no começo do minuto e descanse o que sobrar'
    : `intervalo ${Math.min(count, index + 1)} de ${count} · ${def.config.workSeconds ?? 0} s trabalho / ${def.config.restSeconds ?? 0} s descanso`;

  return { phaseLabel, tone, seconds: phase?.remainingSeconds ?? 0, now, next, dots, foot };
}

export interface CircuitRoundsView {
  /** "Burpee × 10", ou "Descanso" entre rounds do For Time. */
  now: string;
  items: Array<{ name: string; value: string; status: 'done' | 'current' | 'todo' }>;
  /** Descanso entre rounds do For Time: o que resta e o que vem. */
  resting: { seconds: number; next: string } | null;
}

/** A lista do AMRAP (Al-T4) e do For Time (Al-T4c): feitos, o da vez e os que faltam. */
export function circuitRoundsView(def: CircuitDefinition, s: CircuitState): CircuitRoundsView {
  const items = def.exercises.map((e, i) => ({
    name: e.name,
    value: circuitItemValue(e),
    status: (i < s.exerciseIndex ? 'done' : i === s.exerciseIndex ? 'current' : 'todo') as
      'done' | 'current' | 'todo',
  }));
  const current = def.exercises[s.exerciseIndex];
  const first = def.exercises[0];
  if (s.rest) {
    return {
      now: 'Descanso',
      items,
      resting: { seconds: s.rest.remainingSeconds, next: first ? circuitNowLabel(first) : '' },
    };
  }
  return { now: current ? circuitNowLabel(current) : '', items, resting: null };
}
