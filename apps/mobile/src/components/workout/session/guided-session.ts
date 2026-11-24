import {
  BRAZIL_UNITS,
  feelingOf,
  rpeToFeeling,
  type ExerciseGroup,
  type LoadUnit,
  type SessionSet,
} from '@fatia/api-client';
import { formatNumber, loadValue, pluralize, targetSetsOf, isExerciseComplete } from './format';

/**
 * As contas da sessão guiada (prancha `Al-T3-Sessao`), fora dos componentes
 * para caberem no harness de Node (`vitest.config.ts`): qual estado a tela
 * mostra, qual o próximo exercício aberto, os textos da série e o passo do −/+.
 */

/** O passo dos botões −/+ do canvas: 2,5 kg e 1 rep; no cardio, 0,1 km e 1 min. */
export const STEPS = { load: 2.5, reps: 1, distance: 0.1, minutes: 1 } as const;

/** Soma o passo, arredonda na décima (0,1 + 0,2 não vira 0,30000004) e trava em zero. */
/** O passo da carga na unidade da pessoa: 2,5 kg ou 5 lb, como no PWA. */
export function loadStep(unit: LoadUnit): number {
  return unit === 'LB' ? 5 : STEPS.load;
}

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

/**
 * Todos os exercícios da sessão completos: no lugar do "Tudo feito por aqui"
 * vazio, a tela mostra o treino até aqui (cada exercício com as séries).
 */
export function isSessionDone(groups: readonly ExerciseGroup[]): boolean {
  return groups.length > 0 && groups.every(isExerciseComplete);
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

/**
 * "Série 2 de 4" (prancha `Al-T3d`). Só a contagem: a meta já está embaixo das
 * reps, e a "última vez" e a sugestão saíram a pedido do dono.
 */
export function setHeadline({ done, target }: { done: number; target: number }): string {
  return `Série ${Math.min(done + 1, target)} de ${target}`;
}

/** O chip de uma série feita: "52,5×9 🙂", "15", "3,2km 20′". */
export function setChipLabel(set: SessionSet, isCardio: boolean, unit: LoadUnit = 'KG'): string {
  const emoji = feelingOf(rpeToFeeling(set.rpe))?.emoji;
  let body: string;
  if (isCardio) {
    const parts: string[] = [];
    if (set.distanceMeters != null) parts.push(`${formatNumber(set.distanceMeters / 1000)}km`);
    if (set.durationSeconds != null) parts.push(`${Math.round(set.durationSeconds / 60)}′`);
    body = parts.join(' ') || '✓';
  } else {
    const reps = set.reps ?? 0;
    body = set.weightKg
      ? `${loadValue(set.weightKg, { ...BRAZIL_UNITS, loadUnit: unit })}×${reps}`
      : String(reps);
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
    // Encerrado (#473): as séries que ficaram de fora saem da meta.
    target += g.ended ? g.sets.length : targetSetsOf(g);
  }
  return { done, target, ratio: target === 0 ? 0 : Math.min(1, done / target) };
}

/**
 * O corpo do "+ Série" do Treino atual: os valores da última, com chave nova.
 * Sem série anterior, `null`: uma série vazia contaria no progresso e no
 * resumo, então a tela leva à sessão, onde a série é preenchida.
 */
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
} | null {
  if (!last) return null;
  const body: NonNullable<ReturnType<typeof copyLastSet>> = { exerciseId, clientKey };
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

/**
 * O item do "⋯" que encerra o exercício (#473). Sem série feita é pular; no
 * plano, diz quantas séries ficam de fora. Fora do plano não há meta, e nada
 * fica de fora: só "Encerrar exercício".
 */
export function endExerciseLabel(group: ExerciseGroup): string {
  if (group.sets.length === 0 || group.isCardio) return 'Pular exercício';
  const left = group.targetSets ? group.targetSets - group.sets.length : 0;
  if (left <= 0) return 'Encerrar exercício';
  return `Encerrar exercício (${left} ${pluralize(left, 'série fica', 'séries ficam')} de fora)`;
}
