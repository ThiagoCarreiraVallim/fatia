import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { assertDay } from '../common/dates';
import {
  addDaysIso,
  dateInTz,
  dayBoundsInTz,
  todayInTz,
  weekStartInTz,
} from '../progress/helpers/date-tz';
import {
  assertRescheduleDate,
  planEndDate,
  plannedState,
  type PlannedState,
} from './helpers/planned-schedule';

/** O intervalo mais longo que a agenda devolve: a grade do mês tem seis semanas. */
export const MAX_AGENDA_DAYS = 42;
/** Por quanto tempo o "plano terminou" (Al-T24c) fica na agenda depois do fim. */
const ENDED_VISIBLE_DAYS = 28;

const SESSION_NOT_FOUND = 'Planned session not found';
const NO_DATES = 'Esse plano não tem mais datas para remarcar.';
const ALREADY_DONE = 'Essa sessão já foi feita. Só dá para remarcar o que não foi feito.';

export interface AgendaItem {
  /** Id da sessão planejada; na próxima sessão do plano flexível, `next:<planId>`. */
  id: string;
  /** `planned`: sessão do plano de calendário. `next`: a próxima do flexível. */
  kind: 'planned' | 'next';
  planId: string;
  planName: string;
  /** 1, 2, 3… na ordem do plano. Nulo na próxima do flexível. */
  order: number | null;
  state: PlannedState;
  /** O dia de antes, quando a pessoa remarcou. */
  rescheduledFrom: string | null;
  /** Remarcar vale para o que não foi feito, até o fim do plano. */
  canReschedule: boolean;
  /** Último dia do plano: o limite do "Remarcar". */
  endDate: string | null;
}

export interface AgendaView {
  today: string;
  from: string;
  to: string;
  days: Array<{ date: string; items: AgendaItem[] }>;
  /** O plano de calendário em andamento hoje: "Inferior · semana 3 de 4". */
  calendarPlan: {
    planId: string;
    planName: string;
    authorName: string | null;
    weekNumber: number;
    weeksTotal: number;
    startDate: string;
    endDate: string;
  } | null;
  /** Planos flexíveis aceitos: só a próxima sessão aparece, no dia de hoje. */
  flexible: Array<{ planId: string; planName: string }>;
  /** O plano de calendário que terminou há pouco (Al-T24c), quando não há outro. */
  ended: {
    planId: string;
    planName: string;
    authorName: string | null;
    done: number;
    total: number;
    weeks: number;
  } | null;
  /** Nada planejado (Al-T24b). */
  empty: boolean;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * A agenda de treinos do aluno (#379, Al-T24). Informativa (ADR 042): não há
 * reserva nem presença. As linhas nascem do aceite de um plano de calendário
 * (`PlanOfferService.accept`); "feito" e "não feito" são lidos aqui, do treino
 * concluído do mesmo plano no mesmo dia, e nunca gravados.
 *
 * Tudo parte do `userId` de quem pede: sessão de outra pessoa responde como
 * inexistente.
 */
@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  async range(userId: string, timezone: string, from?: string, to?: string): Promise<AgendaView> {
    const today = todayInTz(timezone);
    const start = from ? assertDay(from, 'from') : weekStartInTz(new Date(), timezone);
    const end = to ? assertDay(to, 'to') : addDaysIso(start, 6);
    if (end < start) throw new BadRequestException('O fim vem depois do começo.');
    if (daysBetween(start, end) + 1 > MAX_AGENDA_DAYS) {
      throw new BadRequestException(`A agenda mostra até ${MAX_AGENDA_DAYS} dias por vez.`);
    }

    const plans = await this.acceptedPlans(userId, timezone);
    const flexible = await this.nextSessions(
      userId,
      plans.filter((p) => p.schedule === 'FLEXIBLE'),
    );
    const sessions = await this.prisma.plannedSession.findMany({
      where: { userId, date: { gte: start, lte: end } },
      include: { plan: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { order: 'asc' }],
    });
    const done = await this.doneDays(
      userId,
      timezone,
      [...new Set([...sessions.map((s) => s.planId), ...flexible.map((p) => p.planId)])],
      start,
      end,
    );
    // Um plano por sessão (#406): todas as sessões do plano têm o mesmo fim.
    const endOf = new Map(plans.flatMap((p) => p.planIds.map((id) => [id, p.endDate] as const)));

    const days = [];
    for (let date = start; date <= end; date = addDaysIso(date, 1)) {
      const items: AgendaItem[] = sessions
        .filter((s) => s.date === date)
        .map((s) => {
          const state = plannedState(s.date, today, done.has(`${s.planId}|${s.date}`));
          return {
            id: s.id,
            kind: 'planned' as const,
            planId: s.planId,
            planName: s.plan.name,
            order: s.order,
            state,
            rescheduledFrom: s.originalDate,
            // Sem fim de calendário aceito (virou flexível), não há até quando remarcar.
            canReschedule: state !== 'done' && (endOf.get(s.planId) ?? '') >= today,
            endDate: endOf.get(s.planId) ?? null,
          };
        });
      if (date === today) {
        for (const p of flexible) {
          items.push({
            id: `next:${p.planId}`,
            kind: 'next',
            planId: p.planId,
            planName: p.planName,
            order: null,
            state: done.has(`${p.planId}|${today}`) ? 'done' : 'today',
            rescheduledFrom: null,
            canReschedule: false,
            endDate: null,
          });
        }
      }
      days.push({ date, items });
    }

    const calendar = plans
      .filter((p) => p.schedule === 'CALENDAR' && p.startDate && p.endDate)
      .sort((a, b) => (a.startDate! < b.startDate! ? 1 : -1));
    const current =
      calendar.find((p) => !p.ended && p.startDate! <= today && today <= p.endDate!) ?? null;
    const calendarPlan = current
      ? {
          planId: current.planId,
          planName: current.planName,
          authorName: current.authorName,
          weekNumber: Math.floor(daysBetween(current.startDate!, today) / 7) + 1,
          weeksTotal: current.weeks!,
          startDate: current.startDate!,
          endDate: current.endDate!,
        }
      : null;
    const upcoming = calendar.some((p) => !p.ended && p.startDate! > today);
    const last =
      !current && !upcoming
        ? (calendar.find(
            (p) =>
              (p.ended ? p.endDate! <= today : p.endDate! < today) &&
              daysBetween(p.endDate!, today) <= ENDED_VISIBLE_DAYS,
          ) ?? null)
        : null;
    const ended = last ? await this.endedSummary(userId, timezone, last) : null;
    const hasItems = days.some((d) => d.items.length > 0);

    return {
      today,
      from: start,
      to: end,
      days,
      calendarPlan,
      flexible: flexible.map((p) => ({ planId: p.planId, planName: p.planName })),
      ended,
      empty: !hasItems && !calendarPlan && !ended && !upcoming,
    };
  }

  /**
   * "Remarcar" (decisão do dono, #379): qualquer dia de hoje até o fim do
   * plano. Guarda o dia original na primeira remarcação. Não reserva nada.
   *
   * O fim é o da versão aceita **agora** para o plano, não o da versão que
   * gerou a sessão: a sessão que passou fica com a versão antiga quando a
   * pessoa aceita uma nova. Sem versão aceita de calendário, não há até quando
   * remarcar (409). Sessão já feita também não se remarca (409).
   */
  async reschedule(userId: string, timezone: string, id: string, date: string) {
    const day = assertDay(date, 'date');
    const session = await this.prisma.plannedSession.findFirst({
      where: { id, userId },
      include: { plan: { select: { name: true } } },
    });
    if (!session) throw new NotFoundException(SESSION_NOT_FOUND);
    const accepted = (await this.acceptedPlans(userId, timezone)).find((p) =>
      p.planIds.includes(session.planId),
    );
    if (!accepted || accepted.schedule !== 'CALENDAR' || !accepted.endDate) {
      throw new ConflictException(NO_DATES);
    }
    const endDate = accepted.endDate;
    const done = await this.doneDays(
      userId,
      timezone,
      [session.planId],
      session.date,
      session.date,
    );
    if (done.has(`${session.planId}|${session.date}`)) throw new ConflictException(ALREADY_DONE);
    assertRescheduleDate({ date: day, today: todayInTz(timezone), endDate });
    const updated = await this.prisma.plannedSession.update({
      where: { id: session.id },
      data: {
        date: day,
        status: 'RESCHEDULED',
        originalDate: session.originalDate ?? session.date,
      },
    });
    return {
      id: updated.id,
      planId: updated.planId,
      planName: session.plan.name,
      date: updated.date,
      rescheduledFrom: updated.originalDate,
      endDate,
    };
  }

  /** Os planos da pessoa que vieram de uma oferta aceita, com a agenda da versão em uso. */
  private async acceptedPlans(userId: string, timezone: string) {
    const offers = await this.prisma.planOffer.findMany({
      where: { userId, removedAt: null, versions: { some: { status: 'ACCEPTED' } } },
      include: {
        author: { select: { name: true } },
        // A de maior número: uma falha antiga pode ter deixado outra aceita para trás.
        versions: { where: { status: 'ACCEPTED' }, orderBy: { version: 'desc' }, take: 1 },
        plans: {
          where: { userId },
          select: { id: true, name: true },
          orderBy: { sessionIndex: { sort: 'asc', nulls: 'first' } },
        },
      },
    });
    return offers.flatMap((offer) => {
      const version = offer.versions[0];
      const plan = offer.plans[0];
      if (!version || !plan) return [];
      // Mais de uma sessão (#406): o plano se chama pelo título da versão, e
      // cada sessão é um plano na conta da pessoa.
      const multi = offer.plans.length > 1;
      const planned =
        version.startDate && version.weeks ? planEndDate(version.startDate, version.weeks) : null;
      // "Terminar hoje" na ficha (#402): o plano acaba no dia em que a equipe
      // terminou, e não aparece mais como vigente.
      const endedOn = offer.endedAt ? dateInTz(offer.endedAt, timezone) : null;
      return [
        {
          planId: plan.id,
          planName: multi ? version.title : plan.name,
          planIds: offer.plans.map((p) => p.id),
          sessionPlans: offer.plans,
          authorName: offer.author?.name ?? null,
          schedule: version.schedule,
          startDate: version.startDate,
          weeks: version.weeks,
          endDate: planned && endedOn && endedOn < planned ? endedOn : planned,
          ended: endedOn !== null,
        },
      ];
    });
  }

  /**
   * A próxima sessão de cada plano flexível: com várias sessões (#406), a que
   * vem depois da última feita, em rodízio; sem nada feito, a primeira.
   */
  private async nextSessions(
    userId: string,
    plans: Array<{ sessionPlans: Array<{ id: string; name: string }> }>,
  ): Promise<Array<{ planId: string; planName: string }>> {
    const multi = plans.filter((p) => p.sessionPlans.length > 1);
    const last = multi.length
      ? await this.prisma.workoutSession.findMany({
          where: {
            userId,
            completedAt: { not: null },
            planId: { in: multi.flatMap((p) => p.sessionPlans.map((s) => s.id)) },
          },
          orderBy: { completedAt: 'desc' },
          distinct: ['planId'],
          select: { planId: true, completedAt: true },
        })
      : [];
    return plans.map(({ sessionPlans }) => {
      let next = sessionPlans[0]!;
      if (sessionPlans.length > 1) {
        const ids = sessionPlans.map((s) => s.id);
        const latest = last
          .filter((r) => r.planId && ids.includes(r.planId))
          .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0];
        if (latest) next = sessionPlans[(ids.indexOf(latest.planId!) + 1) % ids.length]!;
      }
      return { planId: next.id, planName: next.name };
    });
  }

  /** `planId|YYYY-MM-DD` dos dias com treino concluído daquele plano. */
  private async doneDays(
    userId: string,
    timezone: string,
    planIds: string[],
    from: string,
    to: string,
  ): Promise<Set<string>> {
    if (planIds.length === 0) return new Set();
    const rows = await this.prisma.workoutSession.findMany({
      where: {
        userId,
        planId: { in: planIds },
        completedAt: {
          not: null,
          gte: dayBoundsInTz(from, timezone).start,
          lt: dayBoundsInTz(to, timezone).end,
        },
      },
      select: { planId: true, completedAt: true },
    });
    return new Set(rows.map((r) => `${r.planId}|${dateInTz(r.completedAt!, timezone)}`));
  }

  private async endedSummary(
    userId: string,
    timezone: string,
    plan: {
      planId: string;
      planIds: string[];
      planName: string;
      authorName: string | null;
      weeks: number | null;
    },
  ) {
    const sessions = await this.prisma.plannedSession.findMany({
      where: { userId, planId: { in: plan.planIds } },
      select: { date: true, planId: true },
      orderBy: { date: 'asc' },
    });
    if (sessions.length === 0) return null;
    const done = await this.doneDays(
      userId,
      timezone,
      plan.planIds,
      sessions[0]!.date,
      sessions.at(-1)!.date,
    );
    return {
      planId: plan.planId,
      planName: plan.planName,
      authorName: plan.authorName,
      done: sessions.filter((s) => done.has(`${s.planId}|${s.date}`)).length,
      total: sessions.length,
      weeks: plan.weeks ?? 0,
    };
  }
}
