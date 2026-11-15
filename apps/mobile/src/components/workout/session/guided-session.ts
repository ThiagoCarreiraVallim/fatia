import { feelingOf, rpeToFeeling, type ExerciseGroup, type SessionSet } from '@fatia/api-client';
import { formatNumber, targetSetsOf, isExerciseComplete } from './format';

/**
 * As contas da sessão guiada (prancha `Al-T3-Sessao`), fora dos componentes
 * para caberem no harness de Node (`vitest.config.ts`): qual estado a tela
 * mostra, qual o próximo exercício aberto, os textos da série e o passo do −/+.
 */

/** O passo dos botões −/+ do canvas: 2,5 kg e 1 rep; no cardio, 0,1 km e 1 min. */
export const STEPS = { load: 2.5, reps: 1, distance: 0.1, minutes: 1 } as const;

/** Soma o passo, arredonda na décima (0,1 + 0,2 não vira 0,30000004) e trava em zero. */
export function stepValue(value: number, delta: number): number {
  return Math.max(0, Math.round((value + delta) * 10) / 10);
}

export type GuidedState = 'working' | 'resting' | 'picking';

/**
 * Descansando ganha de tudo (a última série acabou de sair); sem descanso, um
 * exercício completo vira a escolha do próximo; senão, a série da vez.
 */
export function guidedState({
  resting,
  complete,
}: {
  resting: boolean;
  complete: boolean;
}): GuidedState {
  if (resting) return 'resting';
  return complete ? 'picking' : 'working';
}

/** O próximo exercício ainda aberto depois de `from`, dando a volta na lista. */
export function nextOpenIndex(groups: readonly ExerciseGroup[], from: number): number | null {
  for (let k = 1; k <= groups.length; k += 1) {
    const i = (from + k) % groups.length;
    if (i === from) break;
    if (!isExerciseComplete(groups[i]!)) return i;
  }
  return null;
}

/** "Série 2 de 4 · meta 8–10 · última vez 52,5 kg × 9". */
export function setHeadline({
  done,
  target,
  targetReps,
  lastTime,
}: {
  done: number;
  target: number;
  targetReps?: string | null;
  lastTime?: string | null;
}): string {
  const parts = [`Série ${Math.min(done + 1, target)} de ${target}`];
  if (targetReps) parts.push(`meta ${targetReps}`);
  if (lastTime) parts.push(`última vez ${lastTime}`);
  return parts.join(' · ');
}

/** O chip de uma série feita: "52,5×9 🙂", "15", "3,2km 20′". */
export function setChipLabel(set: SessionSet, isCardio: boolean): string {
  const emoji = feelingOf(rpeToFeeling(set.rpe))?.emoji;
  let body: string;
  if (isCardio) {
    const parts: string[] = [];
    if (set.distanceMeters != null) parts.push(`${formatNumber(set.distanceMeters / 1000)}km`);
    if (set.durationSeconds != null) parts.push(`${Math.round(set.durationSeconds / 60)}′`);
    body = parts.join(' ') || '✓';
  } else {
    const reps = set.reps ?? 0;
    body = set.weightKg ? `${formatNumber(set.weightKg)}×${reps}` : String(reps);
  }
  return emoji ? `${body} ${emoji}` : body;
}

/** A linha fina da barra do treino em andamento: séries feitas sobre a meta. */
export function setProgress(groups: readonly ExerciseGroup[]): {
  done: number;
  target: number;
  ratio: number;
} {
  let done = 0;
  let target = 0;
  for (const g of groups) {
    done += g.sets.length;
    target += targetSetsOf(g);
  }
  return { done, target, ratio: target === 0 ? 0 : Math.min(1, done / target) };
}

/** O corpo do "+ Série" do Treino atual: os valores da última, com chave nova. */
export function copyLastSet(
  exerciseId: number,
  last: SessionSet | undefined,
  clientKey: string,
): {
  exerciseId: number;
  weightKg?: number;
  reps?: number;
  rpe?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  clientKey: string;
} {
  const body: ReturnType<typeof copyLastSet> = { exerciseId, clientKey };
  if (last?.weightKg != null) body.weightKg = last.weightKg;
  if (last?.reps != null) body.reps = last.reps;
  if (last?.rpe != null) body.rpe = last.rpe;
  if (last?.durationSeconds != null) body.durationSeconds = last.durationSeconds;
  if (last?.distanceMeters != null) body.distanceMeters = last.distanceMeters;
  return body;
}

/** "Passar sozinho para o próximo exercício": ligado até a pessoa desligar. */
export const AUTO_ADVANCE_DEFAULT = true;
export const AUTO_ADVANCE_STORAGE_KEY = 'fatia.workout.autoAdvance';

export function parseAutoAdvance(raw: string | null | undefined): boolean {
  if (raw == null) return AUTO_ADVANCE_DEFAULT;
  return raw !== '0';
}

export function serializeAutoAdvance(on: boolean): string {
  return on ? '1' : '0';
}
