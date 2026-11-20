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

const TODO = (): never => {
  throw new Error('não implementado (#406)');
};

export const CIRCUIT_FORMAT_LABEL: Record<PlanCircuitFormat, string> = {
  AMRAP: 'AMRAP',
  EMOM: 'EMOM',
  TABATA: 'Tabata',
  FOR_TIME: 'For Time',
  ROUNDS: 'Rounds',
};

export const isCircuit = (item: { type: string }): item is DocumentCircuitView =>
  item.type === 'circuit';

/** 0 → "A", 1 → "B". */
export function sessionLetter(index: number): string {
  void index;
  return TODO();
}

/** "A · Pernas", ou só "A" sem nome. */
export function sessionLabel(index: number, name: string): string {
  void index;
  void name;
  return TODO();
}

/** Um bloco novo com os padrões de cada formato. */
export function newCircuitBlock(
  format: PlanCircuitFormat,
  exercises: DocumentExerciseView[] = [],
): DocumentCircuitView {
  void format;
  void exercises;
  return TODO();
}

/** "AMRAP · 12 min", "Tabata · 8 × 20 s / 10 s", "3 rounds · descanso 60 s". */
export function circuitSummary(block: Omit<PlanDocCircuitInput, 'exercises'>): string {
  void block;
  return TODO();
}

/** O que falta no bloco para salvar, em português; nulo se está pronto. */
export function circuitProblem(block: PlanDocCircuitInput | DocumentCircuitView): string | null {
  void block;
  return TODO();
}

/** 330 → "5:30/km". */
export function paceText(secondsPerKm: number): string {
  void secondsPerKm;
  return TODO();
}

/** A linha do exercício na tabela: "4 × 6-8 · 75% 1RM · 90 s", "30 min · zona 2 · 6%". */
export function exerciseLine(e: PlanPrescription & { isCardio?: boolean }): string {
  void e;
  return TODO();
}

/** O que impede salvar o documento; vazio quando pode. */
export function documentProblems(doc: PlanDocumentInput | PlanDocumentView): string[] {
  void doc;
  return TODO();
}

/** Os dias das sessões, em ordem, quando todas têm dia; nulo no rodízio. */
export function documentWeekdays(doc: PlanDocumentInput | PlanDocumentView): number[] | null {
  void doc;
  return TODO();
}

/** Arrastar (ou "subir/descer", a alternativa acessível): nova lista, sem mexer na original. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  void list;
  void from;
  void to;
  return TODO();
}

/** O documento como a API recebe: sem nome, grupo e guia, que são só da tela. */
export function toDocumentInput(view: PlanDocumentView): PlanDocumentInput {
  void view;
  return TODO();
}

/** "última da Ana: 62,5 kg × 8"; nulo sem série com carga. */
export function lastSetHint(
  studentName: string,
  last: { weightKg: number | null; reps: number | null } | undefined,
): string | null {
  void studentName;
  void last;
  return TODO();
}

/** Etiquetas como a API guarda: minúsculas, sem repetir, até 8. */
export function normalizeTags(tags: readonly string[]): string[] {
  void tags;
  return TODO();
}
