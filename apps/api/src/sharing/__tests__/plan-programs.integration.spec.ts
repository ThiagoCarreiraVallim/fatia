import { ForbiddenException } from '@nestjs/common';
import type { NotificationService } from '../../notifications/notification.service';
import { PrismaService } from '../../common/prisma.service';
import { addDaysIso, todayInTz } from '../../progress/helpers/date-tz';
import type { WorkoutSessionService } from '../../workout/workout-session.service';
import { AccessAuditService } from '../access-audit.service';
import { PlanProgramsService } from '../plan-programs.service';
import { ProfessionalAccessService } from '../professional-access.service';
import { ReviewService } from '../review.service';

/**
 * Programas do painel (#403, Pn-30): os planos com começo e fim que a equipe
 * mandou, por aluno. O progresso é dado de Treino e só aparece com Treino
 * liberado para quem olha (sem isso, só "enviado"); o plano que terminou vai
 * para "Para revisar". Tudo amarrado à comunidade da URL.
 */
describe('programas de planos (#403, banco real)', () => {
  const prisma = new PrismaService();
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const service = new PlanProgramsService(prisma, access);
  const review = new ReviewService(
    prisma,
    access,
    {} as WorkoutSessionService,
    { notify: jest.fn() } as unknown as NotificationService,
  );
  const TZ = 'America/Sao_Paulo';
  const today = todayInTz(TZ);
  const stamp = `pn30-${Date.now()}`;
  const users: Record<string, string> = {};
  const ms: Record<string, string> = {};
  let g = '';
  let outro = '';
  const offers: Record<string, string> = {};

  async function pessoa(k: string) {
    users[k] = (
      await prisma.user.create({
        data: {
          logtoSub: `${stamp}-${k}`,
          email: `${stamp}-${k}@test.local`,
          name: k,
          timezone: TZ,
        },
      })
    ).id;
    return users[k]!;
  }

  /** Oferta aceita de calendário (ou flexível), com a cópia na conta do aluno. */
  async function plano(
    k: string,
    aluno: string,
    groupId: string,
    v: {
      schedule: 'CALENDAR' | 'FLEXIBLE';
      startDate?: string;
      weeks?: number;
      status?: 'ACCEPTED' | 'PENDING';
    },
  ) {
    const o = await prisma.planOffer.create({
      data: {
        userId: users[aluno]!,
        authorId: users.helena,
        groupId,
        versions: {
          create: {
            version: 1,
            status: v.status ?? 'ACCEPTED',
            title: `Plano ${k}`,
            snapshot: {},
            snapshotVersion: 1,
            schedule: v.schedule,
            startDate: v.startDate ?? null,
            weeks: v.weeks ?? null,
            weekdays: v.schedule === 'CALENDAR' ? [1, 3, 5] : [],
          },
        },
      },
    });
    offers[k] = o.id;
    if ((v.status ?? 'ACCEPTED') === 'ACCEPTED') {
      const copia = await prisma.workoutPlan.create({
        data: { userId: users[aluno]!, name: `Plano ${k}`, fromOfferId: o.id },
      });
      return copia.id;
    }
    return null;
  }

  beforeAll(async () => {
    for (const k of ['dona', 'helena', 'nina', 'ana', 'hugo', 'julia', 'diego', 'rui'])
      await pessoa(k);
    const grupo = await prisma.group.create({
      data: { type: 'SPONSORED', name: 'Academia Pn30', slug: stamp, ownerId: users.dona! },
    });
    g = grupo.id;
    outro = (
      await prisma.group.create({
        data: { type: 'SPONSORED', name: 'Outra', slug: `${stamp}-o`, ownerId: users.dona! },
      })
    ).id;
    const papel: Record<string, 'OWNER' | 'PROFESSIONAL' | 'MEMBER'> = {
      dona: 'OWNER',
      helena: 'PROFESSIONAL',
      nina: 'PROFESSIONAL',
    };
    for (const k of Object.keys(users)) {
      ms[k] = (
        await prisma.groupMembership.create({
          data: { groupId: g, userId: users[k]!, role: papel[k] ?? 'MEMBER', status: 'ACTIVE' },
        })
      ).id;
    }
    await prisma.groupMembership.create({
      data: { groupId: outro, userId: users.rui!, role: 'MEMBER', status: 'ACTIVE' },
    });
    // Ana, Júlia e Diego compartilham Treino com a Helena; Hugo não.
    for (const k of ['ana', 'julia', 'diego']) {
      await prisma.professionalLink.create({
        data: {
          subjectUserId: users[k]!,
          professionalId: users.helena!,
          groupId: g,
          scopes: ['WORKOUT'],
        },
      });
    }
    await prisma.professionalLink.create({
      data: {
        subjectUserId: users.hugo!,
        professionalId: users.helena!,
        groupId: g,
        scopes: ['NUTRITION'],
      },
    });
    // A Ana está na semana 2 de 4, com 2 treinos feitos do plano.
    const copiaAna = await plano('ana', 'ana', g, {
      schedule: 'CALENDAR',
      startDate: addDaysIso(today, -8),
      weeks: 4,
    });
    for (let i = 0; i < 2; i++) {
      await prisma.workoutSession.create({
        data: {
          userId: users.ana!,
          planId: copiaAna,
          startedAt: new Date(Date.now() - (i + 1) * 86_400_000),
          completedAt: new Date(Date.now() - (i + 1) * 86_400_000 + 3_600_000),
        },
      });
    }
    for (const [i, d] of [-8, -6, -4, -1, 1, 3].entries()) {
      await prisma.plannedSession.create({
        data: { userId: users.ana!, planId: copiaAna!, date: addDaysIso(today, d), order: i + 1 },
      });
    }
    await plano('julia', 'julia', g, {
      schedule: 'CALENDAR',
      startDate: addDaysIso(today, 19),
      weeks: 8,
    });
    // Diego: 4 semanas que acabaram há 2 dias.
    await plano('diego', 'diego', g, {
      schedule: 'CALENDAR',
      startDate: addDaysIso(today, -30),
      weeks: 4,
    });
    await plano('hugo', 'hugo', g, { schedule: 'FLEXIBLE' });
    await plano('rui', 'rui', outro, { schedule: 'FLEXIBLE' });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: [g, outro] } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    await prisma.$disconnect();
  });

  it('lista os planos da comunidade com datas, progresso e status', async () => {
    const r = await service.list(users.helena!, g);
    const by = new Map(r.items.map((i) => [i.offerId, i]));
    expect(r.items.map((i) => i.offerId).sort()).toEqual(
      [offers.ana, offers.julia, offers.diego, offers.hugo].sort(),
    );
    expect(by.get(offers.ana!)).toMatchObject({
      name: 'ana',
      membershipId: ms.ana,
      title: 'Plano ana',
      authorName: 'helena',
      schedule: 'CALENDAR',
      startDate: addDaysIso(today, -8),
      status: 'ACTIVE',
      progress: { done: 2, planned: 6, percent: 33, weekNumber: 2, weeks: 4 },
    });
    expect(by.get(offers.ana!)?.phases.map((p) => p.focus)).toEqual([
      'accumulation',
      'accumulation',
      'peak',
      'deload',
    ]);
    expect(by.get(offers.julia!)).toMatchObject({ status: 'SCHEDULED', startsInDays: 19 });
    expect(by.get(offers.diego!)).toMatchObject({ status: 'ENDED' });
    expect(r.counts).toMatchObject({ all: 4, active: 1, scheduled: 1, ended: 1 });
  });

  it('sem Treino liberado para quem olha, só "enviado", sem progresso nem leitura', async () => {
    const antes = await prisma.professionalAccessLog.count({
      where: { subjectUserId: users.hugo!, denied: false },
    });
    const r = await service.list(users.helena!, g);
    expect(r.items.find((i) => i.offerId === offers.hugo)).toMatchObject({
      status: 'SENT',
      sharesWorkout: false,
      progress: null,
    });
    expect(
      await prisma.professionalAccessLog.count({
        where: { subjectUserId: users.hugo!, denied: false },
      }),
    ).toBe(antes);
  });

  it('quem não recebeu Treino da pessoa (outra profissional) vê tudo como enviado', async () => {
    const r = await service.list(users.nina!, g);
    expect(r.items.every((i) => i.status === 'SENT' && i.progress === null)).toBe(true);
  });

  it('com "profissionais veem só quem acompanham", a lista recorta', async () => {
    await prisma.group.update({ where: { id: g }, data: { proSeeOnlyAssigned: true } });
    await prisma.groupMembership.update({
      where: { id: ms.ana! },
      data: { accompaniedById: ms.helena },
    });
    const r = await service.list(users.helena!, g);
    expect(r.items.map((i) => i.offerId)).toEqual([offers.ana]);
    await prisma.group.update({ where: { id: g }, data: { proSeeOnlyAssigned: false } });
  });

  it('membro não abre; o plano de outra comunidade nunca aparece', async () => {
    await expect(service.list(users.ana!, g)).rejects.toThrow(ForbiddenException);
    const r = await service.list(users.dona!, g);
    expect(r.items.some((i) => i.offerId === offers.rui)).toBe(false);
  });

  it('o plano que terminou entra em "Para revisar" e sai com "Visto"', async () => {
    const fila = await review.queue(users.helena!, g);
    const item = fila.items.find((i) => i.kind === 'PLAN_ENDED');
    expect(item).toMatchObject({
      refId: offers.diego,
      membershipId: ms.diego,
      title: 'Plano diego',
    });
    await review.markSeen(users.helena!, g, 'PLAN_ENDED', offers.diego!);
    const depois = await review.queue(users.helena!, g);
    expect(depois.items.find((i) => i.kind === 'PLAN_ENDED')?.seenAt).not.toBeNull();
  });
});
