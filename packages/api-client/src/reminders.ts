import { apiFetch } from './http';
import type { IconTone } from './notifications';

/**
 * Lembretes pessoais (#389, pranchas Al-V2, Al-V3, Al-V3b e Al-V3c): o tipo, a
 * regra (intervalo ou horários fixos), os dias e o texto que a prancha mostra.
 * Quem envia é o servidor (`ReminderJob`), no fuso da pessoa; o aviso nunca
 * leva número nem dado de saúde.
 */

export type ReminderKind = 'WATER' | 'MEAL' | 'WEIGHT' | 'WORKOUT' | 'STEPS' | 'HABIT';
export type ReminderMode = 'INTERVAL' | 'TIMES';

/** Como a API devolve (`GET /users/me/reminders`). Horários em "hh:mm". */
export interface Reminder {
  id: string;
  kind: ReminderKind;
  habitId: string | null;
  title: string;
  mode: ReminderMode;
  everyHours: number | null;
  from: string | null;
  to: string | null;
  times: string[];
  /** ISO: 1 = segunda … 7 = domingo. */
  weekdays: number[];
  stepsBelow: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** O corpo de criação e de edição. */
export interface ReminderInput {
  kind?: ReminderKind;
  habitId?: string | null;
  mode?: ReminderMode;
  everyHours?: number;
  from?: string;
  to?: string;
  times?: string[];
  weekdays?: number[];
  stepsBelow?: number | null;
  enabled?: boolean;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const remindersApi = {
  list: () => apiFetch<Reminder[]>('/api/users/me/reminders'),
  create: (input: ReminderInput) =>
    apiFetch<Reminder>('/api/users/me/reminders', json('POST', input)),
  update: (id: string, input: ReminderInput) =>
    apiFetch<Reminder>(`/api/users/me/reminders/${encodeURIComponent(id)}`, json('PATCH', input)),
  remove: (id: string) =>
    apiFetch<{ removed: true }>(
      `/api/users/me/reminders/${encodeURIComponent(id)}`,
      json('DELETE'),
    ),
};

// --- horário ------------------------------------------------------------------

const DAY = 24 * 60;

/** 480 → "08:00". */
export function clockLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "08:00" → 480; fora do formato, `null`. */
export function clockMinute(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** "8h", "8h30" — a janela curta do resumo. */
function shortClock(hhmm: string | null): string {
  const min = hhmm ? clockMinute(hhmm) : null;
  if (min === null) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/**
 * O seletor hh:mm da folha: as horas andam de 1 em 1 e dão a volta no dia; os
 * minutos andam de 5 em 5 e dão a volta dentro da hora.
 */
export function stepClock(minute: number, dHours: number, dMinutes: number): number {
  const h = (((Math.floor(minute / 60) + dHours) % 24) + 24) % 24;
  const m = ((((minute % 60) + dMinutes) % 60) + 60) % 60;
  return (h * 60 + m) % DAY;
}

// --- dias ----------------------------------------------------------------------

/** As bolinhas da folha, de segunda a domingo. */
export const WEEKDAY_INITIALS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const;
export const WEEKDAY_NAMES = [
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo',
] as const;
const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;

type DaysLabel = { suffix: string } | { prefix: string };

function daysLabel(weekdays: number[]): DaysLabel {
  const set = [...new Set(weekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const key = set.join('');
  if (key === '1234567') return { suffix: 'todos os dias' };
  if (key === '12345') return { suffix: 'seg a sex' };
  if (key === '67') return { suffix: 'fim de semana' };
  return { prefix: set.map((d) => WEEKDAY_SHORT[d - 1]).join(', ') };
}

function thousands(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1).replace('.', ',')} mil`;
}

/**
 * A segunda linha do lembrete na lista (prancha Al-V2): "A cada 2 h · 8h–20h",
 * "12:30 · seg a sex", "Seg · 07:00", "19:00 se abaixo de 6 mil".
 */
export function reminderSummary(r: Reminder): string {
  const days = daysLabel(r.weekdays);
  const core =
    r.mode === 'INTERVAL'
      ? `A cada ${r.everyHours ?? 1} h · ${shortClock(r.from)}–${shortClock(r.to)}`
      : r.times.join(', ');
  const withSteps =
    r.kind === 'STEPS' && r.stepsBelow ? `${core} se abaixo de ${thousands(r.stepsBelow)}` : core;
  if ('prefix' in days) return `${days.prefix} · ${withSteps}`;
  // Todo dia é o normal do intervalo e da meta de passos: a prancha não diz.
  const quiet = r.mode === 'INTERVAL' || (r.kind === 'STEPS' && !!r.stepsBelow);
  if (quiet && days.suffix === 'todos os dias') return withSteps;
  return `${withSteps} · ${days.suffix}`;
}

/** "5 ativos" — o detalhe da linha em Você e o rodapé da lista. */
export function activeRemindersLabel(list: readonly Pick<Reminder, 'enabled'>[]): string {
  const n = list.filter((r) => r.enabled).length;
  return `${n} ${n === 1 ? 'ativo' : 'ativos'}`;
}

// --- visual --------------------------------------------------------------------

export interface ReminderVisual {
  icon: string;
  tone: IconTone;
}

const VISUAL: Record<ReminderKind, ReminderVisual> = {
  WATER: { icon: 'drop', tone: 'water' },
  MEAL: { icon: 'apple', tone: 'lime' },
  WEIGHT: { icon: 'scale', tone: 'neutral' },
  WORKOUT: { icon: 'dumbbell', tone: 'neutral' },
  STEPS: { icon: 'steps', tone: 'amber' },
  HABIT: { icon: 'habit', tone: 'lime' },
};

export function reminderVisual(kind: ReminderKind): ReminderVisual {
  return VISUAL[kind];
}

export interface ReminderTypeOption extends ReminderVisual {
  kind: ReminderKind;
  label: string;
}

const TYPES: ReminderTypeOption[] = [
  { kind: 'WATER', label: 'Água', ...VISUAL.WATER },
  { kind: 'MEAL', label: 'Refeição', ...VISUAL.MEAL },
  { kind: 'WEIGHT', label: 'Peso', ...VISUAL.WEIGHT },
  { kind: 'WORKOUT', label: 'Treino', ...VISUAL.WORKOUT },
  { kind: 'STEPS', label: 'Passos', ...VISUAL.STEPS },
  { kind: 'HABIT', label: 'Hábito', ...VISUAL.HABIT },
];

/**
 * Os chips de tipo da folha. "Hábito" só existe quando a pessoa tem hábitos
 * (#390) e nunca na edição (prancha Al-V3b): um lembrete salvo troca entre os
 * outros tipos, mas não vira lembrete de hábito.
 */
export function reminderTypes(opts: { habits: boolean; editing: boolean }): ReminderTypeOption[] {
  return TYPES.filter((t) => t.kind !== 'HABIT' || (opts.habits && !opts.editing));
}

// --- folha ---------------------------------------------------------------------

/** O estado da folha de lembrete, com os horários em minutos do dia. */
export interface ReminderDraft {
  kind: ReminderKind;
  habitId: string | null;
  mode: ReminderMode;
  everyHours: number;
  from: number;
  to: number;
  times: number[];
  /** Segunda a domingo. */
  weekdays: boolean[];
  stepsBelow: number | null;
}

export const EVERY_HOURS_MIN = 1;
export const EVERY_HOURS_MAX = 6;
export const TIMES_MAX = 8;
/** O horário que "+ Horário" acrescenta. */
export const NEW_TIME = 18 * 60;

/** Água, a cada 2 h, das 8h às 20h, todo dia (prancha Al-V3). */
export function newReminderDraft(): ReminderDraft {
  return {
    kind: 'WATER',
    habitId: null,
    mode: 'INTERVAL',
    everyHours: 2,
    from: 8 * 60,
    to: 20 * 60,
    times: [8 * 60, 12 * 60 + 30, 19 * 60],
    weekdays: [true, true, true, true, true, true, true],
    stepsBelow: null,
  };
}

export function draftFromReminder(r: Reminder): ReminderDraft {
  const base = newReminderDraft();
  const times = r.times.map(clockMinute).filter((m): m is number => m !== null);
  return {
    kind: r.kind,
    habitId: r.habitId,
    mode: r.mode,
    everyHours: r.everyHours ?? base.everyHours,
    from: (r.from === null ? null : clockMinute(r.from)) ?? base.from,
    to: (r.to === null ? null : clockMinute(r.to)) ?? base.to,
    times: times.length ? times : base.times,
    weekdays: [1, 2, 3, 4, 5, 6, 7].map((d) => r.weekdays.includes(d)),
    stepsBelow: r.stepsBelow,
  };
}

/** Quantos avisos a regra dá num dia. */
export function reminderPerDay(d: ReminderDraft): number {
  if (d.mode === 'TIMES') return new Set(d.times).size;
  if (d.to <= d.from) return 1;
  return Math.floor((d.to - d.from) / (d.everyHours * 60)) + 1;
}

/** O texto do botão: "Salvar · 7 avisos por dia, 7 dias". */
export function reminderCta(d: ReminderDraft, editing: boolean): string {
  const n = reminderPerDay(d);
  const dias = d.weekdays.filter(Boolean).length;
  const verbo = editing ? 'Salvar alterações' : 'Salvar';
  return `${verbo} · ${n} ${n === 1 ? 'aviso' : 'avisos'} por dia, ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** O corpo da API, só com os campos do modo escolhido. */
export function draftToInput(d: ReminderDraft): ReminderInput {
  const weekdays = d.weekdays.flatMap((on, i) => (on ? [i + 1] : []));
  const input: ReminderInput = { kind: d.kind, mode: d.mode };
  if (d.kind === 'HABIT') input.habitId = d.habitId;
  if (d.mode === 'INTERVAL') {
    input.everyHours = d.everyHours;
    input.from = clockLabel(d.from);
    input.to = clockLabel(d.to);
  } else {
    input.times = [...new Set(d.times)].sort((a, b) => a - b).map(clockLabel);
  }
  input.weekdays = weekdays;
  if (d.kind === 'STEPS' && d.stepsBelow) input.stepsBelow = d.stepsBelow;
  return input;
}
