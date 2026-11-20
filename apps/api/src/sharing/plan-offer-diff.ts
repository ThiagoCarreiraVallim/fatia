import type { PlanSchedule } from '@prisma/client';
import type { PlanSnapshot } from './plan-snapshot';
import { itemKey, upgradeV1, type PlanExerciseItem, type PlanSnapshotV2 } from './plan-snapshot-v2';

type SnapshotItem = PlanExerciseItem | PlanSnapshot['exercises'][number];
/** O retrato de qualquer versão: a v1 é lida como v2 de uma sessão só. */
type AnySnapshot = PlanSnapshot | PlanSnapshotV2;

const asV2 = (snap: AnySnapshot): PlanSnapshotV2 => ('sessions' in snap ? snap : upgradeV1(snap));

/**
 * O que a tela mostra de cada exercício alterado. Os valores vão crus (número,
 * enum, `12:WARMUP,8x40` na tabela de séries); o rótulo e o texto em português
 * são do `@fatia/api-client`, o mesmo para o PWA e o app.
 *
 * `config` é o resto: a definição do exercício do autor (instruções, músculos)
 * ou um campo que o retrato venha a ganhar. Diz só "configuração alterada".
 */
export type DiffField =
  | 'sets'
  | 'reps'
  | 'rest'
  | 'load'
  | 'loadMode'
  | 'repUnit'
  | 'technique'
  | 'biSet'
  | 'setTable'
  | 'notes'
  | 'cardioTarget'
  | 'cardioDuration'
  | 'cardioDistance'
  | 'cardioIntensity'
  | 'warmup'
  | 'loadPercent'
  | 'cardioCalories'
  | 'cardioIncline'
  | 'cardioZone'
  | 'cardioPace'
  | 'cardioRpe'
  | 'config';

export interface FieldChange {
  field: DiffField;
  before: string | null;
  after: string | null;
}

/**
 * O que mudou na versão inteira: nome, ordem dos exercícios, agenda e, com o
 * editor da equipe (#406), as sessões (nome, dia, quantas) e os circuitos.
 */
export type VersionField =
  'title' | 'order' | 'schedule' | 'startDate' | 'weeks' | 'weekdays' | 'sessions' | 'circuits';

export interface VersionChange {
  field: VersionField;
  before: string | null;
  after: string | null;
}

export interface PlanDiff {
  /** Chaves (`exerciseKey`) que a versão nova trouxe. */
  added: string[];
  /** Chaves que saíram, na ordem da versão aceita. */
  removed: string[];
  changed: Array<{ key: string; fields: FieldChange[] }>;
  /** Mudanças da versão, fora de um exercício só. */
  version: VersionChange[];
  hasChanges: boolean;
}

/**
 * A identidade do exercício dentro do retrato, a mesma que a dedupe de
 * `planSnapshotSchema` usa: catálogo e comunidade pelo id, o do autor pelo nome
 * (ele viaja por valor, sem id).
 */
export function exerciseKey(item: SnapshotItem): string {
  return itemKey(item as PlanExerciseItem);
}

/**
 * Os exercícios do retrato com a chave do "o que mudou", na ordem das sessões.
 * Com mais de uma sessão (em qualquer dos dois lados), a chave leva a sessão
 * (`1/catalog:10`): o mesmo exercício em A e em B são dois.
 */
export function diffKeys(
  snap: AnySnapshot,
  other?: AnySnapshot | null,
): Array<{ key: string; item: PlanExerciseItem; sessionIndex: number }> {
  const v2 = asV2(snap);
  const multi = v2.sessions.length > 1 || (other ? asV2(other).sessions.length > 1 : false);
  return v2.sessions.flatMap((session, sessionIndex) =>
    session.items
      .flatMap((i) => (i.type === 'circuit' ? i.exercises : [i]))
      .map((item) => ({
        key: multi ? `${sessionIndex}/${itemKey(item)}` : itemKey(item),
        item,
        sessionIndex,
      })),
  );
}

const text = (v: number | string | boolean | undefined | null) =>
  v === undefined || v === null ? null : String(v);

/** `12:WARMUP,8x40`: repetições, carga (`x`) e o tipo quando não é normal. */
function setTableText(sets: SnapshotItem['sets']): string | null {
  if (!sets?.length) return null;
  return sets
    .map(
      (s) =>
        `${s.reps}${s.loadKg !== undefined ? `x${s.loadKg}` : ''}${s.kind !== 'NORMAL' ? `:${s.kind}` : ''}`,
    )
    .join(',');
}

/** JSON com as chaves em ordem: o `jsonb` não guarda a ordem em que foram escritas. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Os campos com rótulo próprio. O padrão de cada um (técnica normal, sem
 * bi-set, repetições, com carga) entra por extenso: o retrato omite o padrão,
 * e o mesmo valor escrito ou omitido não é mudança.
 */
function labelledFields(item: SnapshotItem): Array<[DiffField, string | null]> {
  return [
    ['sets', text(item.targetSets)],
    ['reps', text(item.targetReps)],
    ['rest', text(item.restSeconds)],
    ['load', text(item.startLoadKg)],
    ['loadMode', item.loadMode ?? 'WEIGHT'],
    ['repUnit', item.repUnit ?? 'REPS'],
    ['technique', item.technique ?? 'NORMAL'],
    ['biSet', String(item.biSetWithNext ?? false)],
    ['setTable', setTableText(item.sets)],
    ['notes', text(item.notes)],
    ['cardioTarget', text(item.cardioTarget)],
    ['cardioDuration', text(item.cardioDurationSeconds)],
    ['cardioDistance', text(item.cardioDistanceMeters)],
    ['cardioIntensity', text(item.cardioIntensity)],
    ['warmup', String(item.warmupBefore ?? false)],
    ['loadPercent', text(item.loadPercent)],
    ['cardioCalories', text(item.cardioCalories)],
    ['cardioIncline', text(item.cardioInclinePercent)],
    ['cardioZone', text(item.cardioZone)],
    ['cardioPace', text(item.cardioPaceSecondsPerKm)],
    ['cardioRpe', text(item.cardioRpe)],
  ];
}

/** As chaves do item que já têm rótulo próprio, mais a ordem (que é da versão). */
const LABELLED_KEYS = new Set([
  'order',
  'type',
  'warmupBefore',
  'loadPercent',
  'cardioCalories',
  'cardioInclinePercent',
  'cardioZone',
  'cardioPaceSecondsPerKm',
  'cardioRpe',
  'targetSets',
  'targetReps',
  'restSeconds',
  'startLoadKg',
  'loadMode',
  'repUnit',
  'technique',
  'biSetWithNext',
  'sets',
  'notes',
  'cardioTarget',
  'cardioDurationSeconds',
  'cardioDistanceMeters',
  'cardioIntensity',
]);

/** O item sem o que tem rótulo próprio: o que sobra é "configuração". */
const remainder = (item: SnapshotItem): string =>
  stable(Object.fromEntries(Object.entries(item).filter(([k]) => !LABELLED_KEYS.has(k))));

function fieldChanges(before: SnapshotItem, after: SnapshotItem): FieldChange[] {
  const old = new Map(labelledFields(before));
  const changes = labelledFields(after)
    .filter(([field, value]) => old.get(field) !== value)
    .map(([field, value]) => ({ field, before: old.get(field) ?? null, after: value }));
  if (remainder(before) !== remainder(after))
    changes.push({ field: 'config', before: null, after: null });
  return changes;
}

/**
 * "O que mudou" (decisão do dono, #379): diff por exercício entre o retrato da
 * versão aceita e o da nova. Novo, removido e alterado em qualquer campo da
 * configuração; trocar a ordem não marca exercício, mas é mudança da versão.
 * Sem versão aceita (a primeira oferta), não há "novo": é o plano inteiro.
 *
 * Retratos diferentes nunca saem como "nada mudou": o que não tem rótulo
 * próprio cai em `config`.
 */
export function diffPlanSnapshots(
  previousSnap: AnySnapshot | null,
  nextSnap: AnySnapshot,
): PlanDiff {
  if (!previousSnap) return { added: [], removed: [], changed: [], version: [], hasChanges: false };
  const previous = asV2(previousSnap);
  const next = asV2(nextSnap);
  const prevKeyed = diffKeys(previous, next);
  const nextKeyed = diffKeys(next, previous);
  const before = new Map(prevKeyed.map((e) => [e.key, e.item]));
  const after = new Map(nextKeyed.map((e) => [e.key, e.item]));
  const nextKeys = nextKeyed.map((e) => e.key);
  const previousKeys = prevKeyed.map((e) => e.key);

  const added = nextKeys.filter((k) => !before.has(k));
  const removed = previousKeys.filter((k) => !after.has(k));
  const changed = nextKeyed.flatMap(({ key, item }) => {
    const old = before.get(key);
    if (!old) return [];
    const fields = fieldChanges(old, item);
    return fields.length ? [{ key, fields }] : [];
  });

  const version: VersionChange[] = [];
  if (previous.name !== next.name) {
    version.push({ field: 'title', before: previous.name, after: next.name });
  }
  const sessionsText = (snap: PlanSnapshotV2) =>
    snap.sessions.map((x) => `${x.name.trim()}@${x.weekday ?? ''}`).join('|');
  if (sessionsText(previous) !== sessionsText(next)) {
    version.push({
      field: 'sessions',
      before: String(previous.sessions.length),
      after: String(next.sessions.length),
    });
  }
  const circuitsText = (snap: PlanSnapshotV2) =>
    stable(
      snap.sessions.map((x) =>
        x.items.flatMap((i) => {
          if (i.type !== 'circuit') return [];
          const { exercises, ...config } = i;
          return [{ ...config, exercises: exercises.map(itemKey) }];
        }),
      ),
    );
  if (circuitsText(previous) !== circuitsText(next)) {
    version.push({ field: 'circuits', before: null, after: null });
  }
  // A sequência dos que ficaram: entrar ou sair um exercício não é troca de ordem.
  const kept = (keys: string[]) => keys.filter((k) => before.has(k) && after.has(k)).join('|');
  if (kept(previousKeys) !== kept(nextKeys)) {
    version.push({ field: 'order', before: null, after: null });
  }
  return {
    added,
    removed,
    changed,
    version,
    hasChanges: added.length + removed.length + changed.length + version.length > 0,
  };
}

export interface DiffableVersion {
  snapshot: AnySnapshot;
  schedule: PlanSchedule;
  startDate: string | null;
  weeks: number | null;
  weekdays: number[];
}

/**
 * O diff da versão inteira: os exercícios e a agenda (tipo, início, semanas e
 * dias). Uma versão que só muda as datas também é "o que mudou".
 */
export function diffOfferVersions(
  previous: DiffableVersion | null,
  next: DiffableVersion,
): PlanDiff {
  const diff = diffPlanSnapshots(previous?.snapshot ?? null, next.snapshot);
  if (!previous) return diff;
  const pairs: Array<[VersionField, string | null, string | null]> = [
    ['schedule', previous.schedule, next.schedule],
  ];
  // De um tipo para o outro, o tipo já diz tudo: as datas do flexível são nulas.
  if (previous.schedule === next.schedule) {
    pairs.push(
      ['startDate', previous.startDate, next.startDate],
      ['weeks', text(previous.weeks), text(next.weeks)],
      [
        'weekdays',
        [...previous.weekdays].sort((a, b) => a - b).join(','),
        [...next.weekdays].sort((a, b) => a - b).join(','),
      ],
    );
  }
  const schedule = pairs
    .filter(([, b, a]) => b !== a)
    .map(([field, before, after]) => ({ field, before, after }));
  const version = [...diff.version, ...schedule];
  return { ...diff, version, hasChanges: diff.hasChanges || schedule.length > 0 };
}
