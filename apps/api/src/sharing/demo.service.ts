import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ChallengeKind,
  ChallengeMetric,
  GroupRole,
  GroupType,
  GroupVisibility,
  JoinPolicy,
  MembershipStatus,
  PlanOfferStatus,
  PlanSchedule,
  type Prisma,
} from '@fatia/db';
import { DEFAULT_BRAND } from '@fatia/design';
import { DemoSessionService } from '../auth/demo-session.service';
import { DEMO_EMAIL_DOMAIN, DEMO_SUB_PREFIX } from '../common/demo';
import { PrismaService } from '../common/prisma.service';
import { demoStudentPurge } from '../common/workout-purge';
import { addDaysIso, dayBoundsInTz, todayInTz } from '../progress/helpers/date-tz';
import { COMMUNITY_ACTIVE_MIN_MEMBERS, isCommunityActive } from './community-active';
import {
  at,
  DEMO_BRAND_COLORS,
  DEMO_CHALLENGE_TITLE,
  DEMO_EXERCISES,
  DEMO_GOALS,
  DEMO_GROUP_NAME,
  DEMO_MEALS_TODAY,
  DEMO_PLAN_TITLE,
  DEMO_PLAN_WEEKDAYS,
  DEMO_PLAN_WEEKS,
  DEMO_SCOPES,
  DEMO_STUDENT_DISPLAY,
  DEMO_STUDENT_NAME,
  DEMO_WEIGHTS,
  demoAgenda,
  demoClock,
  demoDoneDays,
  demoPastMeals,
  demoPlanSnapshot,
  earlierToday,
  type DemoClock,
} from './demo-seed';
import { GROUP_DELETION_HOOKS, type GroupDeletionHook } from './group-deletion.hook';
import { PlanMaterializerService } from './plan-materializer.service';
import { offerState } from './plan-offer-state';

export interface DemoSummary {
  groupId: string;
  name: string;
  brandColor: string;
  createdAt: Date;
  student: { userId: string; membershipId: string; name: string; joinedAt: Date | null };
  plan: {
    title: string;
    weekNumber: number;
    weeks: number;
    sessionsDone: number;
    sessionsPlanned: number;
  } | null;
  weight: { kg: number; loggedAt: Date; deltaKg: number | null } | null;
  today: { kcal: number; kcalGoal: number | null; waterMl: number; waterGoalMl: number };
  challenge: { id: string; title: string } | null;
}

export interface DemoState {
  demo: DemoSummary | null;
  /** Quem é dona de uma comunidade de verdade cria a demo. */
  canCreate: boolean;
  /** A comunidade de verdade para onde "Sair da demo" volta. */
  homeGroupId: string | null;
}

export interface FirstSteps {
  active: boolean;
  activeMembers: number;
  threshold: number;
}

const DEMO_NOT_FOUND = 'Demonstração não encontrada';

/**
 * A comunidade de demonstração (#412, Pn-21 a Pn-21d).
 *
 * Uma por dona (`Group.demoOwnerId` é único), com uma aluna fictícia (a Ana
 * Exemplo, `User.demoGroupId`) que sai junto quando a demo é apagada: a
 * cascata do banco leva a Ana, e a dela leva tudo o que é dela. O que a demo
 * **não** faz (cobrança, convite, aviso, e-mail, listagem pública) é barrado
 * onde cada coisa acontece; ver `docs/PERMISSIONS.md`.
 *
 * Quem cria é a dona de uma comunidade de verdade, e a demo fica com o fuso
 * dela: "hoje" na demo é o hoje da dona.
 */
@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: DemoSessionService,
    private readonly materializer: PlanMaterializerService,
    @Optional()
    @Inject(GROUP_DELETION_HOOKS)
    private readonly deletionHooks: GroupDeletionHook[] = [],
  ) {}

  async get(ownerId: string): Promise<DemoState> {
    const [home, group] = await Promise.all([
      this.homeGroup(ownerId),
      this.prisma.group.findUnique({
        where: { demoOwnerId: ownerId },
        include: { demoStudent: { select: { id: true, name: true, timezone: true } } },
      }),
    ]);
    return {
      demo:
        group?.isDemo && group.demoStudent ? await this.summary(group, group.demoStudent) : null,
      canCreate: home !== null,
      homeGroupId: home?.id ?? null,
    };
  }

  /**
   * Cria a demo, ou devolve a que já existe: dois cliques juntos dão uma só
   * (o segundo bate no `@unique` de `demoOwnerId`).
   */
  async create(ownerId: string): Promise<DemoState> {
    const home = await this.homeGroup(ownerId);
    if (!home) {
      throw new ForbiddenException('Só quem é dona de uma comunidade cria a demonstração');
    }
    if (await this.prisma.group.findUnique({ where: { demoOwnerId: ownerId } })) {
      return this.get(ownerId);
    }
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { timezone: true },
    });
    const clock = demoClock(new Date(), owner.timezone);
    const brandColor = await this.pickColor(ownerId);
    const suffix = randomUUID();

    let group: { id: string; demoStudent: { id: string } | null };
    try {
      group = await this.prisma.group.create({
        data: {
          type: GroupType.SOCIAL,
          name: DEMO_GROUP_NAME,
          slug: `demo-${suffix}`,
          ownerId,
          isDemo: true,
          demoOwnerId: ownerId,
          timezone: clock.timezone,
          visibility: GroupVisibility.PRIVATE,
          joinPolicy: JoinPolicy.INVITE_ONLY,
          reportEmailEnabled: false,
          brandColor,
          description: 'Comunidade de demonstração, com dados fictícios.',
          memberships: {
            create: {
              userId: ownerId,
              role: GroupRole.OWNER,
              status: MembershipStatus.ACTIVE,
              joinedAt: clock.now,
            },
          },
          demoStudent: {
            create: {
              name: DEMO_STUDENT_NAME,
              logtoSub: `${DEMO_SUB_PREFIX}${suffix}`,
              email: `ana-exemplo-${suffix}@${DEMO_EMAIL_DOMAIN}`,
              timezone: clock.timezone,
              heightCm: 165,
              onboardedAt: at(clock, addDaysIso(clock.today, -30), 9),
              whatsappOptIn: false,
            },
          },
        },
        select: { id: true, demoStudent: { select: { id: true } } },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') return this.get(ownerId);
      throw err;
    }

    try {
      await this.seed(group.id, ownerId, group.demoStudent!.id, clock);
    } catch (err) {
      // Demo pela metade não fica: apagar o grupo leva a Ana e o que já entrou.
      await this.purge(group.id, ownerId);
      throw err;
    }
    return this.get(ownerId);
  }

  /** Apaga a demo da dona. Apagar de novo devolve `removed: false`. */
  async remove(ownerId: string): Promise<{ removed: boolean }> {
    const group = await this.prisma.group.findUnique({
      where: { demoOwnerId: ownerId },
      select: { id: true, isDemo: true },
    });
    if (!group?.isDemo) return { removed: false };
    // Os mesmos ganchos de apagar comunidade: a dona pode ter posto capa ou
    // foto na demo, e o arquivo sai do armazenamento junto.
    for (const hook of this.deletionHooks ?? []) await hook.beforeDelete(group.id);
    return { removed: (await this.purge(group.id, ownerId)) > 0 };
  }

  /** A sessão curta "Abrir no app como Ana Exemplo" (só leitura, 30 minutos). */
  async openSession(ownerId: string): Promise<{ token: string; expiresAt: Date }> {
    const group = await this.prisma.group.findUnique({
      where: { demoOwnerId: ownerId },
      select: { id: true, isDemo: true, demoStudent: { select: { id: true } } },
    });
    if (!group?.isDemo || !group.demoStudent) throw new NotFoundException(DEMO_NOT_FOUND);
    return this.sessions.open({
      groupId: group.id,
      userId: group.demoStudent.id,
      createdById: ownerId,
    });
  }

  /**
   * "Primeiros passos" (Pn-21d): a comunidade de verdade da dona, com o
   * critério provisório de `community-active.ts`. A demo e a comunidade de
   * outra pessoa respondem como inexistentes.
   */
  async firstSteps(ownerId: string, groupId: string): Promise<FirstSteps> {
    const mine = await this.prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId: ownerId,
        role: GroupRole.OWNER,
        status: MembershipStatus.ACTIVE,
        group: { isDemo: false },
      },
      select: { id: true },
    });
    if (!mine) throw new NotFoundException('Group not found');
    const activeMembers = await this.prisma.groupMembership.count({
      where: { groupId, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
    });
    return {
      active: isCommunityActive(activeMembers),
      activeMembers,
      threshold: COMMUNITY_ACTIVE_MIN_MEMBERS,
    };
  }

  /**
   * Apaga a demo numa transação de lote: a Ana sai antes do grupo (a cascata
   * dela leva o resto do que é dela), e o grupo depois. Na ordem inversa, o
   * `SET NULL` de `PlanOffer.groupId` esbarra na oferta que a cascata da Ana
   * ainda não apagou.
   */
  private async purge(groupId: string, ownerId: string): Promise<number> {
    const results = await this.prisma.$transaction([
      ...demoStudentPurge(this.prisma, { demoGroupId: groupId }),
      this.prisma.group.deleteMany({ where: { id: groupId, demoOwnerId: ownerId, isDemo: true } }),
    ]);
    return (results.at(-1) as { count: number }).count;
  }

  /** A comunidade de verdade mais recente de que a pessoa é dona. */
  private async homeGroup(userId: string): Promise<{ id: string } | null> {
    const m = await this.prisma.groupMembership.findFirst({
      where: {
        userId,
        role: GroupRole.OWNER,
        status: MembershipStatus.ACTIVE,
        group: { isDemo: false },
      },
      orderBy: { createdAt: 'desc' },
      select: { groupId: true },
    });
    return m ? { id: m.groupId } : null;
  }

  /** A primeira cor da lista que nenhuma comunidade de verdade da dona usa. */
  private async pickColor(ownerId: string): Promise<string> {
    const owned = await this.prisma.group.findMany({
      where: { ownerId, isDemo: false },
      select: { brandColor: true },
    });
    const taken = new Set(owned.map((g) => (g.brandColor ?? DEFAULT_BRAND.color).toLowerCase()));
    return DEMO_BRAND_COLORS.find((c) => !taken.has(c)) ?? DEMO_BRAND_COLORS[0];
  }

  /**
   * Preenche a Ana. Sem `PlanOfferService.accept` de propósito: o aceite de
   * verdade avisa a equipe, e a semente não avisa ninguém.
   */
  private async seed(groupId: string, ownerId: string, anaId: string, clock: DemoClock) {
    const joinedAt = at(clock, addDaysIso(clock.today, -14), 10);
    const membership = await this.prisma.groupMembership.create({
      data: {
        groupId,
        userId: anaId,
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        joinedAt,
        consentScopes: DEMO_SCOPES,
        consentAt: joinedAt,
        statsOptIn: true,
        displayName: DEMO_STUDENT_DISPLAY,
      },
      select: { id: true },
    });

    const catalog = new Map(
      (
        await this.prisma.exercise.findMany({
          where: {
            name: { in: DEMO_EXERCISES.map((e) => e.name) },
            createdByUserId: null,
            groupOwned: false,
          },
          select: { id: true, name: true },
        })
      ).map((e) => [e.name, e.id]),
    );
    const snapshot = demoPlanSnapshot(catalog);
    const offerId = randomUUID();
    const versionId = randomUUID();
    const sentAt = at(clock, addDaysIso(clock.planStart, -2), 18);
    const { plans, writes } = await this.materializer.offerPlanWrites(
      anaId,
      snapshot,
      offerId,
      [],
      clock.today,
    );
    const planOf = (session: 0 | 1) =>
      [...plans].sort((a, b) => a.sessionIndex - b.sessionIndex)[session]!.id;

    await this.prisma.$transaction([
      this.prisma.userGoals.create({ data: { userId: anaId, ...DEMO_GOALS } }),
      this.prisma.professionalLink.create({
        data: {
          subjectUserId: anaId,
          professionalId: ownerId,
          groupId,
          scopes: DEMO_SCOPES,
          grantedAt: joinedAt,
        },
      }),
      this.prisma.planOffer.create({
        data: {
          id: offerId,
          userId: anaId,
          authorId: ownerId,
          groupId,
          position: 0,
          versions: {
            create: {
              id: versionId,
              version: 1,
              status: PlanOfferStatus.ACCEPTED,
              title: DEMO_PLAN_TITLE,
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
              snapshotVersion: snapshot.version,
              schedule: PlanSchedule.CALENDAR,
              startDate: clock.planStart,
              weeks: DEMO_PLAN_WEEKS,
              weekdays: DEMO_PLAN_WEEKDAYS,
              authorId: ownerId,
              sentAt,
              respondedAt: new Date(sentAt.getTime() + 3 * 3_600_000),
            },
          },
        },
      }),
      ...writes,
      this.prisma.plannedSession.createMany({
        data: demoAgenda(clock).map((d) => ({
          userId: anaId,
          planId: planOf(d.session),
          offerVersionId: versionId,
          date: d.date,
          order: d.order,
        })),
      }),
      this.prisma.weightLog.createMany({
        data: DEMO_WEIGHTS.map(([daysAgo, kg]) => ({
          userId: anaId,
          weightKg: kg,
          loggedAt: at(clock, addDaysIso(clock.today, -daysAgo), 7),
        })),
      }),
      this.prisma.waterLog.createMany({
        data: [
          ...[1, 2, 3, 4, 5, 6].flatMap((daysAgo) => {
            const date = addDaysIso(clock.today, -daysAgo);
            return [8, 13, 17, 21].map((hour) => ({
              userId: anaId,
              date,
              ml: 500,
              loggedAt: at(clock, date, hour),
            }));
          }),
          ...[8, 11, 14].map((hour, slot) => ({
            userId: anaId,
            date: clock.today,
            ml: 500,
            loggedAt: earlierToday(clock, hour, slot),
          })),
        ],
      }),
      this.prisma.groupChallenge.create({
        data: {
          groupId,
          authorId: ownerId,
          title: DEMO_CHALLENGE_TITLE,
          description: 'Treinar ou registrar o dia em 20 dos 30 dias.',
          kind: ChallengeKind.METRIC,
          metric: ChallengeMetric.ACTIVE_DAYS,
          startsAt: dayBoundsInTz(addDaysIso(clock.today, -14), clock.timezone).start,
          endsAt: dayBoundsInTz(addDaysIso(clock.today, 15), clock.timezone).end,
          timezone: clock.timezone,
          // Já "avisado": o aviso de início não sai para ninguém.
          startNotifiedAt: clock.now,
          participants: {
            create: {
              membershipId: membership.id,
              displayName: DEMO_STUDENT_DISPLAY,
              score: 12,
              streak: 4,
              joinedAt,
            },
          },
        },
      }),
    ]);

    // Refeições: uma escrita aninhada por refeição (os itens vão juntos).
    const meals = [
      ...DEMO_MEALS_TODAY.map((m, slot) => ({
        type: m.type,
        eatenAt: earlierToday(clock, m.hour, DEMO_MEALS_TODAY.length - slot),
        items: m.items,
      })),
      ...demoPastMeals(clock),
    ];
    // Treinos feitos, com as séries de cada exercício do plano.
    const planExercises = await this.prisma.workoutPlanExercise.findMany({
      where: { plan: { userId: anaId, fromOfferId: offerId } },
      select: { planId: true, exerciseId: true, targetSets: true, startLoadKg: true },
      orderBy: { order: 'asc' },
    });
    const done = demoDoneDays(clock);
    await this.prisma.$transaction([
      ...meals.map((m) =>
        this.prisma.meal.create({
          data: {
            userId: anaId,
            mealType: m.type,
            eatenAt: m.eatenAt,
            items: {
              create: m.items.map((f) => ({
                foodName: f.name,
                grams: f.grams,
                kcal: f.kcal,
                proteinG: f.proteinG,
                carbsG: f.carbsG,
                fatG: f.fatG,
              })),
            },
          },
        }),
      ),
      ...done.map((d, i) => {
        const planId = planOf(d.session);
        const startedAt = at(clock, d.date, 18);
        return this.prisma.workoutSession.create({
          data: {
            userId: anaId,
            planId,
            fromPlan: true,
            planName: d.session === 0 ? 'Treino A' : 'Treino B',
            startedAt,
            completedAt: new Date(startedAt.getTime() + 55 * 60_000),
            serverCompletedAt: new Date(startedAt.getTime() + 55 * 60_000),
            feeling: 4,
            sets: {
              create: planExercises
                .filter((e) => e.planId === planId)
                .flatMap((e) =>
                  Array.from({ length: e.targetSets }, (_, s) => ({
                    exerciseId: e.exerciseId,
                    setNumber: s + 1,
                    // A carga sobe um pouco do primeiro treino para o último.
                    weightKg: (e.startLoadKg ?? 0) + (done.length - 1 - i),
                    reps: 10,
                  })),
                ),
            },
          },
        });
      }),
    ]);
  }

  private async summary(
    group: { id: string; name: string; brandColor: string | null; createdAt: Date },
    ana: { id: string; name: string; timezone: string },
  ): Promise<DemoSummary> {
    const today = todayInTz(ana.timezone);
    const { start, end } = dayBoundsInTz(today, ana.timezone);
    const [membership, offer, weights, goals, items, water, challenge] = await Promise.all([
      this.prisma.groupMembership.findFirst({
        where: { groupId: group.id, userId: ana.id },
        select: { id: true, joinedAt: true },
      }),
      this.prisma.planOffer.findFirst({
        where: { userId: ana.id, groupId: group.id, removedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          endedAt: true,
          versions: {
            orderBy: { version: 'asc' },
            select: {
              id: true,
              version: true,
              status: true,
              title: true,
              schedule: true,
              startDate: true,
              weeks: true,
              endDate: true,
            },
          },
          plans: { where: { userId: ana.id }, select: { id: true } },
        },
      }),
      this.prisma.weightLog.findMany({
        where: { userId: ana.id },
        orderBy: { loggedAt: 'asc' },
        select: { weightKg: true, loggedAt: true },
      }),
      this.prisma.userGoals.findUnique({ where: { userId: ana.id } }),
      this.prisma.mealItem.aggregate({
        where: { meal: { userId: ana.id, eatenAt: { gte: start, lt: end } } },
        _sum: { kcal: true },
      }),
      this.prisma.waterLog.aggregate({
        where: { userId: ana.id, date: today },
        _sum: { ml: true },
      }),
      this.prisma.groupChallenge.findFirst({
        where: { groupId: group.id },
        orderBy: { startsAt: 'desc' },
        select: { id: true, title: true },
      }),
    ]);
    if (!membership) throw new NotFoundException(DEMO_NOT_FOUND);

    let plan: DemoSummary['plan'] = null;
    const state = offer ? offerState(offer.versions, offer.endedAt, today) : null;
    if (offer && state) {
      const planIds = offer.plans.map((p) => p.id);
      const [planned, sessionsDone] = await Promise.all([
        this.prisma.plannedSession.count({ where: { userId: ana.id, planId: { in: planIds } } }),
        this.prisma.workoutSession.count({
          where: { userId: ana.id, planId: { in: planIds }, completedAt: { not: null } },
        }),
      ]);
      plan = {
        title: state.shown.title,
        weekNumber: state.weekNumber ?? 1,
        weeks: state.shown.weeks ?? 0,
        sessionsDone,
        sessionsPlanned: planned,
      };
    }
    const last = weights.at(-1);
    const first = weights[0];
    return {
      groupId: group.id,
      name: group.name,
      brandColor: group.brandColor ?? DEFAULT_BRAND.color,
      createdAt: group.createdAt,
      student: {
        userId: ana.id,
        membershipId: membership.id,
        name: ana.name,
        joinedAt: membership.joinedAt,
      },
      plan,
      weight: last
        ? {
            kg: last.weightKg,
            loggedAt: last.loggedAt,
            deltaKg:
              first && weights.length > 1
                ? Math.round((last.weightKg - first.weightKg) * 10) / 10
                : null,
          }
        : null,
      today: {
        kcal: Math.round(items._sum.kcal ?? 0),
        kcalGoal: goals ? Math.round((goals.kcalMin + goals.kcalMax) / 2) : null,
        waterMl: water._sum.ml ?? 0,
        waterGoalMl: goals?.dailyWaterTargetMl ?? DEMO_GOALS.dailyWaterTargetMl,
      },
      challenge,
    };
  }
}
