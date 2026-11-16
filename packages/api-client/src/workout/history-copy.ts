import type { PendingExercise } from '../session-view';
import { formatDistanceIn, kgToLoad, loadUnitLabel, type LoadUnit, type UnitPrefs } from '../units';
import type {
  SessionKind,
  SummarySetLine,
  WorkoutHistory,
  WorkoutHistoryItem,
  WorkoutSessionSummary,
} from '../workout';
import { formatTrainingVolume } from '../workout-session-copy';

/**
 * Os textos do treino livre e do histórico (#381): pranchas `Al-T17b`,
 * `Al-T10`, `Al-T11` e `Al-T11b`. Um lugar só para a web e o app.
 */

type Units = Pick<UnitPrefs, 'loadUnit' | 'distanceUnit'>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** 52.5 → "52,5"; 80 → "80". */
function trim(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '');
}

/**
 * Os filtros do topo do histórico. **Ponto de extensão (#380):** "Circuitos"
 * (`kind: 'circuit'`) entra aqui quando a sessão de circuito existir; antes
 * disso a aba ficaria sempre vazia (a mesma escolha do "Planos de treino" da #378).
 */
export const HISTORY_FILTERS: ReadonlyArray<{ kind: SessionKind | undefined; label: string }> = [
  { kind: undefined, label: 'Tudo' },
  { kind: 'plan', label: 'Planos' },
  { kind: 'free', label: 'Livres' },
];

export function sessionKindLabel(kind: SessionKind): string {
  return kind === 'plan' ? 'plano' : kind === 'circuit' ? 'circuito' : 'livre';
}

export function historyTitle(item: Pick<WorkoutHistoryItem, 'title'>): string {
  return item.title ?? 'Treino livre';
}

function cardioBits(
  cardio: NonNullable<WorkoutHistoryItem['cardio']>,
  units: Units,
  withHeart: boolean,
): string[] {
  const bits: string[] = [];
  if (cardio.distanceMeters) bits.push(formatDistanceIn(cardio.distanceMeters, units.distanceUnit));
  else if (cardio.durationSeconds) bits.push(`${Math.round(cardio.durationSeconds / 60)} min`);
  if (withHeart && cardio.avgHeartRate) bits.push(`${cardio.avgHeartRate} bpm`);
  return bits;
}

/**
 * O resumo da linha: "6 exercícios · 19 séries · 6,2 t", "Esteira · 5,1 km ·
 * 146 bpm" (só cardio) ou "5 exercícios + esteira 10 min" (força com cardio).
 */
export function historyLine(item: WorkoutHistoryItem, units: Units): string {
  if (item.strengthExercises === 0 && item.cardio) {
    return [item.cardio.exerciseName, ...cardioBits(item.cardio, units, true)].join(' · ');
  }
  const strength = [
    plural(item.strengthExercises, 'exercício', 'exercícios'),
    ...(item.cardio ? [] : [plural(item.strengthSets, 'série', 'séries')]),
    ...(item.cardio || item.volumeKg <= 0
      ? []
      : [formatTrainingVolume(item.volumeKg, units.loadUnit)]),
  ].join(' · ');
  if (!item.cardio) return strength;
  const cardio = [item.cardio.exerciseName.toLowerCase(), ...cardioBits(item.cardio, units, false)];
  return `${strength} + ${cardio.join(' ')}`;
}

/** A coluna do dia: "ter" e "3", no fuso do aparelho. */
export function historyDay(startedAt: string): { weekday: string; day: string } {
  const d = new Date(startedAt);
  return {
    weekday: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
    day: String(d.getDate()),
  };
}

/** Os três números do topo: sessões, duração média e volume. */
export function historyTotals(
  totals: WorkoutHistory['totals'],
  unit: LoadUnit,
): { value: string; label: string }[] {
  return [
    { value: String(totals.sessions), label: totals.sessions === 1 ? 'sessão' : 'sessões' },
    {
      value: totals.avgDurationMinutes == null ? '—' : `${totals.avgDurationMinutes}′`,
      label: 'média',
    },
    { value: formatTrainingVolume(totals.volumeKg, unit), label: 'volume' },
  ];
}

/** O título do detalhe: "Seg, 2 nov". */
export function sessionDetailTitle(startedAt: string): string {
  const d = new Date(startedAt);
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${d.getDate()} ${month}`;
}

/** Sessão só de cardio (Al-T11b): o cartão de cima fala de distância, não de volume. */
export function cardioOnly(summary: Pick<WorkoutSessionSummary, 'exercises'>): boolean {
  return summary.exercises.length > 0 && summary.exercises.every((e) => e.isCardio);
}

export interface SessionHero {
  /** `strength` = cartão verde (Al-T11); `cardio` = cartão rosa (Al-T11b). */
  tone: 'strength' | 'cardio';
  label: string;
  facts: { value: string; label: string }[];
}

/**
 * O cartão de cima do detalhe. **Ponto de extensão (#380):** a sessão de
 * circuito (Al-T11c: rounds, duração, média por round, cartão amarelo) entra
 * aqui como um terceiro `tone`, quando o resumo trouxer o resultado do circuito.
 */
export function sessionHero(summary: WorkoutSessionSummary, units: Units): SessionHero {
  const name = (summary.planName ?? 'Treino livre').toUpperCase();
  const duration = summary.durationMinutes == null ? '—' : `${summary.durationMinutes}′`;
  if (cardioOnly(summary)) {
    const best = summary.exercises[0]!.best;
    return {
      tone: 'cardio',
      label: `CONCLUÍDO · ${name}`,
      facts: [
        {
          value: best?.distanceMeters
            ? formatDistanceIn(best.distanceMeters, units.distanceUnit)
            : '—',
          label: 'distância',
        },
        { value: duration, label: 'duração' },
        { value: best?.avgHeartRate ? String(best.avgHeartRate) : '—', label: 'FC média' },
      ],
    };
  }
  return {
    tone: 'strength',
    label: `CONCLUÍDO · ${name}`,
    facts: [
      { value: duration, label: 'duração' },
      { value: formatTrainingVolume(summary.volumeKg, units.loadUnit), label: 'volume' },
      { value: String(summary.sets), label: 'séries' },
    ],
  };
}

/** Uma série aberta no detalhe: "52,5 kg × 10", "12 reps", "45 s", "2,4 km · 15 min". */
export function setLine(set: SummarySetLine, units: Units): string {
  if (set.distanceMeters != null) {
    const bits = [formatDistanceIn(set.distanceMeters, units.distanceUnit)];
    if (set.durationSeconds) bits.push(`${Math.round(set.durationSeconds / 60)} min`);
    return bits.join(' · ');
  }
  if (set.reps == null && set.durationSeconds != null) {
    return set.durationSeconds >= 120
      ? `${Math.round(set.durationSeconds / 60)} min`
      : `${set.durationSeconds} s`;
  }
  if (set.weightKg) {
    return `${trim(kgToLoad(set.weightKg, units.loadUnit))} ${loadUnitLabel(units.loadUnit)} × ${set.reps ?? 0}`;
  }
  return `${set.reps ?? 0} reps`;
}

/** O selo de recorde de distância do cardio: "Maior distância na esteira · antes 4,6 km". */
export function cardioRecordLine(
  record: WorkoutSessionSummary['records'][number],
  units: Units,
): { title: string; before: string | null } {
  const before = record.previous?.distanceMeters
    ? `antes ${formatDistanceIn(record.previous.distanceMeters, units.distanceUnit)}`
    : null;
  return { title: `Maior distância na ${record.exerciseName.toLowerCase()}`, before };
}

/**
 * "Repetir" (#381): a sessão com plano repete o plano; a livre começa outra
 * livre com os mesmos exercícios, que entram como escolhidos e ainda sem série.
 */
export function repeatPlanOf(summary: WorkoutSessionSummary): {
  planId: string | null;
  pending: PendingExercise[];
} {
  if (summary.planId) return { planId: summary.planId, pending: [] };
  return {
    planId: null,
    pending: summary.exercises.map((e) => ({
      id: e.exerciseId,
      name: e.exerciseName,
      muscleGroup: e.muscleGroup,
    })),
  };
}

/** O botão do Treino livre: "Iniciar treino · 2 exercícios". */
export function freeStartLabel(count: number): string {
  if (count === 0) return 'Iniciar treino';
  return `Iniciar treino · ${plural(count, 'exercício', 'exercícios')}`;
}

/**
 * O Treino livre somando exercícios (Al-T17b): na ordem, sem repetir, com o
 * aviso do que entrou (nulo quando nada era novo).
 */
export function addToFreeWorkout<T extends { id: number; name: string }>(
  picked: readonly T[],
  incoming: readonly T[],
): { picked: T[]; message: string | null } {
  const chosen = new Set(picked.map((e) => e.id));
  const fresh = incoming.filter((e) => !chosen.has(e.id) && chosen.add(e.id));
  if (fresh.length === 0) return { picked: [...picked], message: null };
  return {
    picked: [...picked, ...fresh],
    message: fresh.length === 1 ? `${fresh[0]!.name} adicionado` : `${fresh.length} adicionados`,
  };
}

/** Os sugeridos do Treino livre: a busca sem termo (favoritos primeiro), sem os já escolhidos. */
export function freeSuggestions<T extends { id: number }>(
  results: readonly T[] | undefined,
  picked: readonly { id: number }[],
  max: number,
): T[] {
  const chosen = new Set(picked.map((e) => e.id));
  return (results ?? []).filter((e) => !chosen.has(e.id)).slice(0, max);
}
