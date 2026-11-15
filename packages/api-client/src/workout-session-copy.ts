import { ApiError } from './http';
import { formatDecimal } from './format';
import { kgToLoad, loadUnitLabel, type LoadUnit } from './units';
import { bodyTones, musclesOfGroups, type MuscleTone } from './workout-cards';
import type {
  RestedMuscle,
  StrengthMuscleGroup,
  SummaryBestSet,
  TrainingWeek,
  WorkoutPlan,
  WorkoutSessionSummary,
} from './workout';

/**
 * Textos e contas da aba Treino do redesign (#377): início (Al-T1), sessão
 * (Al-T3), treino feito (Al-T5/T5b) e Como fazer (Al-T9). Iguais na web e no
 * app; as telas só desenham.
 */

export interface FeelingOption {
  /** 1 Leve … 5 No limite. */
  level: number;
  emoji: string;
  label: string;
  /** Repetições que sobravam. */
  hint: string;
}

/** A escala de 5 do canvas: a mesma pergunta do RPE (6 a 10). */
export const FEELINGS: readonly FeelingOption[] = [
  { level: 1, emoji: '😎', label: 'Leve', hint: 'sobravam 4 ou mais' },
  { level: 2, emoji: '🙂', label: 'Firme', hint: 'sobravam 3' },
  { level: 3, emoji: '😐', label: 'Puxado', hint: 'sobravam 2' },
  { level: 4, emoji: '😣', label: 'Muito puxado', hint: 'sobrava 1' },
  { level: 5, emoji: '🥵', label: 'No limite', hint: 'não sobrava nada' },
];

export function feelingOf(level: number | null | undefined): FeelingOption | null {
  if (level == null) return null;
  return FEELINGS[Math.round(level) - 1] ?? null;
}

/** 1 → RPE 6 … 5 → RPE 10: a sensação da série grava no `rpe`. */
export function feelingToRpe(level: number): number {
  return Math.min(10, Math.max(6, Math.round(level) + 5));
}

export function rpeToFeeling(rpe: number | null | undefined): number | null {
  if (rpe == null || Number.isNaN(rpe)) return null;
  return Math.min(5, Math.max(1, Math.round(rpe) - 5));
}

// ------------------------------------------------------------------ início

/** "3 de 4 treinos" (com meta) ou só o total. */
export function trainingWeekLabel(week: TrainingWeek): string {
  if (week.target) return `${week.done} de ${week.target} treinos`;
  if (week.done === 0) return 'nenhum treino ainda';
  return `${week.done} ${week.done === 1 ? 'treino' : 'treinos'}`;
}

/** As letras da faixa da semana, de segunda a domingo. */
export const WEEKDAY_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const;

/** O dia do mês de uma data YYYY-MM-DD. */
export function dayOfMonth(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

const STRENGTH_GROUPS: readonly StrengthMuscleGroup[] = [
  'peito',
  'costas',
  'pernas',
  'ombro',
  'braço',
  'core',
];

/**
 * Cada músculo do diagrama anatômico (chaves `data-muscle`) no tom do
 * descanso do grupo dele: o "Seus músculos hoje" pinta o `MuscleDiagram`.
 */
export function musclesByRestTone(rested: readonly RestedMuscle[]): Record<string, MuscleTone> {
  const tones = bodyTones(rested);
  const out: Record<string, MuscleTone> = {};
  for (const group of STRENGTH_GROUPS) {
    for (const muscle of musclesOfGroups([group])) out[muscle] = tones[group];
  }
  return out;
}

/** "4 exercícios · 12 séries · ~31 min" (2,6 min por série, como o canvas). */
export function planCardInfo(plan: Pick<WorkoutPlan, 'exercises'>): string {
  const exercises = plan.exercises?.length ?? 0;
  const sets = (plan.exercises ?? []).reduce((acc, e) => acc + (e.targetSets ?? 0), 0);
  const parts = [
    `${exercises} ${exercises === 1 ? 'exercício' : 'exercícios'}`,
    `${sets} ${sets === 1 ? 'série' : 'séries'}`,
  ];
  if (sets > 0) parts.push(`~${Math.round(sets * 2.6)} min`);
  return parts.join(' · ');
}

/** A barra de músculos do cartão do plano: a fração das séries de cada grupo. */
export function planMuscleBars(
  plan: Pick<WorkoutPlan, 'exercises'>,
): { group: string; share: number }[] {
  const totals = new Map<string, number>();
  let all = 0;
  for (const e of plan.exercises ?? []) {
    const group = e.exercise?.muscleGroup ?? 'outro';
    totals.set(group, (totals.get(group) ?? 0) + (e.targetSets ?? 0));
    all += e.targetSets ?? 0;
  }
  if (all === 0) return [];
  return [...totals.entries()].map(([group, sets]) => ({ group, share: sets / all }));
}

// ------------------------------------------------------------------ sessão

/** O id da sessão aberta que o 409 do início devolve (#350/#377). */
export function activeSessionIdFromError(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.body as { activeSessionId?: unknown } | null | undefined;
  return typeof body?.activeSessionId === 'string' ? body.activeSessionId : null;
}

/**
 * A chave de um toque em "Concluir série": o reenvio (duplo toque, rede que
 * cai e volta) devolve a série já gravada em vez de criar outra.
 */
export function newSetClientKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** A miniatura do vídeo do YouTube, para o app (sem player embutido). */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

/** Quanto tempo a URL assinada do vídeo vale (10 min); a tela renova antes. */
export const SIGNED_VIDEO_REFRESH_MS = 9 * 60 * 1000;

// ------------------------------------------------------------- treino feito

const MINUS = '−';

/** 52.5 → "52,5"; 80 → "80" (o canvas não mostra ",0"). */
function trimDecimal(n: number): string {
  return formatDecimal(n, 1).replace(/,0$/, '');
}

function signed(n: number, suffix = ''): string {
  if (n > 0) return `+${formatDecimal(n, 0)}${suffix}`;
  if (n < 0) return `${MINUS}${formatDecimal(Math.abs(n), 0)}${suffix}`;
  return `0${suffix}`;
}

/**
 * "52,5 × 10", "15 reps", "2,4 km · 15 min · 138 bpm". A carga sai na unidade
 * da pessoa; carga 0 é peso do corpo, como no resumo da API.
 */
export function formatBestSet(
  best: SummaryBestSet | null | undefined,
  unit: LoadUnit = 'KG',
): string {
  if (!best) return '—';
  if (best.distanceMeters != null || best.durationSeconds != null) {
    const parts: string[] = [];
    if (best.distanceMeters) parts.push(`${trimDecimal(best.distanceMeters / 1000)} km`);
    if (best.durationSeconds) parts.push(`${Math.round(best.durationSeconds / 60)} min`);
    if (best.avgHeartRate) parts.push(`${best.avgHeartRate} bpm`);
    return parts.join(' · ') || '—';
  }
  if (best.weightKg) return `${trimDecimal(kgToLoad(best.weightKg, unit))} × ${best.reps ?? 0}`;
  return `${best.reps ?? 0} reps`;
}

/** O volume: em toneladas a partir de 1 t, como no canvas; em libras, "mil lb". */
export function formatTrainingVolume(kg: number, unit: LoadUnit = 'KG'): string {
  const value = kgToLoad(kg, unit);
  const label = loadUnitLabel(unit);
  if (value >= 1000)
    return unit === 'LB'
      ? `${formatDecimal(value / 1000, 1)} mil lb`
      : `${formatDecimal(value / 1000, 1)} t`;
  return `${formatDecimal(value, 0)} ${label}`;
}

/** Os quatro números do topo do "Treino feito!". */
export function summaryFacts(
  s: Pick<WorkoutSessionSummary, 'durationMinutes' | 'sets' | 'volumeKg' | 'overallFeeling'>,
  unit: LoadUnit = 'KG',
): { value: string; label: string }[] {
  return [
    { value: s.durationMinutes == null ? '—' : `${s.durationMinutes}′`, label: 'duração' },
    { value: String(s.sets), label: 'séries' },
    { value: formatTrainingVolume(s.volumeKg, unit), label: 'volume' },
    { value: feelingOf(s.overallFeeling)?.emoji ?? '—', label: 'no geral' },
  ];
}

/** "Push · hoje 18:02–18:54", no fuso do aparelho. */
export function summaryHeadline(
  s: Pick<WorkoutSessionSummary, 'planName' | 'startedAt' | 'completedAt'>,
  now: Date = new Date(),
): string {
  const start = new Date(s.startedAt);
  const hm = (d: Date) =>
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = start.toDateString() === now.toDateString();
  const day = sameDay
    ? 'hoje'
    : start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  const range = s.completedAt ? `${hm(start)}–${hm(new Date(s.completedAt))}` : hm(start);
  return [s.planName ?? 'Treino livre', `${day} ${range}`].join(' · ');
}

export type Trend = 'up' | 'down' | 'flat';

/** "Comparado ao último Push": volume, séries e duração com sinal. */
export function comparisonFacts(
  c: NonNullable<WorkoutSessionSummary['comparison']>,
): { label: string; value: string; tone: Trend }[] {
  const tone = (n: number | null): Trend => (n == null || n === 0 ? 'flat' : n > 0 ? 'up' : 'down');
  const arrow = (n: number) => (n > 0 ? ' ▲' : n < 0 ? ' ▼' : '');
  return [
    {
      label: 'volume',
      value:
        c.volumeDeltaPct == null
          ? '—'
          : `${signed(c.volumeDeltaPct, '%')}${arrow(c.volumeDeltaPct)}`,
      tone: tone(c.volumeDeltaPct),
    },
    { label: 'séries', value: signed(c.setsDelta), tone: tone(c.setsDelta) },
    {
      label: 'duração',
      value: c.durationDeltaMinutes == null ? '—' : signed(c.durationDeltaMinutes, ' min'),
      tone: tone(c.durationDeltaMinutes),
    },
  ];
}

export function recordsTitle(count: number): string {
  return count === 1 ? '1 recorde novo' : `${count} recordes novos`;
}

/** Os atalhos da observação do fim (prancha Al-T5): só preenchem o texto. */
export const NOTE_SHORTCUTS = ['Leve', 'Puxado', 'Dor no joelho', 'Dor na lombar', 'Subir carga'];

export function noteShortcutsFor(note: string): string[] {
  const lower = note.toLowerCase();
  return NOTE_SHORTCUTS.filter((q) => !lower.includes(q.toLowerCase()));
}

/**
 * O corpo do "Salvar" do "Como foi o treino?": só o que mudou. Desmarcar a
 * sensação manda `null` e apagar a observação manda `''` — os dois apagam o
 * que estava gravado; sem mudança, nada.
 */
export function howItWentBody(
  saved: { feeling: number | null; notes: string | null },
  current: { feeling: number | null; notes: string },
): { feeling?: number | null; notes?: string } {
  const body: { feeling?: number | null; notes?: string } = {};
  if (current.feeling !== saved.feeling) body.feeling = current.feeling;
  const notes = current.notes.trim();
  if (notes !== (saved.notes ?? '')) body.notes = notes;
  return body;
}

export function appendNoteShortcut(note: string, label: string): string {
  const piece = label.toLowerCase();
  return note.trim() ? `${note.trim()}, ${piece}` : piece;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Perguntas da Helena" (uma pessoa) ou "Perguntas da equipe". */
export function questionsTitle(askedBy: readonly string[]): string {
  return askedBy.length === 1 ? `Perguntas da ${firstName(askedBy[0]!)}` : 'Perguntas da equipe';
}

/** "Só a Helena vê as respostas": quem de fato lê (Treino liberado). */
export function questionsAudience(askedBy: readonly string[]): string {
  const names = askedBy.map(firstName);
  if (names.length === 1) return `Só a ${names[0]} vê as respostas`;
  const joined =
    names.length === 2
      ? `${names[0]} e ${names[1]}`
      : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
  return `Só ${joined} veem as respostas`;
}

export function checkinDoneMessage(skipped: boolean, askedBy: readonly string[]): string {
  const who = askedBy.length === 1 ? `a ${firstName(askedBy[0]!)}` : 'a equipe';
  return skipped
    ? `Perguntas puladas · ${who} vê só que você pulou`
    : `Respostas enviadas para ${who}`;
}
