import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StepLogService } from './step-log.service';
import { WeightLogService } from './weight-log.service';
import { WaterLogService } from './water-log.service';
import { StreakService } from './streak.service';
import { AchievementService, type AchievementEntry } from './achievement.service';
import { TrainingBlockService } from '../workout/training-block.service';
import { addDaysIso, dateInTz, dayBoundsInTz, todayInTz, weekStartInTz } from './helpers/date-tz';
import { ITENS_EM_ORDEM } from '../nutrition/itens-em-ordem';
import { computeDailyGoals } from './helpers/daily-goals';
import { activeLinksOf, linkedOffersWhere } from '../sharing/plan-offer-links';
import type { NextEvent, ReceivedPlan, TodoItem, TodoSummary } from './today-contracts';

/** Janela da variação de peso que o cartão do Hoje mostra ("−2,5 em 30 dias"). */
const WEIGHT_CHANGE_DAYS = 30;

interface UserCtx {
  userId: string;
  timezone: string;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stepLogs: StepLogService,
    private readonly weightLogs: WeightLogService,
    private readonly waterLogs: WaterLogService,
    private readonly streaks: StreakService,
    private readonly achievements: AchievementService,
    private readonly trainingBlocks: TrainingBlockService,
  ) {}

  /**
   * Ofertas esperando resposta (#379), só de quem ainda tem `ProfessionalLink`
   * ativo com a pessoa na comunidade em que enviou: a outra não se responde mais.
   */
  private async pendingOffers(userId: string) {
    const linked = linkedOffersWhere(await activeLinksOf(this.prisma, userId));
    if (!linked) return [];
    return this.prisma.planOffer.findMany({
      where: { userId, versions: { some: { status: 'PENDING' } }, ...linked },
      select: {
        id: true,
        author: { select: { name: true } },
        versions: {
          where: { status: 'PENDING' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, title: true, version: true, schedule: true, weeks: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: TODO_LIMIT + 1,
    });
  }

  async today(ctx: UserCtx) {
    const date = todayInTz(ctx.timezone);
    const { start: dayStart, end: dayEnd } = dayBoundsInTz(date, ctx.timezone);

    const [
      meals,
      goals,
      sessionInProgress,
      completedSession,
      latestWeight,
      stepsToday,
      waterToday,
      streak,
      activeBlock,
      plans,
      nutrientTargets,
      unreadInbox,
      firstWeightInWindow,
      pendingOffers,
    ] = await Promise.all([
      this.prisma.meal.findMany({
        // `lt`, não `lte`: o `end` do `dayBoundsInTz` é a meia-noite do dia SEGUINTE, então
        // `lte` faz o instante da virada pertencer aos dois dias. O resto do produto já usa
        // `lt` (nutrition-summary, nutrient-target, meal) — só o dashboard divergia, e por
        // isso a mesma refeição podia somar em dois lugares com respostas diferentes.
        where: { userId: ctx.userId, eatenAt: { gte: dayStart, lt: dayEnd } },
        include: ITENS_EM_ORDEM,
      }),
      this.prisma.userGoals.findUnique({ where: { userId: ctx.userId } }),
      this.prisma.workoutSession.findFirst({
        where: { userId: ctx.userId, completedAt: null, startedAt: { gte: dayStart } },
        select: { id: true, startedAt: true },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.workoutSession.findFirst({
        where: {
          userId: ctx.userId,
          completedAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.weightLogs.getLatest(ctx.userId),
      this.stepLogs.getStepsForDate(date, ctx.userId),
      this.waterLogs.getForDate(date, ctx.userId),
      this.streaks.compute(ctx),
      // Quem preenche `plannedToday` é o bloco de periodização (#145): sem bloco
      // ativo — ou com um bloco já vencido, que o `getActive` devolve como `null` —
      // o campo continua nulo e o card volta a dizer "treino livre".
      this.trainingBlocks.getActive(ctx),
      // Rotação para quem tem planos mas não tem bloco: só a última sessão
      // concluída de cada plano, para saber qual foi treinado por último.
      this.prisma.workoutPlan.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          sessions: {
            where: { completedAt: { not: null } },
            orderBy: { completedAt: 'desc' },
            take: 1,
            select: { completedAt: true },
          },
          // "6 exercícios" no cartão de próximo treino (Al-H1-Hoje).
          _count: { select: { exercises: true } },
        },
      }),
      // Fibra mínima, sódio máximo e afins entram nas metas do dia (Al-H5-Metas).
      this.prisma.nutrientTarget.findMany({
        where: { userId: ctx.userId },
        orderBy: { label: 'asc' },
        select: { nutrientKey: true, label: true, unit: true, min: true, max: true },
      }),
      // O ponto do sino (#373).
      this.prisma.inboxNotice.count({ where: { userId: ctx.userId, readAt: null } }),
      // O primeiro peso da janela de 30 dias, para a variação do cartão de peso.
      this.prisma.weightLog.findFirst({
        where: {
          userId: ctx.userId,
          loggedAt: {
            gte: dayBoundsInTz(addDaysIso(date, -(WEIGHT_CHANGE_DAYS - 1)), ctx.timezone).start,
          },
        },
        orderBy: { loggedAt: 'asc' },
        select: { id: true, weightKg: true },
      }),
      // Planos de treino da equipe esperando resposta (#379), só de quem ainda
      // tem vínculo ativo com a pessoa.
      this.pendingOffers(ctx.userId),
    ]);

    const plannedToday =
      activeBlock?.planId && activeBlock.planName
        ? { planId: activeBlock.planId, name: activeBlock.planName }
        : null;

    const items = meals.flatMap((m) => m.items);
    const consumed = items.reduce(
      (acc, i) => ({
        kcal: acc.kcal + i.kcal,
        proteinG: acc.proteinG + i.proteinG,
        carbsG: acc.carbsG + i.carbsG,
        fatG: acc.fatG + i.fatG,
      }),
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

    const onTrack = goals ? consumed.kcal >= goals.kcalMin && consumed.kcal <= goals.kcalMax : null;

    const stepsTarget = goals?.dailyStepsTarget ?? null;
    const stepsGoalReached = stepsTarget !== null ? stepsToday.steps >= stepsTarget : null;

    const waterTargetMl = goals?.dailyWaterTargetMl ?? null;
    const waterGoalReached = waterTargetMl !== null ? waterToday.totalMl >= waterTargetMl : null;

    const latestWeightToday =
      latestWeight && latestWeight.loggedAt >= dayStart && latestWeight.loggedAt <= dayEnd;

    const change30dKg =
      latestWeight && firstWeightInWindow && firstWeightInWindow.id !== latestWeight.id
        ? latestWeight.weightKg - firstWeightInWindow.weightKg
        : null;

    const nutrientTotals = sumNutrients(items);
    const dailyGoals = computeDailyGoals({
      goals,
      consumed,
      waterMl: waterToday.totalMl,
      steps: stepsToday.steps,
      workout: {
        planName: plannedToday?.name ?? null,
        planned: plannedToday !== null,
        completedToday: !!completedSession,
      },
      nutrients: nutrientTargets.map((t) => ({
        ...t,
        total: Math.round((nutrientTotals[t.nutrientKey] ?? 0) * 100) / 100,
      })),
    });

    const exerciseCountOf = (planId: string) => {
      const plan = plans.find((p) => p.id === planId);
      return plan ? plan._count.exercises : null;
    };
    const rotation = nextInRotation(plans);
    const nextPlan = plannedToday
      ? {
          ...plannedToday,
          source: 'BLOCK' as const,
          exerciseCount: exerciseCountOf(plannedToday.planId),
        }
      : rotation
        ? { ...rotation, exerciseCount: exerciseCountOf(rotation.planId) }
        : null;

    // Pontos de extensão do Hoje (#373) cujos dados nascem em outras issues: o
    // contrato já vai na resposta, e a tela some com o cartão enquanto vier vazio.
    // "Para fazer" (#383 avaliação, #379 plano a aceitar, #391 questionário),
    // treino recebido (#379) e evento do dia (#397).
    // O plano mais recente vai no cartão "Novo treino da Helena"; os outros, no
    // "Para fazer" — o mesmo plano não aparece duas vezes.
    const offers = pendingOffers.filter((o) => o.versions.length > 0);
    const receivedPlan: ReceivedPlan | null = offers[0] ? receivedPlanOf(offers[0]) : null;
    const todoItems = offers.slice(1, TODO_LIMIT + 1).map(planOfferTodo);
    const todo: TodoSummary = { count: todoItems.length, items: todoItems };
    const nextEvent: NextEvent | null = null;

    // Só LÊ. Desbloquear aqui gravaria em `UserAchievement` no meio de um `GET` — a tool
    // `get_today_summary` declara `readOnlyHint: true` e o Claude a chama sem confirmar, então
    // "quanto comi hoje?" acabava criando até 7 linhas. Quem escreve é `refresh_achievements`.
    //
    // Conquista é enfeite; dashboard é o produto. Se a leitura falhar, a tela ainda abre — e o
    // erro fica no log em vez de virar 500 na cara de quem só queria ver as calorias.
    let achievements: AchievementEntry[] = [];
    try {
      achievements = await this.achievements.list(ctx);
    } catch (err: unknown) {
      this.logger.error({
        event: 'achievement_read_failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      date,
      nutrition: {
        consumed,
        goals,
        mealsLogged: meals.length,
        onTrack,
      },
      workout: {
        // Bloco sem plano (`planId` nulo) periodiza treino livre: não há nome de
        // plano para prometer, e prometer o do bloco levaria a pessoa a procurar
        // uma tela que não existe.
        plannedToday,
        // O que o card de "próximo treino" oferece: o plano do bloco, ou, sem
        // bloco, o seguinte ao último plano treinado. `plannedToday` continua
        // sendo só o do bloco, porque é o que ele promete.
        nextPlan,
        sessionInProgress,
        completedToday: !!completedSession,
      },
      weight: {
        latest: latestWeight
          ? { weightKg: latestWeight.weightKg, loggedAt: latestWeight.loggedAt.toISOString() }
          : null,
        loggedToday: !!latestWeightToday,
        /** Último peso menos o primeiro dos últimos 30 dias; nulo com um registro só. */
        change30dKg,
      },
      steps: {
        today: stepsToday.steps,
        target: stepsTarget,
        goalReached: stepsGoalReached,
        logged: stepsToday.logCount > 0,
      },
      water: {
        todayMl: waterToday.totalMl,
        targetMl: waterTargetMl,
        goalReached: waterGoalReached,
        logged: waterToday.logCount > 0,
      },
      streak,
      achievements,
      /** As metas do dia, uma linha por meta com alvo: o "Metas 2/5" do topo. */
      dailyGoals,
      inbox: { unread: unreadInbox },
      todo,
      receivedPlan,
      nextEvent,
    };
  }

  async week(ctx: UserCtx) {
    const today = todayInTz(ctx.timezone);
    const weekStart = weekStartInTz(new Date(`${today}T12:00:00Z`), ctx.timezone);
    const weekEnd = addDaysIso(weekStart, 6);
    // Semana e dias no fuso da pessoa, com `lt` na meia-noite seguinte como em `today`.
    const startDate = dayBoundsInTz(weekStart, ctx.timezone).start;
    const endDate = dayBoundsInTz(weekEnd, ctx.timezone).end;

    const [meals, goals, sessions, weightLogs] = await Promise.all([
      this.prisma.meal.findMany({
        where: { userId: ctx.userId, eatenAt: { gte: startDate, lt: endDate } },
        include: ITENS_EM_ORDEM,
      }),
      this.prisma.userGoals.findUnique({ where: { userId: ctx.userId } }),
      this.prisma.workoutSession.findMany({
        where: {
          userId: ctx.userId,
          completedAt: { gte: startDate, lt: endDate },
        },
        include: {
          plan: { select: { name: true } },
          sets: { include: { exercise: { select: { muscleGroup: true } } } },
        },
      }),
      this.prisma.weightLog.findMany({
        where: { userId: ctx.userId, loggedAt: { gte: startDate, lt: endDate } },
        orderBy: { loggedAt: 'asc' },
      }),
    ]);

    const byDate = new Map<string, { kcal: number; proteinG: number }>();
    for (const m of meals) {
      const date = dateInTz(m.eatenAt, ctx.timezone);
      const cur = byDate.get(date) ?? { kcal: 0, proteinG: 0 };
      for (const i of m.items) {
        cur.kcal += i.kcal;
        cur.proteinG += i.proteinG;
      }
      byDate.set(date, cur);
    }
    const days = [...byDate.values()];
    const avgKcal = days.length ? days.reduce((a, d) => a + d.kcal, 0) / days.length : 0;
    const avgProteinG = days.length ? days.reduce((a, d) => a + d.proteinG, 0) / days.length : 0;
    const daysOnTrack = goals
      ? days.filter((d) => d.kcal >= goals.kcalMin && d.kcal <= goals.kcalMax).length
      : 0;

    const sessionInfos = sessions.map((s) => {
      const volumeKg = s.sets
        .filter((set) => set.weightKg && set.reps && set.exercise.muscleGroup !== 'cardio')
        .reduce((a, set) => a + (set.weightKg ?? 0) * (set.reps ?? 0), 0);
      return {
        date: dateInTz(s.startedAt, ctx.timezone),
        planName: s.plan?.name ?? null,
        volumeKg,
      };
    });

    const cardioSets = sessions.flatMap((s) =>
      s.sets.filter((set) => set.exercise.muscleGroup === 'cardio'),
    );
    const cardioSessionIds = new Set(
      sessions
        .filter((s) => s.sets.some((set) => set.exercise.muscleGroup === 'cardio'))
        .map((s) => s.id),
    );
    const totalDurationSeconds = cardioSets.reduce((a, s) => a + (s.durationSeconds ?? 0), 0);
    const totalDistanceMeters = cardioSets.reduce((a, s) => a + (s.distanceMeters ?? 0), 0);

    let totalSteps = 0;
    let daysWithGoalReached = 0;
    const stepsTarget = goals?.dailyStepsTarget ?? null;
    for (let i = 0; i < 7; i++) {
      const d = addDaysIso(weekStart, i);
      const { steps } = await this.stepLogs.getStepsForDate(d, ctx.userId);
      totalSteps += steps;
      if (stepsTarget !== null && steps >= stepsTarget) daysWithGoalReached++;
    }
    const avgDaily = totalSteps / 7;

    const startKg = weightLogs.length ? weightLogs[0].weightKg : null;
    const currentKg = weightLogs.length ? weightLogs[weightLogs.length - 1].weightKg : null;
    const deltaKg = startKg !== null && currentKg !== null ? currentKg - startKg : null;

    return {
      weekStart,
      weekEnd,
      nutrition: { avgKcal, avgProteinG, daysOnTrack },
      workouts: {
        completed: sessions.length,
        target: goals?.weeklyWorkouts ?? 0,
        sessions: sessionInfos,
      },
      cardio: {
        sessionCount: cardioSessionIds.size,
        totalDurationSeconds,
        totalDistanceMeters,
      },
      steps: { totalSteps, avgDaily, daysWithGoalReached, target: stepsTarget },
      weight: { startKg, currentKg, deltaKg },
    };
  }
}

/** Soma do dia de cada micronutriente rastreado (`MealItem.nutrients`, ADR 009). */
function sumNutrients(items: Array<{ nutrients: unknown }>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const map = item.nutrients;
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        totals[key] = (totals[key] ?? 0) + value;
      }
    }
  }
  return totals;
}

type PlanWithLastSession = {
  id: string;
  name: string;
  sessions: Array<{ completedAt: Date | null }>;
};

/**
 * O plano seguinte ao último treinado, em ordem de criação, voltando ao
 * primeiro depois do último. Quem ainda não treinou nenhum começa pelo primeiro.
 */
export function nextInRotation(
  plans: PlanWithLastSession[],
): { planId: string; name: string; source: 'ROTATION' } | null {
  if (plans.length === 0) return null;
  let lastIdx = -1;
  let lastAt = 0;
  plans.forEach((plan, idx) => {
    const at = plan.sessions[0]?.completedAt?.getTime() ?? 0;
    if (at > lastAt) {
      lastAt = at;
      lastIdx = idx;
    }
  });
  const next = plans[(lastIdx + 1) % plans.length];
  return { planId: next.id, name: next.name, source: 'ROTATION' };
}

/** Quantos itens do "Para fazer" a resposta leva. */
const TODO_LIMIT = 5;

interface PendingOfferRow {
  id: string;
  author: { name: string } | null;
  versions: Array<{
    title: string;
    version: number;
    schedule: 'CALENDAR' | 'FLEXIBLE';
    weeks: number | null;
  }>;
}

const firstNameOf = (name: string | undefined) => name?.trim().split(/\s+/)[0] ?? 'equipe';

/** "Inferior v2 · 4 semanas" ou "Push · flexível". */
function offerLine(v: PendingOfferRow['versions'][number]): string {
  const title = v.version > 1 ? `${v.title} v${v.version}` : v.title;
  return `${title} · ${v.schedule === 'CALENDAR' && v.weeks ? `${v.weeks} semanas` : 'flexível'}`;
}

function receivedPlanOf(offer: PendingOfferRow): ReceivedPlan {
  return {
    id: offer.id,
    title: `Novo treino de ${firstNameOf(offer.author?.name)}`,
    subtitle: offerLine(offer.versions[0]!),
    fromName: offer.author?.name ?? 'Equipe',
    href: `/workout/offers/${offer.id}`,
  };
}

function planOfferTodo(offer: PendingOfferRow): TodoItem {
  const v = offer.versions[0]!;
  const when = v.schedule === 'CALENDAR' && v.weeks ? `${v.weeks} semanas` : 'flexível';
  return {
    kind: 'plan_offer',
    id: offer.id,
    title: v.version > 1 ? `${v.title} v${v.version}` : v.title,
    subtitle: `enviado por ${firstNameOf(offer.author?.name)} · ${when}`,
    href: `/workout/offers/${offer.id}`,
  };
}
