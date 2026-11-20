import { apiFetch } from './http';
import type { PlanOfferStatus, PlanSchedule } from './plan-offers';
import type {
  CardioIntensity,
  CardioTargetKind,
  PlanLoadMode,
  PlanRepUnit,
  PlanSetKind,
  PlanTechnique,
} from './workout';

/**
 * O editor de plano de treino da equipe (#406, pranchas Pn-09 a Pn-09e). Tipos
 * espelham `plan-document.ts` e `PlanCopyService` da API; o texto da tela e as
 * conferências antes de salvar moram aqui para o painel e o app dizerem a
 * mesma coisa.
 */

// ---------------------------------------------------------------------------
// Tipos

export type PlanCircuitFormat = 'AMRAP' | 'EMOM' | 'TABATA' | 'FOR_TIME' | 'ROUNDS';

/** A prescrição de um exercício do plano. Sem `order`: a ordem é a posição. */
export interface PlanPrescription {
  targetSets: number;
  /** "8", "6-8" (faixa), "MAX". */
  targetReps: string;
  repUnit?: PlanRepUnit;
  loadMode?: PlanLoadMode;
  startLoadKg?: number;
  loadPercent?: number;
  restSeconds?: number;
  technique?: PlanTechnique;
  biSetWithNext?: boolean;
  notes?: string;
  warmupBefore?: boolean;
  cardioTarget?: CardioTargetKind;
  cardioDurationSeconds?: number;
  cardioDistanceMeters?: number;
  cardioIntensity?: CardioIntensity;
  cardioCalories?: number;
  cardioInclinePercent?: number;
  cardioZone?: number;
  cardioPaceSecondsPerKm?: number;
  cardioRpe?: number;
  sets?: Array<{ kind: PlanSetKind; reps: number; loadKg?: number }>;
}

/** O exercício que viaja por valor (do autor, ou o da comunidade na cópia). */
export interface CustomExerciseDefinition {
  name: string;
  muscleGroup: string;
  equipment?: string;
  level?: string;
  mechanic?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  youtubeVideoId?: string;
  youtubeVideoIdPt?: string;
}

/** Exercício do documento: pelo id da biblioteca ou pela definição, um dos dois. */
export interface PlanDocExerciseInput extends PlanPrescription {
  type: 'exercise';
  exerciseId?: number | null;
  custom?: CustomExerciseDefinition;
}

export interface PlanDocCircuitInput {
  type: 'circuit';
  name?: string;
  format: PlanCircuitFormat;
  durationSeconds?: number;
  workSeconds?: number;
  restSeconds?: number;
  intervals?: number;
  rounds?: number;
  restBetweenRoundsSeconds?: number;
  timeCapSeconds?: number;
  exercises: PlanDocExerciseInput[];
}

export interface PlanDocSessionInput {
  name: string;
  /** Dia da semana ISO (1 = segunda); nulo no rodízio. */
  weekday?: number | null;
  items: Array<PlanDocExerciseInput | PlanDocCircuitInput>;
}

export interface PlanDocumentInput {
  sessions: PlanDocSessionInput[];
}

/** O exercício como a tela lê: o documento com nome, grupo e guia. */
export interface DocumentExerciseView extends PlanDocExerciseInput {
  exerciseId: number | null;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  isCardio: boolean;
  hasGuide: boolean;
}

export interface DocumentCircuitView extends Omit<PlanDocCircuitInput, 'exercises'> {
  exercises: DocumentExerciseView[];
}

export type DocumentItemView = DocumentExerciseView | DocumentCircuitView;

export interface PlanDocumentView {
  sessions: Array<{ name: string; weekday: number | null; items: DocumentItemView[] }>;
}

/** A cópia de um aluno no editor (Pn-09e). */
export interface PlanCopy {
  offerId: string;
  membershipId: string;
  studentName: string;
  title: string;
  authorName: string | null;
  /** "Ver original": o modelo da biblioteca de onde a cópia saiu. */
  template: { id: string; title: string } | null;
  version: { id: string; version: number; status: PlanOfferStatus };
  /** Há uma versão nova esperando o aceite da pessoa. */
  pendingUpdate: boolean;
  schedule: PlanSchedule;
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
  weekdays: number[];
  document: PlanDocumentView | null;
  progress: { done: number; planned: number | null };
  /** A última série da pessoa por exercício ("última da Ana: 62,5 kg × 8"). */
  lastSets: Record<string, { weightKg: number | null; reps: number | null }>;
}

export interface SavePlanCopyInput {
  document: PlanDocumentInput;
  title?: string;
  changeNote?: string;
  /** "Avisar a Ana no app". Padrão: avisa. */
  notify?: boolean;
}

const member = (groupId: string, membershipId: string) =>
  `/api/groups/${groupId}/members/${membershipId}`;

/** A cópia do aluno pela ficha (#406): ler e salvar (versão nova). */
export const planCopyApi = {
  get: (groupId: string, membershipId: string, offerId: string) =>
    apiFetch<PlanCopy>(`${member(groupId, membershipId)}/plan-offers/${offerId}/copy`),
  save: (groupId: string, membershipId: string, offerId: string, input: SavePlanCopyInput) =>
    apiFetch<{ offerId: string; versionId: string; version: number }>(
      `${member(groupId, membershipId)}/plan-offers/${offerId}/copy`,
      { method: 'PUT', body: JSON.stringify(input) },
    ),
};

// ---------------------------------------------------------------------------
// Limites (os da API)

export const MAX_PLAN_SESSIONS = 14;
export const MAX_SESSION_NAME = 60;
export const MAX_PLAN_TAGS = 8;
export const MAX_TAG_LENGTH = 30;

// ---------------------------------------------------------------------------
// Texto e conferências

export const CIRCUIT_FORMAT_LABEL: Record<PlanCircuitFormat, string> = {
  AMRAP: 'AMRAP',
  EMOM: 'EMOM',
  TABATA: 'Tabata',
  FOR_TIME: 'For Time',
  ROUNDS: 'Rounds',
};

/** A explicação curta de cada formato, embaixo do seletor (Pn-09c). */
export const CIRCUIT_FORMAT_HINT: Record<PlanCircuitFormat, string> = {
  AMRAP: 'O máximo de rounds no tempo.',
  EMOM: 'Um bloco a cada minuto.',
  TABATA: 'Trabalho e descanso em intervalos.',
  FOR_TIME: 'Os rounds no menor tempo.',
  ROUNDS: 'Rounds com descanso entre eles; 2 ou 3 exercícios fazem um bi/tri-set.',
};

export const isCircuit = (item: { type: string }): item is DocumentCircuitView =>
  item.type === 'circuit';

const decimal = (n: number) => String(n).replace('.', ',');
const minutes = (s: number) =>
  s % 60 ? `${decimal(Math.round((s / 60) * 10) / 10)} min` : `${s / 60} min`;

/** 0 → "A", 1 → "B". */
export function sessionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** "A · Pernas", ou só "A" sem nome. */
export function sessionLabel(index: number, name: string): string {
  const n = name.trim();
  return n ? `${sessionLetter(index)} · ${n}` : sessionLetter(index);
}

const CIRCUIT_DEFAULTS: Record<PlanCircuitFormat, Partial<PlanDocCircuitInput>> = {
  AMRAP: { durationSeconds: 720 },
  EMOM: { durationSeconds: 600 },
  TABATA: { workSeconds: 20, restSeconds: 10, intervals: 8 },
  FOR_TIME: { rounds: 3 },
  ROUNDS: { rounds: 3, restBetweenRoundsSeconds: 60 },
};

/** Os campos que cada formato exige (os da API). */
export const CIRCUIT_REQUIRED: Record<PlanCircuitFormat, Array<keyof PlanDocCircuitInput>> = {
  AMRAP: ['durationSeconds'],
  EMOM: ['durationSeconds'],
  TABATA: ['workSeconds', 'restSeconds', 'intervals'],
  FOR_TIME: ['rounds'],
  ROUNDS: ['rounds'],
};

const FIELD_NAME: Partial<Record<keyof PlanDocCircuitInput, string>> = {
  durationSeconds: 'a duração',
  workSeconds: 'o tempo de trabalho',
  restSeconds: 'o descanso',
  intervals: 'os intervalos',
  rounds: 'os rounds',
};

/** Um bloco novo com os padrões de cada formato. */
export function newCircuitBlock(
  format: PlanCircuitFormat,
  exercises: DocumentExerciseView[] = [],
): DocumentCircuitView {
  return { type: 'circuit', format, ...CIRCUIT_DEFAULTS[format], exercises };
}

/** "AMRAP · 12 min", "Tabata · 8 × 20 s / 10 s", "3 rounds · descanso 60 s". */
export function circuitSummary(block: Omit<PlanDocCircuitInput, 'exercises'>): string {
  const label = CIRCUIT_FORMAT_LABEL[block.format];
  switch (block.format) {
    case 'AMRAP':
    case 'EMOM':
      return block.durationSeconds ? `${label} · ${minutes(block.durationSeconds)}` : label;
    case 'TABATA':
      return `${label} · ${block.intervals ?? '?'} × ${block.workSeconds ?? '?'} s / ${block.restSeconds ?? '?'} s`;
    case 'FOR_TIME': {
      const parts = [label, `${block.rounds ?? '?'} rounds`];
      if (block.timeCapSeconds) parts.push(`limite ${minutes(block.timeCapSeconds)}`);
      return parts.join(' · ');
    }
    case 'ROUNDS': {
      const parts = [`${block.rounds ?? '?'} rounds`];
      if (block.restBetweenRoundsSeconds)
        parts.push(`descanso ${block.restBetweenRoundsSeconds} s`);
      return parts.join(' · ');
    }
  }
}

/** O que falta no bloco para salvar, em português; nulo se está pronto. */
export function circuitProblem(block: PlanDocCircuitInput | DocumentCircuitView): string | null {
  if (block.exercises.length === 0) return 'Adicione um exercício ao circuito.';
  const label = CIRCUIT_FORMAT_LABEL[block.format];
  for (const f of CIRCUIT_REQUIRED[block.format]) {
    if (block[f] === undefined || block[f] === null) return `Diga ${FIELD_NAME[f]} do ${label}.`;
  }
  if (block.format === 'EMOM' && block.durationSeconds && block.durationSeconds % 60 !== 0) {
    return 'O EMOM dura minutos inteiros.';
  }
  return null;
}

/** 330 → "5:30/km". */
export function paceText(secondsPerKm: number): string {
  return `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, '0')}/km`;
}

function repsText(e: PlanPrescription): string {
  if (e.repUnit === 'MAX') return 'máx.';
  if (e.repUnit === 'SECONDS') return `${e.targetReps} s`;
  if (e.repUnit === 'METERS') return `${e.targetReps} m`;
  return e.targetReps;
}

function loadText(e: PlanPrescription): string | null {
  switch (e.loadMode) {
    case 'PERCENT_1RM':
      return e.loadPercent ? `${e.loadPercent}% 1RM` : '% 1RM';
    case 'BODYWEIGHT':
      return e.startLoadKg ? `peso do corpo + ${decimal(e.startLoadKg)} kg` : 'peso do corpo';
    case 'BAND':
      return 'elástico';
    default:
      return e.startLoadKg ? `${decimal(e.startLoadKg)} kg` : null;
  }
}

/** A linha do exercício na tabela: "4 × 6-8 · 75% 1RM · 90 s", "30 min · zona 2 · 6%". */
export function exerciseLine(e: PlanPrescription & { isCardio?: boolean }): string {
  const parts: string[] = [];
  const cardio = e.isCardio || e.cardioTarget !== undefined;
  if (cardio) {
    if (e.cardioTarget === 'TIME' && e.cardioDurationSeconds)
      parts.push(minutes(e.cardioDurationSeconds));
    if (e.cardioTarget === 'DISTANCE' && e.cardioDistanceMeters) {
      parts.push(
        e.cardioDistanceMeters >= 1000
          ? `${decimal(e.cardioDistanceMeters / 1000)} km`
          : `${e.cardioDistanceMeters} m`,
      );
    }
    if (e.cardioTarget === 'CALORIES' && e.cardioCalories) parts.push(`${e.cardioCalories} kcal`);
    if (e.cardioZone) parts.push(`zona ${e.cardioZone}`);
    if (e.cardioPaceSecondsPerKm) parts.push(paceText(e.cardioPaceSecondsPerKm));
    if (e.cardioRpe) parts.push(`esforço ${e.cardioRpe}`);
    if (e.cardioInclinePercent) parts.push(`${decimal(e.cardioInclinePercent)}%`);
    return parts.join(' · ') || 'cardio livre';
  }
  parts.push(`${e.targetSets} × ${repsText(e)}`);
  const load = loadText(e);
  if (load) parts.push(load);
  if (e.restSeconds !== undefined) parts.push(`${e.restSeconds} s`);
  const line = parts.join(' · ');
  return e.warmupBefore ? `aquec. + ${line}` : line;
}

type AnyItem = PlanDocExerciseInput | PlanDocCircuitInput | DocumentItemView;
type AnySession = { name: string; weekday?: number | null; items: AnyItem[] };

const exercisesOf = (items: AnyItem[]): Array<PlanDocExerciseInput & { name?: string }> =>
  items.flatMap((i) => (i.type === 'circuit' ? i.exercises : [i]));

/** O que impede salvar o documento; vazio quando pode. */
export function documentProblems(doc: PlanDocumentInput | PlanDocumentView): string[] {
  const problems: string[] = [];
  const sessions = doc.sessions as AnySession[];
  if (sessions.length === 0) problems.push('Adicione uma sessão.');
  if (sessions.length > MAX_PLAN_SESSIONS) {
    problems.push(`Um plano tem até ${MAX_PLAN_SESSIONS} sessões.`);
  }
  const days = sessions.flatMap((s) => (s.weekday ? [s.weekday] : []));
  if (new Set(days).size !== days.length) problems.push('Duas sessões no mesmo dia da semana.');
  sessions.forEach((s, i) => {
    const label = sessionLabel(i, s.name);
    const letter = sessionLetter(i);
    if (s.items.length === 0) {
      problems.push(
        `A sessão ${s.name.trim() ? `${letter} (${s.name.trim()})` : letter} está vazia.`,
      );
      return;
    }
    const seen = new Set<string>();
    for (const e of exercisesOf(s.items)) {
      const key = e.exerciseId != null ? `id:${e.exerciseId}` : `custom:${e.custom?.name ?? ''}`;
      if (seen.has(key)) {
        problems.push(
          `${e.name ?? e.custom?.name ?? 'Um exercício'} aparece duas vezes na sessão ${letter}.`,
        );
      }
      seen.add(key);
    }
    for (const item of s.items) {
      if (item.type !== 'circuit') continue;
      const p = circuitProblem(item);
      if (p) problems.push(`${label}: ${p}`);
    }
  });
  return problems;
}

/** Os dias das sessões, em ordem, quando todas têm dia; nulo no rodízio. */
export function documentWeekdays(doc: PlanDocumentInput | PlanDocumentView): number[] | null {
  const days = doc.sessions.map((s) => s.weekday ?? null);
  if (days.length === 0 || days.some((d) => d === null)) return null;
  return (days as number[]).sort((a, b) => a - b);
}

/** Arrastar (ou "subir/descer", a alternativa acessível): nova lista, sem mexer na original. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item!);
  return out;
}

function exerciseInput(e: DocumentExerciseView | PlanDocExerciseInput): PlanDocExerciseInput {
  const {
    name: _name,
    muscleGroup: _muscleGroup,
    equipment: _equipment,
    isCardio: _isCardio,
    hasGuide: _hasGuide,
    ...rest
  } = e as DocumentExerciseView;
  void [_name, _muscleGroup, _equipment, _isCardio, _hasGuide];
  // Pelo id ou pela definição: nunca os dois (a API recusa).
  if (rest.exerciseId != null) delete rest.custom;
  else delete (rest as { exerciseId?: unknown }).exerciseId;
  return rest;
}

/** O documento como a API recebe: sem nome, grupo e guia, que são só da tela. */
export function toDocumentInput(view: PlanDocumentView): PlanDocumentInput {
  return {
    sessions: view.sessions.map((s) => ({
      name: s.name,
      weekday: s.weekday,
      items: s.items.map((i) =>
        isCircuit(i) ? { ...i, exercises: i.exercises.map(exerciseInput) } : exerciseInput(i),
      ),
    })),
  };
}

/** "última da Ana: 62,5 kg × 8"; nulo sem série com carga. */
export function lastSetHint(
  studentName: string,
  last: { weightKg: number | null; reps: number | null } | undefined,
): string | null {
  if (!last || last.weightKg === null) return null;
  const first = studentName.trim().split(/\s+/)[0] || studentName;
  const reps = last.reps !== null ? ` × ${last.reps}` : '';
  return `última da ${first}: ${decimal(last.weightKg)} kg${reps}`;
}

/** Etiquetas como a API guarda: minúsculas, sem repetir, até 8. */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const v = t.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, MAX_PLAN_TAGS);
}
