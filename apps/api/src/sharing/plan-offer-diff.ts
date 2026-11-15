import type { PlanSnapshot } from './plan-snapshot';

type SnapshotItem = PlanSnapshot['exercises'][number];

/** O que a tela mostra de cada exercício alterado: séries, repetições e descanso. */
export type DiffField = 'sets' | 'reps' | 'rest';

export interface FieldChange {
  field: DiffField;
  before: string | null;
  after: string | null;
}

export interface PlanDiff {
  /** Chaves (`exerciseKey`) que a versão nova trouxe. */
  added: string[];
  /** Chaves que saíram, na ordem da versão aceita. */
  removed: string[];
  changed: Array<{ key: string; fields: FieldChange[] }>;
  hasChanges: boolean;
}

/**
 * A identidade do exercício dentro do retrato, a mesma que a dedupe de
 * `planSnapshotSchema` usa: catálogo e comunidade pelo id, o do autor pelo nome
 * (ele viaja por valor, sem id).
 */
export function exerciseKey(item: SnapshotItem): string {
  if (item.source === 'catalog') return `catalog:${item.catalogExerciseId}`;
  if (item.source === 'group') return `group:${item.groupExerciseId}`;
  return `custom:${item.exercise.name}`;
}

const text = (v: number | string | undefined | null) =>
  v === undefined || v === null ? null : String(v);

function fieldChanges(before: SnapshotItem, after: SnapshotItem): FieldChange[] {
  const pairs: Array<[DiffField, string | null, string | null]> = [
    ['sets', text(before.targetSets), text(after.targetSets)],
    ['reps', text(before.targetReps), text(after.targetReps)],
    ['rest', text(before.restSeconds), text(after.restSeconds)],
  ];
  return pairs
    .filter(([, b, a]) => b !== a)
    .map(([field, b, a]) => ({ field, before: b, after: a }));
}

/**
 * "O que mudou" (decisão do dono, #379): diff por exercício entre o retrato da
 * versão aceita e o da nova. Novo, removido e alterado em séries, repetições ou
 * descanso; trocar só a ordem não conta. Sem versão aceita (a primeira oferta),
 * não há "novo": é o plano inteiro.
 */
export function diffPlanSnapshots(previous: PlanSnapshot | null, next: PlanSnapshot): PlanDiff {
  if (!previous) return { added: [], removed: [], changed: [], hasChanges: false };
  const before = new Map(previous.exercises.map((e) => [exerciseKey(e), e]));
  const after = new Map(next.exercises.map((e) => [exerciseKey(e), e]));
  const byOrder = (a: SnapshotItem, b: SnapshotItem) => a.order - b.order;

  const added = [...next.exercises]
    .sort(byOrder)
    .map(exerciseKey)
    .filter((k) => !before.has(k));
  const removed = [...previous.exercises]
    .sort(byOrder)
    .map(exerciseKey)
    .filter((k) => !after.has(k));
  const changed = [...next.exercises].sort(byOrder).flatMap((item) => {
    const key = exerciseKey(item);
    const old = before.get(key);
    if (!old) return [];
    const fields = fieldChanges(old, item);
    return fields.length ? [{ key, fields }] : [];
  });
  return {
    added,
    removed,
    changed,
    hasChanges: added.length + removed.length + changed.length > 0,
  };
}
