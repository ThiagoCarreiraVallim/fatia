import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ExerciseGroup, SessionSet } from '@fatia/api-client';

/**
 * Contas e formatação da sessão de treino, fora dos componentes.
 *
 * Ficam aqui porque são a única parte da tela testável sem aparelho: o harness
 * roda em Node e não renderiza React Native (`vitest.config.ts`). Cronômetro,
 * leitura do que a pessoa digitou e o resumo do volume são justamente onde um
 * erro passa despercebido no meio do treino.
 *
 * Nada de `toLocaleString`: o Hermes de parte dos Androids não tem ICU completo
 * e cai silenciosamente para o formato americano — o mesmo motivo de
 * `src/components/charts/format.ts`.
 */

/** `1:05` / `1:02:03`. Segundos negativos aparecem com sinal, não zerados. */
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '0:00';
  const rounded = Math.trunc(totalSeconds);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;
  if (hours > 0) {
    return `${sign}${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** `mm:ss`, sempre com dois dígitos nos minutos — usado no descanso. */
export function formatCountdown(totalSeconds: number): string {
  const abs = Math.max(0, Math.trunc(totalSeconds));
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** `90` → 90s, `1:30` → 90s, `1:02:03` → 3723s. `null` quando não dá para ler. */
export function parseClock(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map((part) => part.trim());
  if (parts.some((part) => part !== '' && !/^\d+$/.test(part))) return null;

  if (parts.length === 1) {
    const seconds = Number(parts[0]);
    return Number.isFinite(seconds) ? seconds : null;
  }
  if (parts.length === 2) {
    const minutes = Number(parts[0] || 0);
    const seconds = Number(parts[1] || 0);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return null;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const hours = Number(parts[0] || 0);
    const minutes = Number(parts[1] || 0);
    const seconds = Number(parts[2] || 0);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      return null;
    }
    if (minutes >= 60 || seconds >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return null;
}

/**
 * Aceita vírgula e ponto. O teclado decimal do iOS em pt-BR entrega vírgula, e
 * `Number('82,5')` é `NaN` — a série seria salva sem carga nenhuma.
 */
export function parseDecimalInput(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Como `parseDecimalInput`, mas arredonda — reps e bpm não são fracionários. */
export function parseIntegerInput(input: string): number | null {
  const value = parseDecimalInput(input);
  return value == null ? null : Math.round(value);
}

/** `82,5` / `60` — decimal com vírgula, inteiro sem casa. */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2))).replace('.', ',');
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
  return `${Math.round(meters)} m`;
}

/** `5:30/km`. `null` quando falta duração ou distância. */
export function formatPace(seconds: number, meters: number): string | null {
  if (!seconds || !meters || meters <= 0) return null;
  const secondsPerKm = (seconds / meters) * 1000;
  if (!Number.isFinite(secondsPerKm)) return null;
  const minutes = Math.floor(secondsPerKm / 60);
  const rest = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}/km`;
}

/**
 * Resumo da última vez que o exercício foi feito, no formato do tipo.
 *
 * Força e cardio são schemas diferentes no `log_set` — mostrar "0 kg × 0" numa
 * corrida seria pior do que não mostrar nada.
 */
export function formatPreviousSet(
  set: SessionSet | null | undefined,
  isCardio: boolean,
): string | null {
  if (!set) return null;

  if (isCardio) {
    const parts: string[] = [];
    if (set.durationSeconds != null) parts.push(formatClock(set.durationSeconds));
    if (set.distanceMeters != null) parts.push(formatDistance(set.distanceMeters));
    if (set.avgHeartRate != null) parts.push(`${set.avgHeartRate} bpm`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  const parts: string[] = [];
  if (set.weightKg != null && set.reps != null) {
    parts.push(`${formatNumber(set.weightKg)} kg × ${set.reps}`);
  } else if (set.weightKg != null) {
    parts.push(`${formatNumber(set.weightKg)} kg`);
  } else if (set.reps != null) {
    parts.push(`${set.reps} reps`);
  }
  if (set.rpe != null) parts.push(`RPE ${formatNumber(set.rpe)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Valores da linha de referência, na ordem das colunas da tabela de séries. */
export function previousCells(
  set: SessionSet | null | undefined,
  isCardio: boolean,
): [string, string, string] {
  if (!set) return ['—', '—', '—'];
  if (isCardio) {
    return [
      set.durationSeconds != null ? formatClock(set.durationSeconds) : '—',
      formatDistance(set.distanceMeters),
      set.avgHeartRate != null ? String(set.avgHeartRate) : '—',
    ];
  }
  return [
    set.reps != null ? String(set.reps) : '—',
    formatNumber(set.weightKg),
    formatNumber(set.rpe),
  ];
}

/** Quantas séries o exercício pede. Sem plano, o alvo cresce com o que foi feito. */
export function targetSetsOf(group: ExerciseGroup): number {
  if (group.isCardio) return 1;
  return group.targetSets ?? Math.max(group.sets.length + 1, 3);
}

export function isExerciseComplete(group: ExerciseGroup): boolean {
  if (group.isCardio) return group.sets.length > 0;
  const target = group.targetSets;
  if (target == null || target === 0) return false;
  return group.sets.length >= target;
}

export interface SessionProgress {
  done: number;
  total: number;
  ratio: number;
}

export function sessionProgress(groups: ExerciseGroup[]): SessionProgress {
  const total = groups.length;
  const done = groups.filter(isExerciseComplete).length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

export function totalVolumeKg(sets: SessionSet[] | undefined): number {
  return (sets ?? []).reduce((acc, set) => {
    if (set.weightKg != null && set.reps != null) return acc + set.weightKg * set.reps;
    return acc;
  }, 0);
}

/** `45min` / `1h 05min`. Sem fim informado, conta até agora. */
export function elapsedLabel(startedAt: string, end: number | string = Date.now()): string {
  const start = new Date(startedAt).getTime();
  const finish = typeof end === 'string' ? new Date(end).getTime() : end;
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return '—';
  const totalMinutes = Math.max(0, Math.round((finish - start) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  return `${minutes}min`;
}

export function formatTimeOfDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'HH:mm');
}

/** `segunda-feira, 29 de jul` — cabeçalho da sessão concluída. */
export function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, "EEEE, d 'de' MMM", { locale: ptBR });
}

/** `8-12` → 8. O primeiro número da faixa é o palpite de repetições. */
export function parseFirstRep(targetReps?: string): number {
  if (!targetReps) return 10;
  const match = targetReps.match(/\d+/);
  return match ? parseInt(match[0], 10) : 10;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
