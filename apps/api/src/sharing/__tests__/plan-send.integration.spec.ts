import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
 * Enviar para alunos (#405, Pn-18 e Pn-08b), no Postgres real.
 *
 * O roteiro é o critério de pronto: a Helena escolhe o "Inferior" na
 * biblioteca, manda para a Ana e a Carla; a Ana aceita; a Helena reenvia como
 * versão 2 com "o que mudou", começando depois do plano atual; a Ana vê as
 * mudanças antes de aceitar, e a Helena vê o envio em "Enviados recentemente".
 * Todo id que chega pelo corpo é amarrado à comunidade da URL.
 */
describe('enviar para alunos (#405, banco real)', () => {
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
  const stamp = `send-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;
  const u: Record<string, string> = {};
  const m: Record<string, string> = {};
  const tpl: Record<string, string> = {};
  let g = '';
  let g2 = '';
  let foods: number[] = [];

  async function pessoa(k: string) {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: k, timezone: TZ },
    });
    criados.push(user.id);
    u[k] = user.id;
    return user.id;
  }

  const membershipOf = async (groupId: string, userId: string) =>
    (
      await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId } },
      })
    ).id;

  async function modeloDeTreino(groupId: string, title: string, extra: { draft?: boolean } = {}) {
    const catalogo = await prisma.exercise.findMany({
      where: { createdByUserId: null, groupOwned: false, muscleGroup: { not: 'cardio' } },
      take: 2,
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    const plano = await prisma.workoutPlan.create({
      data: {
        userId: u.helena!,
        name: title,
        exercises: {
          create: catalogo.map((e, order) => ({
            exerciseId: e.id,
            order,
            targetSets: 3,
            targetReps: '10',
          })),
        },
      },
    });
    const snapshot = buildPlanSnapshot(await plans.findById(u.helena!, plano.id));
    const row = await prisma.groupPlanTemplate.create({
      data: {
        groupId,
        authorId: u.helena!,
        kind: 'WORKOUT',
        title,
        snapshot: snapshot as object,
        snapshotVersion: PLAN_SNAPSHOT_VERSION,
        draft: extra.draft ?? false,
      },
    });
    return row.id;
  }

  async function modeloAlimentar(title: string, comMetas: boolean, alimentoDaBase = true) {
    const item = (foodId: number, grams: number) => ({
      foodId: alimentoDaBase ? foodId : null,
      groupId: null,
      foodName: `Alimento ${foodId}`,
      grams,
      kcal: 100,
      proteinG: 10,
      carbsG: 10,
      fatG: 2,
      nutrients: null,
      portionLabel: null,
      portionQuantity: null,
    });
    const row = await prisma.groupPlanTemplate.create({
      data: {
        groupId: g,
        authorId: u.helena!,
        kind: 'NUTRITION',
        title,
        snapshotVersion: NUTRITION_SNAPSHOT_VERSION,
        snapshot: {
          version: NUTRITION_SNAPSHOT_VERSION,
          goals: comMetas
            ? {
                kcalMin: 1700,
                kcalMax: 1900,
                proteinMinG: 120,
                proteinMaxG: 150,
                carbsMinG: 150,
                carbsMaxG: 200,
                fatMinG: 50,
                fatMaxG: 70,
              }
            : null,
          meals: [
            { name: 'Café', mealType: 'BREAKFAST', items: [item(foods[0]!, 50)] },
            { name: 'Lanche', mealType: null, items: [item(foods[1]!, 120)] },
          ],
        },
      },
    });
    return row.id;
  }

  const calendario = (extra: Record<string, unknown> = {}) => ({
    schedule: 'CALENDAR' as const,
    start: 'TODAY' as const,
    weeks: 4,
    weekdays: [1, 3, 5],
    note: 'Faça 2× por semana.',
    ...extra,
  });

  beforeAll(async () => {
    await prisma.$connect();
    for (const k of [
      'bruno',
      'helena',
      'carlos',
      'ana',
      'carla',
      'diego',
      'eva',
      'semVinculo',
      'ze',
    ])
      await pessoa(k);
    g = (
      await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'Academia Demo',
          slug: `${stamp}-g`,
          ownerId: u.bruno!,
          // Sem post automático de plano: o "Anunciar no mural" decide sozinho.
          autoPosts: [],
        },
      })
    ).id;
    g2 = (
      await prisma.group.create({
        data: { type: 'SPONSORED', name: 'Outra', slug: `${stamp}-g2`, ownerId: u.helena! },
      })
    ).id;
    grupos.push(g, g2);
    await prisma.groupMembership.createMany({
      data: [
        { groupId: g, userId: u.bruno!, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g, userId: u.helena!, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId: g, userId: u.carlos!, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId: g, userId: u.ana!, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g, userId: u.carla!, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g, userId: u.diego!, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g, userId: u.eva!, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g, userId: u.semVinculo!, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g2, userId: u.helena!, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g2, userId: u.ze!, role: 'MEMBER', status: 'ACTIVE' },
      ],
    });
    for (const k of ['helena', 'carlos', 'ana', 'carla', 'diego', 'eva', 'semVinculo'])
      m[k] = await membershipOf(g, u[k]!);
    m.ze = await membershipOf(g2, u.ze!);
    // A Helena acompanha a Ana (#404).
    await prisma.groupMembership.update({
      where: { id: m.ana! },
      data: { accompaniedById: m.helena! },
    });
    await prisma.professionalLink.createMany({
      data: [
        { subjectUserId: u.ana!, professionalId: u.helena!, groupId: g, scopes: ['WORKOUT'] },
        // A Carla libera só Alimentação: o treino dela fica "sem progresso".
        { subjectUserId: u.carla!, professionalId: u.helena!, groupId: g, scopes: ['NUTRITION'] },
        {
          subjectUserId: u.diego!,
          professionalId: u.helena!,
          groupId: g,
          scopes: ['WORKOUT', 'NUTRITION'],
        },
        { subjectUserId: u.eva!, professionalId: u.helena!, groupId: g, scopes: ['WORKOUT'] },
        { subjectUserId: u.ze!, professionalId: u.helena!, groupId: g2, scopes: ['WORKOUT'] },
      ],
    });
    foods = (
      await prisma.food.findMany({
        where: { createdByUserId: null },
        take: 2,
        orderBy: { id: 'asc' },
        select: { id: true },
      })
    ).map((f) => f.id);
    if (foods.length < 2) throw new Error('rode seed:taco no banco de teste');

    tpl.inferior = await modeloDeTreino(g, 'Inferior');
    tpl.superior = await modeloDeTreino(g, 'Superior');
    tpl.bracos = await modeloDeTreino(g, 'Braços', { draft: true });
    tpl.outra = await modeloDeTreino(g2, 'Da outra comunidade');
    tpl.cutting = await modeloAlimentar('Cutting 1.800 kcal', true);
    tpl.semMetas = await modeloAlimentar('Só refeições', false);
    tpl.alimentoPessoal = await modeloAlimentar('Com alimento pessoal', true, false);
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  beforeEach(() => notify.mockClear());

  const ofertasDe = (userId: string) =>
    prisma.planOffer.count({ where: { userId, groupId: g, removedAt: null } });

  describe('para quem', () => {
    it('lista só quem tem vínculo ativo com quem envia, nesta comunidade', async () => {
      const v = await service.recipients(u.helena!, g, tpl.inferior);
      const nomes = v.recipients.map((r) => r.name).sort();
      expect(nomes).toEqual(['ana', 'carla', 'diego', 'eva']);
      const ana = v.recipients.find((r) => r.name === 'ana')!;
      expect(ana).toMatchObject({
        membershipId: m.ana,
        accompaniedByMe: true,
        hasPlan: false,
        alreadyHas: false,
      });
      expect(v.recipients.find((r) => r.name === 'carla')!.accompaniedByMe).toBe(false);
    });

    it('modelo de outra comunidade responde como inexistente', async () => {
      await expect(service.recipients(u.helena!, g, tpl.outra)).rejects.toThrow(NotFoundException);
    });

    it('membro não abre a tela de envio', async () => {
      await expect(service.recipients(u.ana!, g)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('enviar', () => {
    it('manda o modelo para várias pessoas: cada uma recebe a própria oferta e o aviso', async () => {
      const r = await service.send(u.helena!, g, {
        templateId: tpl.inferior!,
        membershipIds: [m.ana!, m.carla!],
        ...calendario(),
      });
      expect(r.results).toHaveLength(2);
      expect(r.results.every((x) => x.kind === 'new' && x.version === 1)).toBe(true);
      const daAna = await prisma.planOffer.findFirstOrThrow({
        where: { userId: u.ana!, groupId: g, sourceTemplateId: tpl.inferior! },
        include: { versions: true },
      });
      expect(daAna.authorId).toBe(u.helena);
      expect(daAna.versions[0]).toMatchObject({
        title: 'Inferior',
        schedule: 'CALENDAR',
        startDate: today,
        weeks: 4,
        weekdays: [1, 3, 5],
        note: 'Faça 2× por semana.',
        status: 'PENDING',
      });
      expect(notify).toHaveBeenCalledTimes(2);
      expect(notify.mock.calls.map((c) => c[0][0]).sort()).toEqual([u.ana, u.carla].sort());
      expect(notify.mock.calls[0][1]).toMatchObject({ kind: 'PLAN_RECEIVED' });
    });

    it('um id de outra comunidade, sem vínculo ou da equipe barra o lote inteiro', async () => {
      const antes = await ofertasDe(u.diego!);
      for (const intruso of [m.ze!, m.semVinculo!, m.carlos!]) {
        await expect(
          service.send(u.helena!, g, {
            templateId: tpl.superior!,
            membershipIds: [m.diego!, intruso],
            ...calendario(),
          }),
        ).rejects.toThrow(NotFoundException);
      }
      expect(await ofertasDe(u.diego!)).toBe(antes);
      expect(notify).not.toHaveBeenCalled();
    });

    it('modelo de outra comunidade é 404; rascunho é 409', async () => {
      await expect(
        service.send(u.helena!, g, {
          templateId: tpl.outra!,
          membershipIds: [m.diego!],
          ...calendario(),
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.send(u.helena!, g, {
          templateId: tpl.bracos!,
          membershipIds: [m.diego!],
          ...calendario(),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('quem não tem `member.plans` não envia', async () => {
      await expect(
        service.send(u.ana!, g, {
          templateId: tpl.superior!,
          membershipIds: [m.carla!],
          ...calendario(),
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('data no passado e plano flexível que termina antes de hoje são 400', async () => {
      await expect(
        service.send(u.helena!, g, {
          templateId: tpl.superior!,
          membershipIds: [m.diego!],
          ...calendario({ start: 'DATE', startDate: addDaysIso(today, -3) }),
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.send(u.helena!, g, {
          templateId: tpl.superior!,
          membershipIds: [m.diego!],
          schedule: 'FLEXIBLE',
          endDate: addDaysIso(today, -1),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('plano flexível guarda o fim (ou "sem fim")', async () => {
      const fim = addDaysIso(today, 30);
      const r = await service.send(u.helena!, g, {
        templateId: tpl.superior!,
        membershipIds: [m.diego!],
        schedule: 'FLEXIBLE',
        endDate: fim,
      });
      const v = await prisma.planOfferVersion.findFirstOrThrow({
        where: { offerId: r.results[0]!.id },
      });
      expect(v).toMatchObject({ schedule: 'FLEXIBLE', startDate: null, endDate: fim });
      const vista = await offers.get(u.diego!, r.results[0]!.id);
      expect(vista.shown.endDate).toBe(fim);
    });
  });

  describe('versão nova com "o que mudou"', () => {
    it('reenviar para quem já tem vira a versão 2, que só vale depois do aceite', async () => {
      const oferta = await prisma.planOffer.findFirstOrThrow({
        where: { userId: u.ana!, groupId: g, sourceTemplateId: tpl.inferior! },
        include: { versions: true },
      });
      const aceita = await offers.accept(u.ana!, oferta.id, oferta.versions[0]!.id, TZ);
      expect(aceita.planId).not.toBeNull();
      expect((await service.recipients(u.helena!, g, tpl.inferior)).recipients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'ana', alreadyHas: true, hasPlan: true }),
        ]),
      );

      const r = await service.send(u.helena!, g, {
        templateId: tpl.inferior!,
        membershipIds: [m.ana!],
        ...calendario({ start: 'AFTER_CURRENT' }),
        changeNote: 'Trocou 2 exercícios e subiu o descanso para 90 s.',
      });
      expect(r.results[0]).toMatchObject({ id: oferta.id, version: 2, kind: 'update' });
      const versoes = await prisma.planOfferVersion.findMany({
        where: { offerId: oferta.id },
        orderBy: { version: 'asc' },
      });
      // A 1 continua em uso; a 2 espera o aceite.
      expect(versoes.map((v) => v.status)).toEqual(['ACCEPTED', 'PENDING']);
      expect(versoes[1]!.changeNote).toBe('Trocou 2 exercícios e subiu o descanso para 90 s.');
      // "Depois do plano atual" não conta a própria oferta (revisão do PR #461):
      // a versão nova substitui a atual, então começa hoje.
      expect(versoes[1]!.startDate).toBe(today);

      const vista = await offers.get(u.ana!, oferta.id);
      expect(vista.kind).toBe('update');
      expect(vista.shown.changeNote).toBe('Trocou 2 exercícios e subiu o descanso para 90 s.');
      // O aceite avisou a Helena; a versão nova avisa a Ana.
      const paraAna = notify.mock.calls.filter((c) => c[0][0] === u.ana).at(-1)!;
      expect(paraAna[1].title).toMatch(/atualizou/);
    });

    it('sem plano atual, "depois do plano atual" começa hoje', async () => {
      const r = await service.send(u.helena!, g, {
        templateId: tpl.superior!,
        membershipIds: [m.carla!],
        ...calendario({ start: 'AFTER_CURRENT' }),
      });
      const v = await prisma.planOfferVersion.findFirstOrThrow({
        where: { offerId: r.results[0]!.id },
      });
      // A Carla tem o Inferior ainda sem resposta: conta como plano atual.
      expect(v.startDate).toBe(addDaysIso(today, 4 * 7));
      const diego = await service.send(u.helena!, g, {
        templateId: tpl.inferior!,
        membershipIds: [m.diego!],
        ...calendario({ start: 'AFTER_CURRENT' }),
      });
      const vd = await prisma.planOfferVersion.findFirstOrThrow({
        where: { offerId: diego.results[0]!.id },
      });
      // O Diego tem um flexível que termina em 30 dias: o fim dele também conta.
      expect(vd.startDate).toBe(addDaysIso(today, 31));
      // E quem não tem plano nenhum começa hoje.
      const eva = await service.send(u.helena!, g, {
        templateId: tpl.superior!,
        membershipIds: [m.eva!],
        ...calendario({ start: 'AFTER_CURRENT' }),
      });
      const ve = await prisma.planOfferVersion.findFirstOrThrow({
        where: { offerId: eva.results[0]!.id },
      });
      expect(ve.startDate).toBe(today);
    });
  });

  describe('plano alimentar', () => {
    it('vira o plano alimentar da pessoa, com a origem e o aviso', async () => {
      const r = await service.send(u.helena!, g, {
        templateId: tpl.cutting!,
        membershipIds: [m.diego!],
        note: 'Qualquer dúvida, me chama.',
      });
      const plano = await prisma.nutritionPlan.findUniqueOrThrow({
        where: { id: r.results[0]!.id },
        include: { meals: { include: { options: { include: { items: true } } } } },
      });
      expect(plano).toMatchObject({
        userId: u.diego,
        authorId: u.helena,
        groupId: g,
        sourceTemplateId: tpl.cutting,
        status: 'SENT',
        kcalMin: 1700,
        note: 'Qualquer dúvida, me chama.',
      });
      expect(plano.meals).toHaveLength(2);
      expect(plano.meals.every((ml) => ml.options.length === 1)).toBe(true);
      expect(notify).toHaveBeenCalledWith(
        [u.diego],
        expect.objectContaining({ kind: 'PLAN_RECEIVED' }),
      );
      expect((await service.recipients(u.helena!, g, tpl.cutting)).recipients).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'diego', alreadyHas: true })]),
      );
    });

    it('sem metas ou com alimento fora da base não dá para enviar', async () => {
      for (const t of [tpl.semMetas!, tpl.alimentoPessoal!]) {
        await expect(
          service.send(u.helena!, g, { templateId: t, membershipIds: [m.diego!] }),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  describe('enviados recentemente', () => {
    it('mostra só os meus envios, com o estado e o progresso pela porta de leitura', async () => {
      // A Carla aceita o Inferior; ela não libera Treino para a Helena.
      const daCarla = await prisma.planOffer.findFirstOrThrow({
        where: { userId: u.carla!, groupId: g, sourceTemplateId: tpl.inferior! },
        include: { versions: true },
      });
      await offers.accept(u.carla!, daCarla.id, daCarla.versions[0]!.id, TZ);
      const logsAntes = await prisma.professionalAccessLog.count({
        where: { professionalId: u.helena! },
      });

      const v = await service.list(u.helena!, g);
      const carla = v.items.find((i) => i.id === daCarla.id)!;
      expect(carla).toMatchObject({
        kind: 'WORKOUT',
        name: 'carla',
        status: 'ACCEPTED',
        progress: null,
        noProgress: true,
        canRevoke: false,
      });
      const ana = v.items.find((i) => i.name === 'ana' && i.kind === 'WORKOUT' && i.version === 2)!;
      expect(ana).toMatchObject({
        status: 'SENT',
        changeNote: 'Trocou 2 exercícios e subiu o descanso para 90 s.',
      });
      const nutricao = v.items.find((i) => i.kind === 'NUTRITION')!;
      expect(nutricao).toMatchObject({ name: 'diego', status: 'SENT', canRevoke: true });
      // Cada leitura de progresso passa pela porta e fica na trilha.
      expect(
        await prisma.professionalAccessLog.count({ where: { professionalId: u.helena! } }),
      ).toBeGreaterThan(logsAntes);

      // O Carlos, da mesma equipe, não vê os envios da Helena.
      expect((await service.list(u.carlos!, g)).items).toEqual([]);
    });

    it('com Treino liberado, o aceito mostra o progresso', async () => {
      const daDiego = await prisma.planOffer.findFirstOrThrow({
        where: { userId: u.diego!, groupId: g, sourceTemplateId: tpl.superior! },
        include: { versions: true },
      });
      await offers.accept(u.diego!, daDiego.id, daDiego.versions[0]!.id, TZ);
      const item = (await service.list(u.helena!, g)).items.find((i) => i.id === daDiego.id)!;
      expect(item.noProgress).toBe(false);
      expect(item.progress).toMatchObject({ done: 0 });
    });
  });

  describe('cancelar envio', () => {
    it('sem resposta, a oferta some do app da pessoa', async () => {
      const r = await service.send(u.helena!, g, {
        templateId: tpl.superior!,
        membershipIds: [m.ana!],
        ...calendario(),
      });
      const id = r.results[0]!.id;
      expect(await service.revoke(u.helena!, g, id)).toEqual({ id, status: 'REVOKED' });
      expect((await offers.list(u.ana!)).pending.map((p) => p.id)).not.toContain(id);
      const item = (await service.list(u.helena!, g)).items.find((i) => i.id === id)!;
      expect(item.status).toBe('REVOKED');
    });

    it('aceito não se cancela por aqui; de outra comunidade ou de outro autor é 404', async () => {
      const daCarla = await prisma.planOffer.findFirstOrThrow({
        where: { userId: u.carla!, groupId: g, sourceTemplateId: tpl.inferior! },
      });
      await expect(service.revoke(u.helena!, g, daCarla.id)).rejects.toThrow(ConflictException);
      await expect(service.revoke(u.helena!, g2, daCarla.id)).rejects.toThrow(NotFoundException);
      await expect(service.revoke(u.carlos!, g, daCarla.id)).rejects.toThrow(NotFoundException);
    });

    it('o plano alimentar que espera resposta também se cancela', async () => {
      const plano = await prisma.nutritionPlan.findFirstOrThrow({
        where: { userId: u.diego!, sourceTemplateId: tpl.cutting! },
      });
      await expect(service.revoke(u.carlos!, g, plano.id)).rejects.toThrow(NotFoundException);
      await service.revoke(u.helena!, g, plano.id);
      expect(
        (await prisma.nutritionPlan.findUniqueOrThrow({ where: { id: plano.id } })).status,
      ).toBe('SUPERSEDED');
    });
  });
});
