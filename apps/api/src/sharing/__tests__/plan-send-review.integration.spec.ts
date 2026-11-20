import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { DailyAdherenceService } from '../../nutrition/daily-adherence.service';
import { MealService } from '../../nutrition/meal.service';
import { NutritionPlanService } from '../../nutrition/nutrition-plan.service';
import type { NotificationService } from '../../notifications/notification.service';
import { addDaysIso, todayInTz } from '../../progress/helpers/date-tz';
import { ExerciseService } from '../../workout/exercise.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { AccessAuditService } from '../access-audit.service';
import { NUTRITION_SNAPSHOT_VERSION } from '../nutrition-snapshot';
import { PlanMaterializerService } from '../plan-materializer.service';
import { PlanOfferService } from '../plan-offer.service';
import { PlanSendService } from '../plan-send.service';
import { buildPlanSnapshot, PLAN_SNAPSHOT_VERSION } from '../plan-snapshot';
import { ProfessionalAccessService } from '../professional-access.service';
import { SharedWithService } from '../shared-with.service';

/**
 * Revisão adversarial do PR #461 (#405), no Postgres real: "depois do plano
 * atual" na versão nova, o "já tem" igual ao envio, o plano alimentar por
 * modelo, a corrida do envio alimentar, o plano flexível sem fim e o lote
 * atômico.
 */
describe('enviar para alunos: revisão do PR #461 (banco real)', () => {
  const prisma = new PrismaService();
  const notify = jest.fn();
  const notifications = { notify } as unknown as NotificationService;
  const plans = new WorkoutPlanService(prisma);
  const offers = new PlanOfferService(
    prisma,
    new PlanMaterializerService(prisma, new ExerciseService(prisma)),
    notifications,
    plans,
  );
  const nutritionPlans = new NutritionPlanService(
    prisma,
    new MealService(prisma),
    new DailyAdherenceService(prisma),
    new SharedWithService(prisma),
  );
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const service = new PlanSendService(prisma, offers, nutritionPlans, notifications, access);

  const TZ = 'America/Sao_Paulo';
  const today = todayInTz(TZ);
  const stamp = `rev405-${Date.now()}`;
  const u: Record<string, string> = {};
  const m: Record<string, string> = {};
  const tpl: Record<string, string> = {};
  const criados: string[] = [];
  let g = '';
  let n = 0;
  let foods: number[] = [];

  const cal = (extra: Record<string, unknown> = {}) => ({
    schedule: 'CALENDAR' as const,
    start: 'TODAY' as const,
    weeks: 4,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    ...extra,
  });

  async function treino(title: string) {
    const ex = await prisma.exercise.findMany({
      where: { createdByUserId: null, groupOwned: false },
      take: 2,
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    const plano = await prisma.workoutPlan.create({
      data: {
        userId: u.helena!,
        name: title,
        exercises: {
          create: ex.map((e, order) => ({
            exerciseId: e.id,
            order,
            targetSets: 3,
            targetReps: '10',
          })),
        },
      },
    });
    const snapshot = buildPlanSnapshot(await plans.findById(u.helena!, plano.id));
    return (
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: g,
          authorId: u.helena!,
          kind: 'WORKOUT',
          title,
          snapshot: snapshot as object,
          snapshotVersion: PLAN_SNAPSHOT_VERSION,
        },
      })
    ).id;
  }

  async function alimentar(title: string) {
    const item = (foodId: number) => ({
      foodId,
      groupId: null,
      foodName: `A ${foodId}`,
      grams: 100,
      kcal: 100,
      proteinG: 10,
      carbsG: 10,
      fatG: 2,
      nutrients: null,
      portionLabel: null,
      portionQuantity: null,
    });
    return (
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: g,
          authorId: u.helena!,
          kind: 'NUTRITION',
          title,
          snapshotVersion: NUTRITION_SNAPSHOT_VERSION,
          snapshot: {
            version: NUTRITION_SNAPSHOT_VERSION,
            goals: {
              kcalMin: 1700,
              kcalMax: 1900,
              proteinMinG: 120,
              proteinMaxG: 150,
              carbsMinG: 150,
              carbsMaxG: 200,
              fatMinG: 50,
              fatMaxG: 70,
            },
            meals: [{ name: 'Café', mealType: 'BREAKFAST', items: [item(foods[0]!)] }],
          },
        },
      })
    ).id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    for (const k of ['bruno', 'helena', 'carlos', 'ana', 'diego', 'eva', 'fabio', 'gil']) {
      n += 1;
      const user = await prisma.user.create({
        data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@t.local`, name: k, timezone: TZ },
      });
      criados.push(user.id);
      u[k] = user.id;
    }
    g = (
      await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'G',
          slug: `${stamp}-g`,
          ownerId: u.bruno!,
          autoPosts: [],
        },
      })
    ).id;
    await prisma.groupMembership.createMany({
      data: [
        { groupId: g, userId: u.bruno!, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g, userId: u.helena!, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId: g, userId: u.carlos!, role: 'PROFESSIONAL', status: 'ACTIVE' },
        ...['ana', 'diego', 'eva', 'fabio', 'gil'].map((k) => ({
          groupId: g,
          userId: u[k]!,
          role: 'MEMBER' as const,
          status: 'ACTIVE' as const,
        })),
      ],
    });
    for (const k of ['ana', 'diego', 'eva', 'fabio', 'gil']) {
      m[k] = (
        await prisma.groupMembership.findUniqueOrThrow({
          where: { groupId_userId: { groupId: g, userId: u[k]! } },
        })
      ).id;
    }
    await prisma.professionalLink.createMany({
      data: [
        { subjectUserId: u.ana!, professionalId: u.helena!, groupId: g, scopes: ['WORKOUT'] },
        { subjectUserId: u.diego!, professionalId: u.helena!, groupId: g, scopes: ['WORKOUT'] },
        { subjectUserId: u.diego!, professionalId: u.carlos!, groupId: g, scopes: ['WORKOUT'] },
        { subjectUserId: u.eva!, professionalId: u.helena!, groupId: g, scopes: ['NUTRITION'] },
        { subjectUserId: u.fabio!, professionalId: u.helena!, groupId: g, scopes: ['WORKOUT'] },
        { subjectUserId: u.gil!, professionalId: u.helena!, groupId: g, scopes: ['WORKOUT'] },
      ],
    });
    foods = (
      await prisma.food.findMany({
        where: { createdByUserId: null },
        take: 1,
        orderBy: { id: 'asc' },
        select: { id: true },
      })
    ).map((f) => f.id);
    tpl.inferior = await treino('Inferior');
    tpl.superior = await treino('Superior');
    tpl.full = await treino('Full body');
    tpl.mobilidade = await treino('Mobilidade');
    tpl.cutting = await alimentar('Cutting');
    tpl.bulking = await alimentar('Bulking');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS rev405_falha ON "PlanOffer"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS rev405_falha()');
    await prisma.group.deleteMany({ where: { id: g } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  const sessoes = (userId: string, planId: string, de: string, ate: string) =>
    prisma.plannedSession.count({ where: { userId, planId, date: { gte: de, lte: ate } } });

  describe('"depois do plano atual" na versão nova (I1)', () => {
    it('o reenvio da mesma oferta não conta ela mesma: começa hoje e o aceite não deixa buraco', async () => {
      const r1 = await service.send(u.helena!, g, {
        templateId: tpl.inferior!,
        membershipIds: [m.ana!],
        ...cal(),
      });
      const of = await prisma.planOffer.findUniqueOrThrow({
        where: { id: r1.results[0]!.id },
        include: { versions: true },
      });
      const planId = (await offers.accept(u.ana!, of.id, of.versions[0]!.id, TZ)).planId!;
      const fimV1 = addDaysIso(today, 27);
      const antes = await sessoes(u.ana!, planId, today, fimV1);
      expect(antes).toBeGreaterThan(0);

      const r2 = await service.send(u.helena!, g, {
        templateId: tpl.inferior!,
        membershipIds: [m.ana!],
        ...cal({ start: 'AFTER_CURRENT' }),
        changeNote: 'mudou',
      });
      const v2 = await prisma.planOfferVersion.findFirstOrThrow({
        where: { offerId: of.id, version: 2 },
      });
      expect(r2.results[0]!.kind).toBe('update');
      expect(v2.startDate).toBe(today);

      await offers.accept(u.ana!, of.id, v2.id, TZ);
      expect(await sessoes(u.ana!, planId, today, fimV1)).toBe(antes);
    });

    it('aceitar versão que começa no futuro mantém a atual e a agenda dela até a véspera', async () => {
      const r1 = await service.send(u.helena!, g, {
        templateId: tpl.inferior!,
        membershipIds: [m.fabio!],
        ...cal(),
      });
      const of = await prisma.planOffer.findUniqueOrThrow({
        where: { id: r1.results[0]!.id },
        include: { versions: true },
      });
      const planId = (await offers.accept(u.fabio!, of.id, of.versions[0]!.id, TZ)).planId!;
      const inicio = addDaysIso(today, 10);
      const vespera = addDaysIso(today, 9);
      const antes = await sessoes(u.fabio!, planId, today, vespera);

      await service.send(u.helena!, g, {
        templateId: tpl.inferior!,
        membershipIds: [m.fabio!],
        ...cal({ start: 'DATE', startDate: inicio }),
        changeNote: 'Bloco novo',
      });
      const v2 = await prisma.planOfferVersion.findFirstOrThrow({
        where: { offerId: of.id, version: 2 },
      });
      await offers.accept(u.fabio!, of.id, v2.id, TZ);

      const v1 = await prisma.planOfferVersion.findFirstOrThrow({
        where: { offerId: of.id, version: 1 },
      });
      expect({
        v1: v1.status,
        ateVespera: await sessoes(u.fabio!, planId, today, vespera),
      }).toEqual({ v1: 'ACCEPTED', ateVespera: antes });
      // Do início da v2 em diante, a agenda é a dela.
      const daV2 = await prisma.plannedSession.findMany({
        where: { userId: u.fabio!, planId, date: { gte: inicio } },
        select: { offerVersionId: true },
      });
      expect(daV2.length).toBeGreaterThan(0);
      expect(new Set(daV2.map((s) => s.offerVersionId))).toEqual(new Set([v2.id]));

      // Quando o dia chega, a v2 assume e a v1 sai.
      await prisma.planOfferVersion.update({ where: { id: v2.id }, data: { startDate: today } });
      await (
        offers as unknown as { settleScheduledVersions(): Promise<void> }
      ).settleScheduledVersions();
      const depois = await prisma.planOfferVersion.findMany({
        where: { offerId: of.id },
        orderBy: { version: 'asc' },
        select: { status: true },
      });
      expect(depois.map((v) => v.status)).toEqual(['SUPERSEDED', 'ACCEPTED']);
    });
  });

  describe('"já tem" e o envio usam o mesmo critério (I2)', () => {
    it('plano do mesmo modelo de outro profissional não é "já tem": o envio é uma oferta nova', async () => {
      await service.send(u.helena!, g, {
        templateId: tpl.superior!,
        membershipIds: [m.diego!],
        ...cal(),
      });
      const view = await service.recipients(u.carlos!, g, tpl.superior);
      const diego = view.recipients.find((r) => r.membershipId === m.diego)!;
      expect(diego).toMatchObject({ alreadyHas: false, hasPlan: true });

      const r = await service.send(u.carlos!, g, {
        templateId: tpl.superior!,
        membershipIds: [m.diego!],
        ...cal(),
      });
      const vivas = await prisma.planOffer.count({
        where: { userId: u.diego!, groupId: g, sourceTemplateId: tpl.superior!, removedAt: null },
      });
      expect({ kind: r.results[0]!.kind, vivas }).toEqual({ kind: 'new', vivas: 2 });
    });

    it('oferta recusada é "já tem": o reenvio vira versão nova e guarda o recado', async () => {
      const r1 = await service.send(u.helena!, g, {
        templateId: tpl.full!,
        membershipIds: [m.diego!],
        ...cal(),
      });
      const of = await prisma.planOffer.findUniqueOrThrow({
        where: { id: r1.results[0]!.id },
        include: { versions: true },
      });
      await offers.decline(u.diego!, of.id, of.versions[0]!.id);
      const view = await service.recipients(u.helena!, g, tpl.full);
      const alreadyHas = view.recipients.find((r) => r.membershipId === m.diego)!.alreadyHas;
      const r2 = await service.send(u.helena!, g, {
        templateId: tpl.full!,
        membershipIds: [m.diego!],
        ...cal(),
        changeNote: 'Tirei o terra',
      });
      const v2 = await prisma.planOfferVersion.findFirstOrThrow({
        where: { offerId: of.id, version: 2 },
      });
      expect({ alreadyHas, kind: r2.results[0]!.kind, changeNote: v2.changeNote }).toEqual({
        alreadyHas: true,
        kind: 'update',
        changeNote: 'Tirei o terra',
      });
    });
  });

  describe('plano alimentar (M1, M2)', () => {
    it('modelo diferente não leva "o que mudou" nem tira o pendente do outro modelo', async () => {
      await service.send(u.helena!, g, { templateId: tpl.cutting!, membershipIds: [m.eva!] });
      notify.mockClear();
      const r = await service.send(u.helena!, g, {
        templateId: tpl.bulking!,
        membershipIds: [m.eva!],
        changeNote: 'recado de versão',
      });
      const novo = await prisma.nutritionPlan.findUniqueOrThrow({
        where: { id: r.results[0]!.id },
      });
      const cutting = await prisma.nutritionPlan.findFirstOrThrow({
        where: { userId: u.eva!, sourceTemplateId: tpl.cutting! },
      });
      expect({
        kind: r.results[0]!.kind,
        changeNote: novo.changeNote,
        cutting: cutting.status,
      }).toEqual({ kind: 'new', changeNote: null, cutting: 'SENT' });
      expect(notify.mock.calls.at(-1)![1].title).toMatch(/enviou/);
    });

    it('o mesmo modelo de novo é versão nova, com o recado, e substitui o pendente dele', async () => {
      const r = await service.send(u.helena!, g, {
        templateId: tpl.cutting!,
        membershipIds: [m.eva!],
        changeNote: 'Subi a proteína',
      });
      const novo = await prisma.nutritionPlan.findUniqueOrThrow({
        where: { id: r.results[0]!.id },
      });
      const pendentes = await prisma.nutritionPlan.count({
        where: { userId: u.eva!, sourceTemplateId: tpl.cutting!, status: 'SENT' },
      });
      expect({ kind: r.results[0]!.kind, changeNote: novo.changeNote, pendentes }).toEqual({
        kind: 'update',
        changeNote: 'Subi a proteína',
        pendentes: 1,
      });
    });

    it('dois envios simultâneos do mesmo plano alimentar deixam um pendente só', async () => {
      await Promise.allSettled([
        service.send(u.helena!, g, { templateId: tpl.cutting!, membershipIds: [m.eva!] }),
        service.send(u.helena!, g, { templateId: tpl.cutting!, membershipIds: [m.eva!] }),
        service.send(u.helena!, g, { templateId: tpl.cutting!, membershipIds: [m.eva!] }),
      ]);
      const pendentes = await prisma.nutritionPlan.count({
        where: { userId: u.eva!, sourceTemplateId: tpl.cutting!, status: 'SENT' },
      });
      expect(pendentes).toBe(1);
    });
  });

  describe('plano flexível sem fim (M3)', () => {
    it('quem segue um flexível sem fim não tem "depois do plano atual": a tela sabe e a API recusa', async () => {
      await service.send(u.helena!, g, {
        templateId: tpl.mobilidade!,
        membershipIds: [m.gil!],
        schedule: 'FLEXIBLE',
      });
      const view = await service.recipients(u.helena!, g, tpl.superior);
      expect(view.recipients.find((r) => r.membershipId === m.gil)).toMatchObject({
        openEnded: true,
      });
      await expect(
        service.send(u.helena!, g, {
          templateId: tpl.superior!,
          membershipIds: [m.gil!],
          ...cal({ start: 'AFTER_CURRENT' }),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(
        await prisma.planOffer.count({
          where: { userId: u.gil!, sourceTemplateId: tpl.superior! },
        }),
      ).toBe(0);
    });
  });

  describe('lote (M4)', () => {
    it('uma falha no meio do lote não deixa ninguém com o plano', async () => {
      // Falha no banco só para a segunda pessoa: o que a primeira recebeu volta.
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION rev405_falha() RETURNS trigger AS $$
        BEGIN
          IF NEW."userId" = '${u.diego!}' AND NEW."sourceTemplateId" = '${tpl.mobilidade!}' THEN
            RAISE EXCEPTION 'falha de teste';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(
        'CREATE TRIGGER rev405_falha BEFORE INSERT ON "PlanOffer" FOR EACH ROW EXECUTE FUNCTION rev405_falha()',
      );
      notify.mockClear();
      await expect(
        service.send(u.helena!, g, {
          templateId: tpl.mobilidade!,
          membershipIds: [m.ana!, m.diego!],
          ...cal(),
        }),
      ).rejects.toThrow();
      expect(
        await prisma.planOffer.count({
          where: { groupId: g, sourceTemplateId: tpl.mobilidade!, userId: u.ana! },
        }),
      ).toBe(0);
      expect(notify).not.toHaveBeenCalled();
    });
  });
});
