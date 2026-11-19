import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GroupRole, MembershipStatus, ShareScope, type Prisma } from '@fatia/db';
import { assertDay } from '../common/dates';
import { PrismaService } from '../common/prisma.service';
import { NutritionSummaryService } from '../nutrition/nutrition-summary.service';
import {
  addDaysIso,
  dateInTz,
  dayBoundsInTz,
  todayInTz,
  weekStartInTz,
} from '../progress/helpers/date-tz';
import { ProgressService } from '../progress/progress.service';
import { MAX_AGENDA_DAYS } from '../workout/agenda.service';
import { planEndDate, plannedState, scheduleDates } from '../workout/helpers/planned-schedule';
import { MEMBER_NOT_FOUND, resolveMemberTarget, type MemberFileTarget } from './member-file-target';
import type {
  MemberAccessEntry,
  MemberAgenda,
  MemberAgendaItem,
  MemberFile,
  MemberNutritionPlan,
  MemberPlanStatus,
  MemberWeek,
  MemberWorkoutPlan,
} from './member-file.types';
import { MemberNoteService } from './member-note.service';
import { can, TEAM_ROLES } from './permissions';
import { ProfessionalAccessService } from './professional-access.service';

/** Nome da operação na trilha da pessoa: é o que ela lê em "Quem olhou seus dados". */
const FILE_ACTION = 'get_member_file';
/** A linha de abertura da ficha, sem categoria. */
const OPEN_ACTION = 'open_member_file';
const AGENDA_ACTION = 'get_member_agenda';
/** Linhas do "Histórico de acesso à ficha". */
const ACCESS_LOG_SIZE = 10;
/** Janela do "Corpo" do resumo. */
const BODY_DAYS = 60;
/** Meta de treinos por semana de quem não definiu (o padrão de `UserGoals`). */
const DEFAULT_WEEKLY_WORKOUTS = 3;

const OFFER_SELECT = {
  id: true,
  authorId: true,
  position: true,
  sourceTemplateId: true,
  endedAt: true,
  createdAt: true,
  author: { select: { name: true } },
  versions: { orderBy: { version: 'asc' } },
  plans: { select: { id: true, userId: true } },
} satisfies Prisma.PlanOfferSelect;

type OfferRow = Prisma.PlanOfferGetPayload<{ select: typeof OFFER_SELECT }>;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * A ficha da pessoa no painel (#402, Pn-05).
 *
 * Duas camadas, como no resto do compartilhamento:
 *
 * - O que é **da equipe** (planos que ela mandou, anotações, agenda planejada,
 *   quem abriu a ficha) sai com `member.file` no papel e a pessoa amarrada ao
 *   `:groupId` da URL.
 * - O que é **dado de saúde** sai só da categoria que a pessoa liberou para
 *   QUEM OLHA, e cada categoria lida passa pela porta única
 *   (`ProfessionalAccessService.assertReadable`), que grava a linha na trilha
 *   dela. Categoria não liberada não é lida nem tentada: nada de resumo, nada
 *   de número.
 */
@Injectable()
export class MemberFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProfessionalAccessService,
    private readonly nutrition: NutritionSummaryService,
    private readonly progress: ProgressService,
    private readonly notes: MemberNoteService,
  ) {}

  async file(viewerId: string, groupId: string, membershipId: string): Promise<MemberFile> {
    const target = await resolveMemberTarget(
      this.prisma,
      viewerId,
      groupId,
      membershipId,
      'member.file',
    );
    const subjectId = target.subjectUserId;
    const [user, links, seat, team] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: subjectId },
        select: { name: true, timezone: true, plansOrderedAt: true },
      }),
      this.prisma.professionalLink.findMany({
        where: { subjectUserId: subjectId, groupId, revokedAt: null },
        select: { professionalId: true, scopes: true, professional: { select: { name: true } } },
      }),
      this.prisma.groupSeatAssignment.findFirst({
        where: { membershipId, revokedAt: null },
        select: { id: true },
      }),
      this.prisma.groupMembership.findMany({
        where: { groupId, role: { in: [...TEAM_ROLES] } },
        select: { userId: true, status: true },
      }),
    ]);
    if (!user) throw new NotFoundException(MEMBER_NOT_FOUND);
    const ctx = { userId: subjectId, timezone: user.timezone };
    const today = todayInTz(ctx.timezone);

    const activeTeam = new Set(
      team.filter((m) => m.status === MembershipStatus.ACTIVE).map((m) => m.userId),
    );
    const mine = links.find((l) => l.professionalId === viewerId);
    const granted = mine?.scopes ?? [];

    // "Tudo fica no histórico de acesso da Ana": a abertura vira uma linha, e
    // cada categoria que a ficha tenta mostrar passa pela porta única, liberada
    // ou não. A trancada vira tentativa negada, e nada dela é lido.
    await this.access.recordFileOpen(viewerId, membershipId, OPEN_ACTION);
    const read = (scope: ShareScope) => this.tryRead(viewerId, membershipId, scope, FILE_ACTION);
    const canWorkout = await read(ShareScope.WORKOUT);
    const canNutrition = await read(ShareScope.NUTRITION);
    const canBody = await read(ShareScope.BODY);

    const goals =
      canWorkout || canNutrition
        ? await this.prisma.userGoals.findUnique({ where: { userId: subjectId } })
        : null;
    const week: MemberWeek = {
      workouts: canWorkout
        ? {
            done: await this.prisma.workoutSession.count({
              where: {
                userId: subjectId,
                completedAt: {
                  gte: dayBoundsInTz(weekStartInTz(new Date(), ctx.timezone), ctx.timezone).start,
                },
              },
            }),
            target: goals?.weeklyWorkouts ?? DEFAULT_WEEKLY_WORKOUTS,
          }
        : null,
      nutrition: canNutrition ? await this.nutritionWeek(ctx, goals) : null,
      body: canBody ? await this.bodySummary(ctx) : null,
    };

    const [workout, nutrition, nextDays, notes, accessLog] = await Promise.all([
      this.workoutPlans(viewerId, target, groupId, today, canWorkout),
      this.nutritionPlans(subjectId, groupId),
      this.agendaDays(subjectId, ctx.timezone, groupId, today, addDaysIso(today, 6), {
        done: canWorkout,
        weighins: false,
      }),
      this.notes.listFor(viewerId, target.viewerRole, groupId, subjectId),
      this.accessLog(viewerId, subjectId, groupId),
    ]);

    return {
      membershipId,
      groupId,
      name: user.name,
      role: target.subjectRole,
      joinedAt: target.joinedAt,
      timezone: ctx.timezone,
      proByGroup: seat !== null,
      followedBy: links
        .filter((l) => activeTeam.has(l.professionalId))
        .map((l) => l.professional.name)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
      grantedToMe: granted,
      canSendPlans:
        target.subjectRole === GroupRole.MEMBER &&
        mine !== undefined &&
        can(target.viewerRole, 'member.plans'),
      canManagePlans: can(target.viewerRole, 'member.plans'),
      canWriteNotes: can(target.viewerRole, 'member.note'),
      plans: { workout, nutrition, reorderedBySubject: user.plansOrderedAt !== null },
      week,
      nextDays,
      notes,
      accessLog,
    };
  }

  /**
   * A agenda da pessoa na ficha (Pn-05d): o treino planejado dos planos que
   * esta comunidade mandou, sem reserva nem presença (ADR 042). "Feito" e "não
   * feito" só com Treino liberado; a pesagem só com Corpo. Cada categoria lida
   * entra na trilha.
   */
  async agenda(
    viewerId: string,
    groupId: string,
    membershipId: string,
    from?: string,
    to?: string,
  ): Promise<MemberAgenda> {
    const target = await resolveMemberTarget(
      this.prisma,
      viewerId,
      groupId,
      membershipId,
      'member.file',
    );
    const user = await this.prisma.user.findUnique({
      where: { id: target.subjectUserId },
      select: { timezone: true },
    });
    if (!user) throw new NotFoundException(MEMBER_NOT_FOUND);
    const tz = user.timezone;
    const start = from ? assertDay(from, 'from') : weekStartInTz(new Date(), tz);
    const end = to ? assertDay(to, 'to') : addDaysIso(start, 6);
    if (end < start) throw new BadRequestException('O fim vem depois do começo.');
    if (daysBetween(start, end) + 1 > MAX_AGENDA_DAYS) {
      throw new BadRequestException(`A agenda mostra até ${MAX_AGENDA_DAYS} dias por vez.`);
    }

    const read = (scope: ShareScope) => this.tryRead(viewerId, membershipId, scope, AGENDA_ACTION);
    const done = await read(ShareScope.WORKOUT);
    const weighins = await read(ShareScope.BODY);

    return {
      today: todayInTz(tz),
      from: start,
      to: end,
      timezone: tz,
      showsDone: done,
      showsWeighins: weighins,
      days: await this.agendaDays(target.subjectUserId, tz, groupId, start, end, {
        done,
        weighins,
      }),
    };
  }

  // ---------------------------------------------------------------- internos

  /** Uma categoria pela porta única: `true` se liberada; a negada fica na trilha. */
  private async tryRead(
    viewerId: string,
    membershipId: string,
    scope: ShareScope,
    action: string,
  ): Promise<boolean> {
    try {
      await this.access.assertReadable(viewerId, membershipId, scope, action);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  private async nutritionWeek(
    ctx: { userId: string; timezone: string },
    goals: { kcalMin: number; kcalMax: number; proteinMinG: number } | null,
  ): Promise<NonNullable<MemberWeek['nutrition']>> {
    const history = await this.nutrition.getHistory(ctx.userId, 7, ctx.timezone);
    const logged = history.series.filter((d) => d.meals > 0);
    const kcal = logged.reduce((sum, d) => sum + d.kcal, 0);
    return {
      kcalAvg: logged.length > 0 ? Math.round(kcal / logged.length) : null,
      daysLogged: logged.length,
      kcalMin: goals?.kcalMin ?? null,
      kcalMax: goals?.kcalMax ?? null,
      proteinMinG: goals?.proteinMinG ?? null,
      proteinDays: goals ? logged.filter((d) => d.proteinG >= goals.proteinMinG).length : null,
    };
  }

  private async bodySummary(ctx: {
    userId: string;
    timezone: string;
  }): Promise<NonNullable<MemberWeek['body']>> {
    const w = await this.progress.weightProgress(BODY_DAYS, ctx);
    return {
      currentWeightKg: w.currentWeightKg,
      deltaKg: Math.round(w.totalDeltaKg * 10) / 10,
      sinceDays: BODY_DAYS,
    };
  }

  private async workoutPlans(
    viewerId: string,
    target: MemberFileTarget,
    groupId: string,
    today: string,
    canWorkout: boolean,
  ): Promise<MemberWorkoutPlan[]> {
    const offers = await this.prisma.planOffer.findMany({
      where: { userId: target.subjectUserId, groupId, removedAt: null },
      select: OFFER_SELECT,
      orderBy: [{ position: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    const copies = offers.flatMap((o) =>
      o.plans.filter((p) => p.userId === target.subjectUserId).map((p) => p.id),
    );
    const [planned, done] = await Promise.all([
      this.prisma.plannedSession.groupBy({
        by: ['planId'],
        where: { userId: target.subjectUserId, planId: { in: copies } },
        _count: { _all: true },
      }),
      // Sessões feitas são dado de Treino: só com a categoria liberada.
      canWorkout
        ? this.prisma.workoutSession.groupBy({
            by: ['planId'],
            where: {
              userId: target.subjectUserId,
              planId: { in: copies },
              completedAt: { not: null },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);
    const plannedOf = new Map(planned.map((p) => [p.planId, p._count._all]));
    const doneOf = new Map(done.map((d) => [d.planId, d._count._all]));
    return offers
      .filter((o) => o.versions.length > 0)
      .map((o) => {
        const copy = o.plans.find((p) => p.userId === target.subjectUserId)?.id ?? null;
        return this.planView(o, viewerId, target.viewerRole, today, {
          planned: copy ? (plannedOf.get(copy) ?? null) : null,
          done: canWorkout && copy ? (doneOf.get(copy) ?? 0) : null,
        });
      });
  }

  private planView(
    o: OfferRow,
    viewerId: string,
    viewerRole: GroupRole,
    today: string,
    counts: { planned: number | null; done: number | null },
  ): MemberWorkoutPlan {
    const latest = o.versions.at(-1)!;
    const accepted = o.versions.filter((v) => v.status === 'ACCEPTED').at(-1) ?? null;
    const shown = accepted ?? latest;
    const endDate =
      shown.schedule === 'CALENDAR' && shown.startDate && shown.weeks
        ? planEndDate(shown.startDate, shown.weeks)
        : null;

    let status: MemberPlanStatus;
    if (o.endedAt) status = 'ENDED';
    else if (accepted) {
      if (endDate && endDate < today) status = 'ENDED';
      else if (shown.startDate && shown.schedule === 'CALENDAR' && shown.startDate > today) {
        status = 'SCHEDULED';
      } else status = 'ACTIVE';
    } else if (latest.status === 'PENDING') status = 'PENDING';
    else if (latest.status === 'DECLINED') status = 'DECLINED';
    // Substituída sem nunca ter sido aceita (a pessoa saiu e voltou, por exemplo).
    else status = 'ENDED';

    const running =
      status === 'ACTIVE' && shown.schedule === 'CALENDAR' && shown.startDate && shown.weeks;
    return {
      offerId: o.id,
      title: shown.title,
      status,
      updatePending: accepted !== null && latest.status === 'PENDING' && latest.id !== accepted.id,
      version: shown.version,
      schedule: shown.schedule,
      startDate: shown.startDate,
      endDate,
      weeks: shown.weeks,
      weekNumber: running
        ? Math.min(Math.floor(daysBetween(shown.startDate!, today) / 7) + 1, shown.weeks!)
        : null,
      sessionsDone: counts.done,
      sessionsPlanned: counts.planned,
      authorName: o.author?.name ?? null,
      canRemove:
        can(viewerRole, 'member.plans') &&
        (o.authorId === viewerId || viewerRole === GroupRole.OWNER),
      sentAt: latest.sentAt,
      note: shown.note,
      sourceTemplateId: o.sourceTemplateId,
      position: o.position,
    };
  }

  /** Planos alimentares que esta comunidade mandou (#376): o em uso e o que espera aceite. */
  private async nutritionPlans(subjectId: string, groupId: string): Promise<MemberNutritionPlan[]> {
    const rows = await this.prisma.nutritionPlan.findMany({
      where: { userId: subjectId, groupId, status: { in: ['SENT', 'ACCEPTED'] } },
      select: {
        id: true,
        status: true,
        version: true,
        kcalMin: true,
        kcalMax: true,
        sentAt: true,
        acceptedAt: true,
        author: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { sentAt: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.author
        ? `Plano alimentar de ${r.author.name.split(' ')[0]} · v${r.version}`
        : `Plano alimentar · v${r.version}`,
      status: r.status,
      version: r.version,
      kcalMin: r.kcalMin,
      kcalMax: r.kcalMax,
      authorName: r.author?.name ?? null,
      sentAt: r.sentAt,
      acceptedAt: r.acceptedAt,
    }));
  }

  private async agendaDays(
    userId: string,
    tz: string,
    groupId: string,
    start: string,
    end: string,
    show: { done: boolean; weighins: boolean },
  ): Promise<MemberAgenda['days']> {
    const today = todayInTz(tz);
    // Com Treino liberado, a agenda é a da cópia dela (nome e dias remarcados).
    // Sem, só o que a equipe mandou: título e dias calculados da versão aceita,
    // nunca o nome nem os dias da cópia, que são dado de Treino dela.
    const sessions = show.done
      ? (
          await this.prisma.plannedSession.findMany({
            where: {
              userId,
              date: { gte: start, lte: end },
              // Só o que esta comunidade planejou: plano de outra academia não aparece.
              plan: { is: { userId, fromOffer: { is: { groupId } } } },
            },
            include: { plan: { select: { name: true } } },
            orderBy: [{ date: 'asc' }, { order: 'asc' }],
          })
        ).map((s) => ({ date: s.date, planId: s.planId, title: s.plan.name, order: s.order }))
      : await this.versionSessions(userId, tz, groupId, start, end);
    const range = { gte: dayBoundsInTz(start, tz).start, lt: dayBoundsInTz(end, tz).end };
    const doneKeys = new Set<string>();
    if (show.done && sessions.length > 0) {
      const finished = await this.prisma.workoutSession.findMany({
        where: {
          userId,
          planId: { in: [...new Set(sessions.map((s) => s.planId!))] },
          completedAt: range,
        },
        select: { planId: true, completedAt: true },
      });
      for (const f of finished) doneKeys.add(`${f.planId}|${dateInTz(f.completedAt!, tz)}`);
    }
    const weights = new Map<string, number>();
    if (show.weighins) {
      const logs = await this.prisma.weightLog.findMany({
        where: { userId, loggedAt: range },
        orderBy: { loggedAt: 'asc' },
        select: { weightKg: true, loggedAt: true },
      });
      for (const l of logs) weights.set(dateInTz(l.loggedAt, tz), l.weightKg);
    }

    const days: MemberAgenda['days'] = [];
    for (let date = start; date <= end; date = addDaysIso(date, 1)) {
      const items: MemberAgendaItem[] = sessions
        .filter((s) => s.date === date)
        .map((s) => ({
          kind: 'planned' as const,
          title: s.title,
          // Sem Treino liberado, todo dia é só "planejado": "não feito" diria
          // o que a pessoa não fez.
          state: show.done
            ? plannedState(s.date, today, doneKeys.has(`${s.planId}|${s.date}`))
            : 'planned',
          weightKg: null,
          planOrder: s.order,
        }));
      const kg = weights.get(date);
      if (kg !== undefined) {
        items.push({
          kind: 'weighin',
          title: 'Pesagem',
          state: null,
          weightKg: kg,
          planOrder: null,
        });
      }
      days.push({ date, items });
    }
    return days;
  }

  /**
   * Os dias que a equipe planejou, pela versão aceita de cada oferta desta
   * comunidade (#402): o que a ficha mostra sem Treino liberado. Terminada
   * para no dia em que terminou; apagada não aparece.
   */
  private async versionSessions(
    userId: string,
    tz: string,
    groupId: string,
    start: string,
    end: string,
  ): Promise<Array<{ date: string; planId: null; title: string; order: number }>> {
    const offers = await this.prisma.planOffer.findMany({
      where: { userId, groupId, removedAt: null, versions: { some: { status: 'ACCEPTED' } } },
      select: {
        endedAt: true,
        versions: {
          where: { status: 'ACCEPTED', schedule: 'CALENDAR' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { title: true, startDate: true, weeks: true, weekdays: true },
        },
      },
      orderBy: [{ position: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    const rows: Array<{ date: string; planId: null; title: string; order: number }> = [];
    for (const o of offers) {
      const v = o.versions[0];
      if (!v?.startDate || !v.weeks) continue;
      const endedOn = o.endedAt ? dateInTz(o.endedAt, tz) : null;
      scheduleDates({ startDate: v.startDate, weeks: v.weeks, weekdays: v.weekdays }).forEach(
        (date, i) => {
          if (date < start || date > end || (endedOn && date > endedOn)) return;
          rows.push({ date, planId: null, title: v.title, order: i + 1 });
        },
      );
    }
    return rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  }

  /**
   * "Histórico de acesso à ficha": as leituras da equipe desta comunidade,
   * inclusive as negadas (que não têm vínculo, então são achadas pela equipe).
   */
  private async accessLog(
    viewerId: string,
    subjectId: string,
    groupId: string,
  ): Promise<MemberAccessEntry[]> {
    // Só o que aconteceu NESTA comunidade, pela coluna gravada na leitura. A
    // linha antiga, sem comunidade, fica fora: não dá para saber de onde veio.
    const rows = await this.prisma.professionalAccessLog.findMany({
      where: { subjectUserId: subjectId, groupId },
      orderBy: { at: 'desc' },
      take: ACCESS_LOG_SIZE,
      select: { at: true, scope: true, action: true, denied: true, professionalId: true },
    });
    const names = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.professionalId))] } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name]),
    );
    return rows.map((r) => ({
      at: r.at,
      scope: r.scope,
      action: r.action,
      denied: r.denied,
      professionalName: names.get(r.professionalId) ?? null,
      isMe: r.professionalId === viewerId,
    }));
  }
}
