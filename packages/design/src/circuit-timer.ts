/**
 * O relógio dos circuitos (#380): AMRAP, EMOM, Tabata e For Time.
 *
 * Tudo sai de horários, nunca de tiques contados: o circuito é o começo
 * (`startedAt`) mais a lista de toques com horário (`events`), e o estado é
 * recalculado do zero para qualquer `now`. O `setInterval` só pede um novo
 * desenho. Assim o app volta certo do segundo plano e da tela bloqueada (o JS
 * parado não atrasa nada), e outra aba ou aparelho retoma do mesmo ponto com
 * os mesmos eventos.
 *
 * "Linha do tempo" é o relógio do circuito: o tempo ativo (sem as pausas) mais
 * o que "Pular fase" / "Próximo minuto" adiantou.
 */

export type CircuitFormat = 'AMRAP' | 'EMOM' | 'TABATA' | 'FOR_TIME';

export interface CircuitConfigInput {
  durationSeconds?: number | null;
  workSeconds?: number | null;
  restSeconds?: number | null;
  intervals?: number | null;
  rounds?: number | null;
  restBetweenRoundsSeconds?: number | null;
}

export interface CircuitItem {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  /** Reps ou segundos por round (ou por minuto, no EMOM). */
  unit: 'REPS' | 'SECONDS';
  target: number;
}

/** O circuito como a sessão o congela no começo. */
export interface CircuitDefinition {
  format: CircuitFormat;
  name: string;
  config: CircuitConfigInput;
  exercises: CircuitItem[];
}

export type CircuitEventType = 'mark' | 'round' | 'unround' | 'skip' | 'pause' | 'resume' | 'end';

/**
 * Um toque, com o horário (ms desde a época).
 * - `mark`: terminou o exercício da vez (AMRAP e For Time);
 * - `round` / `unround`: "+1 round" e "−" do AMRAP;
 * - `skip`: "Pular fase" (Tabata), "Próximo minuto" (EMOM), "Pular descanso" (For Time);
 * - `pause` / `resume`; `end`: "Encerrar".
 */
export interface CircuitEvent {
  type: CircuitEventType;
  at: number;
}

export interface CircuitRun {
  /** Quando o relógio começou (ms). */
  startedAt: number;
  events: CircuitEvent[];
}

/** Teto de toques guardados por circuito (o servidor confere o mesmo). */
export const MAX_CIRCUIT_EVENTS = 2000;

export type CircuitStatus = 'running' | 'paused' | 'done';
export type CircuitDoneReason = 'time' | 'rounds' | 'ended';

export interface CircuitPhase {
  kind: 'work' | 'rest';
  /** Intervalo (Tabata) ou minuto (EMOM), a partir de 0. */
  index: number;
  count: number;
  /** O exercício desta fase; nulo no descanso. */
  exerciseIndex: number | null;
  remainingSeconds: number;
  durationSeconds: number;
  next: { kind: 'work' | 'rest'; exerciseIndex: number | null } | null;
}

export interface CircuitState {
  format: CircuitFormat;
  status: CircuitStatus;
  doneReason: CircuitDoneReason | null;
  /**
   * O número grande da tela: o que resta (AMRAP), o tempo que sobe (For Time)
   * ou o que resta da fase (Tabata e EMOM).
   */
  clockSeconds: number;
  /** Tempo do circuito até agora (ou até o fim). */
  elapsedSeconds: number;
  /** Duração total, quando o formato tem (AMRAP, EMOM, Tabata). */
  totalSeconds: number | null;
  roundsCompleted: number;
  /** O exercício da vez no round (AMRAP e For Time). */
  exerciseIndex: number;
  /** Tempo de cada round completo. */
  roundSeconds: number[];
  /** Tempo do round em curso. */
  currentRoundSeconds: number;
  phase: CircuitPhase | null;
  /** Descanso entre rounds do For Time. */
  rest: { remainingSeconds: number } | null;
  finalTimeSeconds: number | null;
  /** Segundos até a próxima troca, para a contagem de 3, 2, 1. */
  countdownSeconds: number | null;
  /** Minutos (EMOM) ou intervalos (Tabata) que terminaram. */
  intervalsCompleted: number | null;
  /** Linha do tempo agora, para converter em horário de alarme. */
  timeline: number;
}

interface Segment {
  start: number;
  end: number;
  kind: 'work' | 'rest';
  index: number;
  exerciseIndex: number | null;
}

const positive = (n: number | null | undefined, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : fallback;

/** Fases de Tabata e EMOM, em segundos da linha do tempo. */
export function circuitSegments(def: CircuitDefinition): Segment[] {
  const n = Math.max(1, def.exercises.length);
  const segments: Segment[] = [];
  if (def.format === 'TABATA') {
    const work = positive(def.config.workSeconds, 20);
    const rest = Math.max(0, def.config.restSeconds ?? 10);
    const intervals = positive(def.config.intervals, 8);
    let t = 0;
    for (let i = 0; i < intervals; i++) {
      segments.push({ start: t, end: t + work, kind: 'work', index: i, exerciseIndex: i % n });
      t += work;
      if (rest > 0) {
        segments.push({ start: t, end: t + rest, kind: 'rest', index: i, exerciseIndex: null });
        t += rest;
      }
    }
  } else if (def.format === 'EMOM') {
    const total = positive(def.config.durationSeconds, 600);
    for (let i = 0, t = 0; t < total; i++, t += 60) {
      segments.push({
        start: t,
        end: Math.min(total, t + 60),
        kind: 'work',
        index: i,
        exerciseIndex: i % n,
      });
    }
  }
  return segments;
}

function totalOf(def: CircuitDefinition, segments: Segment[]): number | null {
  if (def.format === 'AMRAP') return positive(def.config.durationSeconds, 720);
  if (def.format === 'FOR_TIME') return null;
  return segments.at(-1)?.end ?? 0;
}

interface Simulation {
  done: boolean;
  doneReason: CircuitDoneReason | null;
  endTimeline: number | null;
  paused: boolean;
  timelineNow: number;
  rounds: { start: number; end: number }[];
  roundStart: number;
  index: number;
  restEnd: number | null;
  finalTime: number | null;
}

function simulate(def: CircuitDefinition, run: CircuitRun, now: number): Simulation {
  const segments = circuitSegments(def);
  const total = totalOf(def, segments);
  const len = def.exercises.length;
  const roundsTarget = positive(def.config.rounds, 1);
  const restBetween = Math.max(0, def.config.restBetweenRoundsSeconds ?? 0);

  let pausedSince: number | null = null;
  let pausedMs = 0;
  let offset = 0;
  const timeline = (t: number) => {
    const stopped = pausedSince !== null ? Math.max(0, t - pausedSince) : 0;
    return Math.max(0, (t - run.startedAt - pausedMs - stopped) / 1000) + offset;
  };

  const sim: Simulation = {
    done: false,
    doneReason: null,
    endTimeline: null,
    paused: false,
    timelineNow: 0,
    rounds: [],
    roundStart: 0,
    index: 0,
    restEnd: null,
    finalTime: null,
  };
  const finish = (reason: CircuitDoneReason, tl: number) => {
    sim.done = true;
    sim.doneReason = reason;
    sim.endTimeline = tl;
  };
  const resting = (tl: number) => sim.restEnd !== null && tl < sim.restEnd;
  const completeRound = (tl: number) => {
    sim.rounds.push({ start: sim.roundStart, end: tl });
    sim.index = 0;
    sim.roundStart = tl;
  };

  // A ordem dos toques é a do horário; o `sort` estável mantém a do envio no empate.
  const events = [...run.events].sort((a, b) => a.at - b.at);
  for (const ev of events) {
    const tl = timeline(ev.at);
    if (total !== null && tl >= total) {
      finish('time', total);
      break;
    }
    // O descanso do For Time que terminou sozinho: o round seguinte começa no fim dele.
    if (sim.restEnd !== null && tl >= sim.restEnd) {
      sim.roundStart = sim.restEnd;
      sim.restEnd = null;
    }
    if (ev.type === 'pause') {
      if (pausedSince === null) pausedSince = ev.at;
    } else if (ev.type === 'resume') {
      if (pausedSince !== null) {
        pausedMs += ev.at - pausedSince;
        pausedSince = null;
      }
    } else if (ev.type === 'end') {
      finish('ended', tl);
      break;
    } else if (ev.type === 'mark') {
      if ((def.format !== 'AMRAP' && def.format !== 'FOR_TIME') || len === 0) continue;
      if (resting(tl)) continue;
      sim.index += 1;
      if (sim.index < len) continue;
      completeRound(tl);
      if (def.format === 'FOR_TIME') {
        if (sim.rounds.length >= roundsTarget) {
          sim.finalTime = tl;
          finish('rounds', tl);
          break;
        }
        if (restBetween > 0) sim.restEnd = tl + restBetween;
      }
    } else if (ev.type === 'round') {
      if (def.format === 'AMRAP') completeRound(tl);
    } else if (ev.type === 'unround') {
      if (def.format === 'AMRAP') {
        const last = sim.rounds.pop();
        if (last) sim.roundStart = last.start;
      }
    } else if (ev.type === 'skip') {
      if (def.format === 'FOR_TIME') {
        if (resting(tl)) {
          sim.roundStart = tl;
          sim.restEnd = null;
        }
      } else if (def.format === 'EMOM' || def.format === 'TABATA') {
        const seg = segments.find((s) => tl >= s.start && tl < s.end);
        if (seg) offset += seg.end - tl;
        if (total !== null && seg && seg.end >= total) {
          finish('time', total);
          break;
        }
      }
    }
  }

  sim.paused = pausedSince !== null;
  if (!sim.done) {
    const tl = timeline(now);
    if (total !== null && tl >= total) finish('time', total);
    else if (sim.restEnd !== null && tl >= sim.restEnd) {
      sim.roundStart = sim.restEnd;
      sim.restEnd = null;
    }
    sim.timelineNow = sim.done ? total! : tl;
  } else {
    sim.timelineNow = sim.endTimeline!;
  }
  return sim;
}

export function circuitState(def: CircuitDefinition, run: CircuitRun, now: number): CircuitState {
  const segments = circuitSegments(def);
  const total = totalOf(def, segments);
  const sim = simulate(def, run, now);
  const tl = sim.timelineNow;

  let phase: CircuitPhase | null = null;
  let intervalsCompleted: number | null = null;
  if (def.format === 'EMOM' || def.format === 'TABATA') {
    const work = segments.filter((s) => s.kind === 'work');
    intervalsCompleted = work.filter((s) => s.end <= tl).length;
    const i = segments.findIndex((s) => tl >= s.start && tl < s.end);
    if (i >= 0 && !sim.done) {
      const seg = segments[i];
      const next = segments[i + 1];
      phase = {
        kind: seg.kind,
        index: seg.index,
        count: work.length,
        exerciseIndex: seg.exerciseIndex,
        remainingSeconds: Math.ceil(seg.end - tl - 1e-9),
        durationSeconds: seg.end - seg.start,
        next: next ? { kind: next.kind, exerciseIndex: next.exerciseIndex } : null,
      };
    }
  }

  const rest =
    !sim.done && sim.restEnd !== null
      ? { remainingSeconds: Math.ceil(sim.restEnd - tl - 1e-9) }
      : null;

  let clockSeconds: number;
  if (def.format === 'AMRAP') clockSeconds = Math.max(0, Math.ceil(total! - tl - 1e-9));
  else if (def.format === 'FOR_TIME') clockSeconds = Math.floor(sim.finalTime ?? tl);
  else clockSeconds = phase?.remainingSeconds ?? 0;

  let countdownSeconds: number | null = null;
  if (!sim.done) {
    if (phase) countdownSeconds = phase.remainingSeconds;
    else if (def.format === 'AMRAP') countdownSeconds = clockSeconds;
    else if (rest) countdownSeconds = rest.remainingSeconds;
  }

  return {
    format: def.format,
    status: sim.done ? 'done' : sim.paused ? 'paused' : 'running',
    doneReason: sim.doneReason,
    clockSeconds,
    elapsedSeconds: Math.floor(tl),
    totalSeconds: total,
    roundsCompleted: sim.rounds.length,
    exerciseIndex: sim.index,
    roundSeconds: sim.rounds.map((r) => Math.round(r.end - r.start)),
    currentRoundSeconds: Math.max(0, Math.floor(tl - sim.roundStart)),
    phase,
    rest,
    finalTimeSeconds: sim.finalTime === null ? null : Math.round(sim.finalTime),
    countdownSeconds,
    intervalsCompleted,
    timeline: tl,
  };
}

export interface CircuitExerciseTotal {
  exerciseId: number;
  /** Quantas vezes o exercício foi feito (uma série por round ou intervalo). */
  sets: number;
  reps: number;
  seconds: number;
}

/** O que "Encerrar" manda para a API e o que o "Treino feito" mostra. */
export interface CircuitResult {
  roundsCompleted: number;
  /** Exercícios feitos no round que não fechou. */
  partialExercises: number;
  roundSeconds: number[];
  /** Tempo do round que não fechou; nulo quando não houve. */
  partialRoundSeconds: number | null;
  elapsedSeconds: number;
  /** For Time terminado: o tempo do último round. */
  finalTimeSeconds: number | null;
  /** Minutos (EMOM) ou intervalos (Tabata) que terminaram. */
  intervalsCompleted: number | null;
  /** Chegou ao fim (tempo, rounds ou intervalos), e não foi encerrado antes. */
  completed: boolean;
  totalReps: number;
  exercises: CircuitExerciseTotal[];
}

/**
 * Quantas vezes cada exercício foi feito, pelo formato. A API grava uma série
 * (`SessionSet`) por vez, com estas mesmas contas (`circuit-sets.ts`).
 */
export function circuitTotals(
  def: CircuitDefinition,
  counts: { roundsCompleted: number; partialExercises: number; intervalsCompleted: number | null },
): CircuitExerciseTotal[] {
  const totals = def.exercises.map((e) => ({
    exerciseId: e.exerciseId,
    sets: 0,
    reps: 0,
    seconds: 0,
  }));
  const add = (i: number, reps: number, seconds: number) => {
    const t = totals[i];
    if (!t) return;
    t.sets += 1;
    t.reps += reps;
    t.seconds += seconds;
  };
  const byTarget = (i: number) => {
    const e = def.exercises[i];
    if (e) add(i, e.unit === 'REPS' ? e.target : 0, e.unit === 'SECONDS' ? e.target : 0);
  };
  const n = def.exercises.length;
  if (n === 0) return [];
  if (def.format === 'AMRAP' || def.format === 'FOR_TIME') {
    for (let r = 0; r < counts.roundsCompleted; r++) for (let i = 0; i < n; i++) byTarget(i);
    for (let i = 0; i < Math.min(n, counts.partialExercises); i++) byTarget(i);
  } else if (def.format === 'EMOM') {
    for (let m = 0; m < (counts.intervalsCompleted ?? 0); m++) byTarget(m % n);
  } else {
    const work = positive(def.config.workSeconds, 20);
    for (let k = 0; k < (counts.intervalsCompleted ?? 0); k++) add(k % n, 0, work);
  }
  // Exercício repetido no circuito soma na mesma linha.
  const merged = new Map<number, CircuitExerciseTotal>();
  for (const t of totals) {
    const m = merged.get(t.exerciseId);
    if (m) {
      m.sets += t.sets;
      m.reps += t.reps;
      m.seconds += t.seconds;
    } else merged.set(t.exerciseId, { ...t });
  }
  return [...merged.values()];
}

export function circuitResult(def: CircuitDefinition, run: CircuitRun, now: number): CircuitResult {
  const state = circuitState(def, run, now);
  const hasRounds = def.format === 'AMRAP' || def.format === 'FOR_TIME';
  const partialExercises = hasRounds && state.finalTimeSeconds === null ? state.exerciseIndex : 0;
  const partialRoundSeconds =
    hasRounds && state.finalTimeSeconds === null && state.currentRoundSeconds > 0
      ? state.currentRoundSeconds
      : null;
  const counts = {
    roundsCompleted: state.roundsCompleted,
    partialExercises,
    intervalsCompleted: state.intervalsCompleted,
  };
  const exercises = circuitTotals(def, counts);
  return {
    ...counts,
    roundSeconds: state.roundSeconds,
    partialRoundSeconds,
    elapsedSeconds: state.elapsedSeconds,
    finalTimeSeconds: state.finalTimeSeconds,
    completed: state.status === 'done' && state.doneReason !== 'ended',
    totalReps: exercises.reduce((sum, e) => sum + e.reps, 0),
    exercises,
  };
}

export type CircuitCue = 'phase' | 'countdown' | 'done';

/** O que tocar (som e vibração) entre dois desenhos seguidos da tela. */
export function circuitCue(prev: CircuitState, next: CircuitState): CircuitCue | null {
  if (prev.status !== 'done' && next.status === 'done') return 'done';
  if (next.status !== 'running') return null;
  const key = (s: CircuitState) =>
    s.phase ? `${s.phase.kind}:${s.phase.index}` : s.rest ? `rest:${s.roundsCompleted}` : 'go';
  if (key(prev) !== key(next)) return 'phase';
  const c = next.countdownSeconds;
  if (c !== null && c >= 1 && c <= 3 && c !== prev.countdownSeconds) return 'countdown';
  return null;
}

export interface CircuitAlarm {
  /** Horário (ms). */
  at: number;
  kind: 'work' | 'rest' | 'done';
  exerciseIndex: number | null;
  /** Intervalo (Tabata) ou minuto (EMOM) desta troca, a partir de 0; nulo no fim e no For Time. */
  index: number | null;
}

/**
 * As trocas que ainda vão acontecer, em horário de relógio, para o app
 * agendar avisos do sistema: com a tela bloqueada, o JS para e o som da tela
 * não toca. Pausado ou terminado, nada a agendar.
 */
export function circuitAlarms(
  def: CircuitDefinition,
  run: CircuitRun,
  now: number,
  limit = 40,
): CircuitAlarm[] {
  const state = circuitState(def, run, now);
  if (state.status !== 'running') return [];
  const wall = (tl: number) => Math.round(now + (tl - state.timeline) * 1000);
  const out: CircuitAlarm[] = [];
  if (def.format === 'EMOM' || def.format === 'TABATA') {
    const segments = circuitSegments(def);
    const last = segments.at(-1);
    for (const seg of segments) {
      if (seg.start <= state.timeline) continue;
      out.push({
        at: wall(seg.start),
        kind: seg.kind,
        exerciseIndex: seg.exerciseIndex,
        index: seg.index,
      });
    }
    if (last) out.push({ at: wall(last.end), kind: 'done', exerciseIndex: null, index: null });
  } else if (def.format === 'AMRAP' && state.totalSeconds !== null) {
    out.push({ at: wall(state.totalSeconds), kind: 'done', exerciseIndex: null, index: null });
  } else if (def.format === 'FOR_TIME' && state.rest) {
    out.push({
      at: wall(state.timeline + state.rest.remainingSeconds),
      kind: 'work',
      exerciseIndex: 0,
      index: null,
    });
  }
  if (out.length <= limit) return out;
  // Com teto (o iOS guarda 64 avisos por app), o fim nunca sai: as trocas
  // mais distantes é que ficam para o próximo agendamento.
  const done = out.at(-1)?.kind === 'done' ? out.at(-1)! : null;
  return done ? [...out.slice(0, Math.max(0, limit - 1)), done] : out.slice(0, limit);
}
