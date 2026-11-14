import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { addDaysIso, dateInTz, dayBoundsInTz } from '../progress/helpers/date-tz';
import {
  CANONICAL_MUSCLE_GROUPS,
  canonicalGroupsOf,
  type CanonicalMuscleGroup,
} from './helpers/muscle-group';
import { isCardioExercise } from './helpers/is-cardio';

/**
 * Séries por grupo na semana que o card "Séries da semana" usa como meta. É um
 * número de partida para hipertrofia (10–20 por grupo), não uma prescrição.
 */
export const WEEKLY_SETS_TARGET = 12;

/** Um grupo sem série há este tanto de dias (no fuso da pessoa) conta como descansado. */
export const RESTED_AFTER_DAYS = 2;

/** Até onde a busca da última série olha para trás. Mais que isso é "nunca" no card. */
const LOOKBACK_DAYS = 60;

/** Os grupos de força: cardio não tem série por músculo. */
const STRENGTH_GROUPS = CANONICAL_MUSCLE_GROUPS.filter(
  (g): g is Exclude<CanonicalMuscleGroup, 'cardio'> => g !== 'cardio',
);
type StrengthGroup = (typeof STRENGTH_GROUPS)[number];

export interface WeeklyMuscleSummary {
  /** Primeiro dia (YYYY-MM-DD, fuso da pessoa) dos 7 contados, hoje incluído. */
  from: string;
  target: number;
  sets: { group: StrengthGroup; sets: number }[];
  /** Mais descansado primeiro; `daysSince: null` = sem série nos últimos 60 dias. */
  rested: { group: StrengthGroup; daysSince: number | null }[];
  /** O plano da própria pessoa que mais trabalha os grupos descansados. */
  suggestedPlan: { id: string; name: string; groups: StrengthGroup[] } | null;
}

interface ExerciseLike {
  muscleGroup: string;
  primaryMuscles: string[];
}

export interface SummaryInput {
  sets: { exercise: ExerciseLike; session: { startedAt: Date } }[];
  plans: { id: string; name: string; exercises: { exercise: ExerciseLike }[] }[];
  now: Date;
  timezone: string;
}

function strengthGroupsOf(exercise: ExerciseLike): StrengthGroup[] {
  if (isCardioExercise(exercise)) return [];
  return canonicalGroupsOf(exercise.primaryMuscles).filter(
    (g): g is StrengthGroup => g !== 'cardio',
  );
}

/** Dias inteiros entre duas datas YYYY-MM-DD. */
function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round(
    (Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000,
  );
}

/** A conta, sem banco: o serviço só busca as linhas. */
export function summarizeWeeklyMuscles(input: SummaryInput): WeeklyMuscleSummary {
  const today = dateInTz(input.now, input.timezone);
  const from = addDaysIso(today, -6);
  const counts = new Map<StrengthGroup, number>(STRENGTH_GROUPS.map((g) => [g, 0]));
  const lastDay = new Map<StrengthGroup, string>();

  for (const s of input.sets) {
    const day = dateInTz(s.session.startedAt, input.timezone);
    for (const g of strengthGroupsOf(s.exercise)) {
      if (day >= from && day <= today) counts.set(g, counts.get(g)! + 1);
      const prev = lastDay.get(g);
      if (!prev || day > prev) lastDay.set(g, day);
    }
  }

  const rested = STRENGTH_GROUPS.map((group) => {
    const last = lastDay.get(group);
    return { group, daysSince: last ? daysBetween(last, today) : null };
  })
    .filter((r) => r.daysSince === null || r.daysSince >= RESTED_AFTER_DAYS)
    .sort((a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1));

  const restedGroups = new Set(rested.map((r) => r.group));
  let suggestedPlan: WeeklyMuscleSummary['suggestedPlan'] = null;
  let best = 0;
  for (const plan of input.plans) {
    const groups: StrengthGroup[] = [];
    for (const { exercise } of plan.exercises) {
      for (const g of strengthGroupsOf(exercise)) {
        if (restedGroups.has(g) && !groups.includes(g)) groups.push(g);
      }
    }
    if (groups.length > best) {
      best = groups.length;
      suggestedPlan = { id: plan.id, name: plan.name, groups };
    }
  }

  return {
    from,
    target: WEEKLY_SETS_TARGET,
    sets: STRENGTH_GROUPS.map((group) => ({ group, sets: counts.get(group)! })),
    rested,
    suggestedPlan,
  };
}

/**
 * Leitura derivada para os cards da aba Treino (#369) e a semana da #377: não
 * guarda nada. Tudo pelo `userId` do token: as séries pela sessão dela, os
 * planos pelo dono.
 */
@Injectable()
export class MuscleSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async weekly(
    userId: string,
    timezone: string,
    now: Date = new Date(),
  ): Promise<WeeklyMuscleSummary> {
    const since = dayBoundsInTz(
      addDaysIso(dateInTz(now, timezone), -LOOKBACK_DAYS),
      timezone,
    ).start;
    const exerciseSelect = { select: { muscleGroup: true, primaryMuscles: true } } as const;
    const [sets, plans] = await Promise.all([
      this.prisma.sessionSet.findMany({
        where: { session: { userId, startedAt: { gte: since } } },
        select: { exercise: exerciseSelect, session: { select: { startedAt: true } } },
      }),
      this.prisma.workoutPlan.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, exercises: { select: { exercise: exerciseSelect } } },
      }),
    ]);
    return summarizeWeeklyMuscles({ sets, plans, now, timezone });
  }
}
