import { canonicalGroupsOf, type CanonicalMuscleGroup } from './helpers/muscle-group';
import { isCardioExercise } from './helpers/is-cardio';
import { averageFeeling, rpeToFeeling } from './helpers/feeling';

type StrengthGroup = Exclude<CanonicalMuscleGroup, 'cardio'>;

export interface SummaryExercise {
  id: number;
  name: string;
  muscleGroup: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

export interface SummarySet {
  exerciseId: number;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  avgHeartRate: number | null;
  exercise: SummaryExercise;
}

export interface SummaryInput {
  session: {
    id: string;
    planId: string | null;
    startedAt: Date;
    completedAt: Date | null;
    feeling: number | null;
    notes: string | null;
    exerciseOrder: number[];
    plan: { name: string; exercises: { exerciseId: number; order: number }[] } | null;
    sets: SummarySet[];
  };
  /** O último treino terminado do mesmo plano, antes deste. Nulo no treino livre. */
  previous: {
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    sets: { weightKg: number | null; reps: number | null }[];
  } | null;
  /** Séries da pessoa, destes exercícios, em sessões que começaram antes desta. */
  priorSets: {
    exerciseId: number;
    sessionId: string;
    weightKg: number | null;
    reps: number | null;
    distanceMeters: number | null;
  }[];
  now: Date;
}

export interface BestSet {
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  avgHeartRate: number | null;
}

export interface SessionSummaryExercise {
  exerciseId: number;
  exerciseName: string;
  muscleGroup: string;
  isCardio: boolean;
  sets: number;
  best: BestSet | null;
  /** A sensação da série mais recente (1 a 5), pelo RPE dela. */
  feeling: number | null;
  isRecord: boolean;
}

export interface SessionSummary {
  sessionId: string;
  planId: string | null;
  planName: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMinutes: number | null;
  sets: number;
  volumeKg: number;
  /** O que a pessoa marcou em "Como foi o treino?". */
  feeling: number | null;
  /** A observação já gravada, para a tela não apagá-la ao salvar. */
  notes: string | null;
  /** O marcado, ou a média das séries quando ela não marcou. */
  overallFeeling: number | null;
  comparison: {
    sessionId: string;
    startedAt: Date;
    volumeDeltaPct: number | null;
    setsDelta: number;
    durationDeltaMinutes: number | null;
  } | null;
  records: {
    exerciseId: number;
    exerciseName: string;
    weightKg: number | null;
    reps: number | null;
    distanceMeters: number | null;
    durationSeconds: number | null;
  }[];
  muscles: {
    groups: { group: StrengthGroup; sets: number }[];
    primary: string[];
    secondary: string[];
  };
  exercises: SessionSummaryExercise[];
}

function isStrengthBetter(
  a: { weightKg: number | null; reps: number | null },
  b: { weightKg: number | null; reps: number | null },
): boolean {
  const wa = a.weightKg ?? 0;
  const wb = b.weightKg ?? 0;
  if (wa !== wb) return wa > wb;
  return (a.reps ?? 0) > (b.reps ?? 0);
}

function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

function volumeOf(sets: readonly { weightKg: number | null; reps: number | null }[]): number {
  return sets.reduce((acc, s) => acc + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
}

function strengthGroupsOf(exercise: SummaryExercise): StrengthGroup[] {
  if (isCardioExercise(exercise)) return [];
  return canonicalGroupsOf(exercise.primaryMuscles).filter(
    (g): g is StrengthGroup => g !== 'cardio',
  );
}

/**
 * A ordem da lista: a escolhida na sessão, depois a do plano, depois a de
 * chegada. `SessionSet` não guarda hora, então "a ordem em que fez" é essa.
 */
function exerciseOrder(input: SummaryInput['session'], ids: number[]): number[] {
  const position = new Map<number, number>();
  input.exerciseOrder.forEach((id, i) => position.set(id, i));
  const planOrder = new Map<number, number>();
  for (const pe of input.plan?.exercises ?? []) planOrder.set(pe.exerciseId, pe.order);
  const firstSeen = new Map<number, number>();
  ids.forEach((id, i) => firstSeen.has(id) || firstSeen.set(id, i));
  const key = (id: number): [number, number, number] => [
    position.get(id) ?? Number.MAX_SAFE_INTEGER,
    planOrder.get(id) ?? Number.MAX_SAFE_INTEGER,
    firstSeen.get(id) ?? 0,
  ];
  return [...new Set(ids)].sort((a, b) => {
    const [a1, a2, a3] = key(a);
    const [b1, b2, b3] = key(b);
    return a1 - b1 || a2 - b2 || a3 - b3;
  });
}

/** Resumo do "Treino feito!" (prancha `Al-T5-Fim`). Conta pura: o serviço só busca as linhas. */
export function summarizeSession(input: SummaryInput): SessionSummary {
  const { session, previous, priorSets, now } = input;
  const end = session.completedAt ?? now;
  const durationMinutes = minutesBetween(session.startedAt, end);

  const strengthSets = session.sets.filter((s) => !isCardioExercise(s.exercise));
  const volumeKg = Math.round(volumeOf(strengthSets) * 10) / 10;
  const overallFeeling = session.feeling ?? averageFeeling(strengthSets.map((s) => s.rpe));

  let comparison: SessionSummary['comparison'] = null;
  if (previous) {
    const prevVolume = volumeOf(previous.sets);
    const prevDuration = previous.completedAt
      ? minutesBetween(previous.startedAt, previous.completedAt)
      : null;
    comparison = {
      sessionId: previous.id,
      startedAt: previous.startedAt,
      volumeDeltaPct:
        prevVolume > 0 ? Math.round(((volumeKg - prevVolume) / prevVolume) * 100) : null,
      setsDelta: session.sets.length - previous.sets.length,
      durationDeltaMinutes: prevDuration === null ? null : durationMinutes - prevDuration,
    };
  }

  // O melhor de antes, por exercício: força pela série (carga, depois reps);
  // cardio pela soma da distância de uma sessão, como em `getPersonalRecord`.
  const priorStrength = new Map<number, { weightKg: number | null; reps: number | null }>();
  const priorCardioBySession = new Map<string, number>();
  const priorCardio = new Map<number, number>();
  for (const p of priorSets) {
    if (p.distanceMeters != null) {
      const k = `${p.exerciseId}|${p.sessionId}`;
      const total = (priorCardioBySession.get(k) ?? 0) + p.distanceMeters;
      priorCardioBySession.set(k, total);
      priorCardio.set(p.exerciseId, Math.max(priorCardio.get(p.exerciseId) ?? 0, total));
    } else if (p.weightKg != null || p.reps != null) {
      const cur = priorStrength.get(p.exerciseId);
      if (!cur || isStrengthBetter(p, cur)) priorStrength.set(p.exerciseId, p);
    }
  }

  const byExercise = new Map<number, SummarySet[]>();
  for (const s of session.sets) {
    const list = byExercise.get(s.exerciseId);
    if (list) list.push(s);
    else byExercise.set(s.exerciseId, [s]);
  }

  const records: SessionSummary['records'] = [];
  const exercises: SessionSummaryExercise[] = [];
  for (const id of exerciseOrder(
    session,
    session.sets.map((s) => s.exerciseId),
  )) {
    const sets = [...(byExercise.get(id) ?? [])].sort((a, b) => a.setNumber - b.setNumber);
    const exercise = sets[0]!.exercise;
    const cardio = isCardioExercise(exercise);
    let best: BestSet | null = null;
    let isRecord = false;

    if (cardio) {
      const distance = sets.reduce((a, s) => a + (s.distanceMeters ?? 0), 0);
      const duration = sets.reduce((a, s) => a + (s.durationSeconds ?? 0), 0);
      const hrs = sets.map((s) => s.avgHeartRate).filter((h): h is number => h != null);
      best = {
        weightKg: null,
        reps: null,
        distanceMeters: distance || null,
        durationSeconds: duration || null,
        avgHeartRate: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
      };
      const prior = priorCardio.get(id);
      isRecord = prior !== undefined && distance > prior;
      if (isRecord) {
        records.push({
          exerciseId: id,
          exerciseName: exercise.name,
          weightKg: null,
          reps: null,
          distanceMeters: best.distanceMeters,
          durationSeconds: best.durationSeconds,
        });
      }
    } else {
      let top: SummarySet | null = null;
      for (const s of sets) if (!top || isStrengthBetter(s, top)) top = s;
      if (top) {
        best = {
          weightKg: top.weightKg,
          reps: top.reps,
          distanceMeters: null,
          durationSeconds: null,
          avgHeartRate: null,
        };
        const prior = priorStrength.get(id);
        // Peso do corpo não vira recorde de carga: "recorde de 12 flexões" é outra conversa.
        isRecord = !!prior && top.weightKg != null && isStrengthBetter(top, prior);
        if (isRecord) {
          records.push({
            exerciseId: id,
            exerciseName: exercise.name,
            weightKg: top.weightKg,
            reps: top.reps,
            distanceMeters: null,
            durationSeconds: null,
          });
        }
      }
    }

    exercises.push({
      exerciseId: id,
      exerciseName: exercise.name,
      muscleGroup: exercise.muscleGroup,
      isCardio: cardio,
      sets: sets.length,
      best,
      feeling: rpeToFeeling(sets.at(-1)?.rpe),
      isRecord,
    });
  }

  const groupCounts = new Map<StrengthGroup, number>();
  const primary: string[] = [];
  const secondary: string[] = [];
  for (const s of strengthSets) {
    for (const g of strengthGroupsOf(s.exercise)) {
      groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
    }
    for (const m of s.exercise.primaryMuscles) if (!primary.includes(m)) primary.push(m);
  }
  for (const s of strengthSets) {
    for (const m of s.exercise.secondaryMuscles) {
      if (!primary.includes(m) && !secondary.includes(m)) secondary.push(m);
    }
  }

  return {
    sessionId: session.id,
    planId: session.planId,
    planName: session.plan?.name ?? null,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    durationMinutes,
    sets: session.sets.length,
    volumeKg,
    feeling: session.feeling,
    notes: session.notes,
    overallFeeling,
    comparison,
    records,
    muscles: {
      groups: [...groupCounts.entries()]
        .map(([group, sets]) => ({ group, sets }))
        .sort((a, b) => b.sets - a.sets),
      primary,
      secondary,
    },
    exercises,
  };
}
