import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ExerciseService } from '../../workout/exercise.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { PlanMaterializerService } from '../plan-materializer.service';
import { PlanOfferService } from '../plan-offer.service';
import { addDaysIso, todayInTz } from '../../progress/helpers/date-tz';
import type { NotificationService } from '../../notifications/notification.service';

/**
 * Plano de treino recebido da equipe (#379), no Postgres real.
 *
 * O roteiro é o critério de pronto da issue: a Helena envia o Inferior, a Ana
 * recebe o aviso, abre, aceita, e o plano aparece em Planos e na agenda; depois
 * a Helena atualiza, a Ana vê o que mudou e aceita a troca — e nada mudou no
 * plano dela antes disso.
 */
describe('plano recebido da equipe (integração)', () => {
  const prisma = new PrismaService();
  const notify = jest.fn();
  const notifications = { notify } as unknown as NotificationService;
  const offers = new PlanOfferService(
    prisma,
    new PlanMaterializerService(prisma, new ExerciseService(prisma)),
    notifications,
    new WorkoutPlanService(prisma),
  );
  const TZ = 'America/Sao_Paulo';
  const today = todayInTz(TZ);

  const stamp = `offer-${Date.now()}`;
  const criados: string[] = [];
  let groupId = '';
  let n = 0;
  const ids = {
    ana: '',
    helena: '',
    colega: '',
    semVinculo: '',
    anaMembership: '',
    colegaMembership: '',
    semVinculoMembership: '',
  };
  const ex = { agach: 0, leg: 0, stiff: 0 };
  let inferior = '';

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: `${stamp}-${n}@test.local`,
        name: nome,
        timezone: TZ,
      },
    });
    criados.push(user.id);
    return user.id;
  }

  const membershipOf = async (userId: string) =>
    (
      await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId } },
      })
    ).id;

  /** O plano da Helena, na conta dela: é o que ela oferece. */
  async function planoDaHelena(nome: string, itens: Array<[number, number, string]>) {
    const plan = await prisma.workoutPlan.create({
      data: {
        userId: ids.helena,
        name: nome,
        exercises: {
          create: itens.map(([exerciseId, targetSets, targetReps], order) => ({
            exerciseId,
            order,
            targetSets,
            targetReps,
          })),
        },
      },
    });
    return plan.id;
  }

  const calendario = (startDate = today) => ({
    schedule: 'CALENDAR' as const,
    startDate,
    weeks: 2,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    note: 'Faça 2× por semana.',
  });

  beforeAll(async () => {
    await prisma.$connect();
    ids.ana = await pessoa('Ana Demo');
    ids.helena = await pessoa('Helena Personal');
    ids.colega = await pessoa('Colega');
    ids.semVinculo = await pessoa('Sem Vínculo');
    const dono = await pessoa('Bruno');
    const grupo = await prisma.group.create({
      data: { type: 'SPONSORED', name: 'Academia Demo', slug: `${stamp}-g`, ownerId: dono },
    });
    groupId = grupo.id;
    await prisma.groupMembership.createMany({
      data: [
        { groupId, userId: dono, role: 'OWNER', status: 'ACTIVE' },
        { groupId, userId: ids.helena, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId, userId: ids.ana, role: 'MEMBER', status: 'ACTIVE' },
        { groupId, userId: ids.colega, role: 'MEMBER', status: 'ACTIVE' },
        { groupId, userId: ids.semVinculo, role: 'MEMBER', status: 'ACTIVE' },
      ],
    });
    ids.anaMembership = await membershipOf(ids.ana);
    ids.colegaMembership = await membershipOf(ids.colega);
    ids.semVinculoMembership = await membershipOf(ids.semVinculo);
    await prisma.professionalLink.createMany({
      data: [ids.ana, ids.colega].map((subjectUserId) => ({
        subjectUserId,
        professionalId: ids.helena,
        groupId,
        scopes: ['WORKOUT'],
      })),
    });

    const catalogo = await prisma.exercise.findMany({
      where: { createdByUserId: null, groupOwned: false, muscleGroup: { not: 'cardio' } },
      take: 3,
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (catalogo.length < 3) throw new Error('rode seed:exercises no banco de teste');
    [ex.agach, ex.leg, ex.stiff] = catalogo.map((e) => e.id) as [number, number, number];
    inferior = await planoDaHelena('Inferior', [
      [ex.agach, 4, '8'],
      [ex.leg, 3, '10-12'],
    ]);
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  beforeEach(() => notify.mockClear());

  describe('envio (porta mínima da equipe)', () => {
    it('só com vínculo ativo entre o aluno e quem envia', async () => {
      await expect(
        offers.send(ids.helena, ids.semVinculoMembership, { planId: inferior, ...calendario() }),
      ).rejects.toThrow(NotFoundException);
      // Um aluno não envia plano a outro, mesmo da mesma comunidade.
      await expect(
        offers.send(ids.colega, ids.anaMembership, { planId: inferior, ...calendario() }),
      ).rejects.toThrow(NotFoundException);
    });

    it('vínculo revogado barra o envio', async () => {
      const link = await prisma.professionalLink.findFirstOrThrow({
        where: { subjectUserId: ids.colega, professionalId: ids.helena },
      });
      await prisma.professionalLink.update({
        where: { id: link.id },
        data: { revokedAt: new Date(), revokedReason: 'subject' },
      });
      await expect(
        offers.send(ids.helena, ids.colegaMembership, { planId: inferior, ...calendario() }),
      ).rejects.toThrow(NotFoundException);
      await prisma.professionalLink.update({
        where: { id: link.id },
        data: { revokedAt: null, revokedReason: null },
      });
    });

    it('só oferece plano da própria conta de quem envia', async () => {
      const daAna = await prisma.workoutPlan.create({ data: { userId: ids.ana, name: 'Meu' } });
      await expect(
        offers.send(ids.helena, ids.anaMembership, { planId: daAna.id, ...calendario() }),
      ).rejects.toThrow(NotFoundException);
      await prisma.workoutPlan.delete({ where: { id: daAna.id } });
    });

    it('plano de calendário precisa de início, semanas e dias', async () => {
      await expect(
        offers.send(ids.helena, ids.anaMembership, {
          planId: inferior,
          schedule: 'CALENDAR',
          weeks: 2,
          weekdays: [1],
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        offers.send(ids.helena, ids.anaMembership, {
          planId: inferior,
          schedule: 'CALENDAR',
          startDate: today,
          weeks: 2,
          weekdays: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('o critério de pronto', () => {
    let offerId = '';
    let planId = '';

    it('a Helena envia, a Ana recebe o aviso e vê o plano pendente; nada entra nos planos dela', async () => {
      const sent = await offers.send(ids.helena, ids.anaMembership, {
        planId: inferior,
        ...calendario(),
      });
      offerId = sent.id;
      expect(notify).toHaveBeenCalledWith(
        [ids.ana],
        expect.objectContaining({ kind: 'PLAN_RECEIVED', url: `/workout/offers/${offerId}` }),
      );

      const list = await offers.list(ids.ana);
      expect(list.pending.map((o) => o.id)).toEqual([offerId]);
      const view = await offers.get(ids.ana, offerId);
      expect(view).toMatchObject({
        kind: 'new',
        author: { name: 'Helena Personal' },
        group: { name: 'Academia Demo' },
        shown: {
          version: 1,
          status: 'PENDING',
          title: 'Inferior',
          schedule: 'CALENDAR',
          note: 'Faça 2× por semana.',
          summary: { exercises: 2, sets: 7 },
        },
      });
      // Na primeira oferta nada é "novo": é o plano inteiro.
      expect(view.shown.exercises.every((e) => !e.isNew)).toBe(true);
      expect(await prisma.workoutPlan.count({ where: { userId: ids.ana } })).toBe(0);
    });

    it('a outra aluna não vê a oferta da Ana', async () => {
      await expect(offers.get(ids.colega, offerId)).rejects.toThrow(NotFoundException);
      expect((await offers.list(ids.colega)).pending).toEqual([]);
    });

    it('a Ana aceita: o plano é dela, com a proveniência, e as sessões entram na agenda', async () => {
      const view = await offers.get(ids.ana, offerId);
      const accepted = await offers.accept(ids.ana, offerId, view.shown.id, TZ);
      planId = accepted.planId!;
      const plan = await prisma.workoutPlan.findUniqueOrThrow({
        where: { id: planId },
        include: { exercises: true },
      });
      expect(plan).toMatchObject({ userId: ids.ana, fromOfferId: offerId, name: 'Inferior' });
      expect(plan.exercises).toHaveLength(2);
      expect(accepted.shown.status).toBe('ACCEPTED');

      const sessions = await prisma.plannedSession.findMany({
        where: { planId },
        orderBy: { date: 'asc' },
      });
      expect(sessions).toHaveLength(14);
      expect(sessions[0]).toMatchObject({ userId: ids.ana, date: today, order: 1 });
      expect(notify).toHaveBeenCalledWith(
        [ids.helena],
        expect.objectContaining({ body: expect.stringContaining('aceitou') }),
      );
    });

    it('o segundo toque no aceite responde 409 e não cria outro plano', async () => {
      const view = await offers.get(ids.ana, offerId);
      await expect(offers.accept(ids.ana, offerId, view.shown.id, TZ)).rejects.toThrow(
        ConflictException,
      );
      expect(await prisma.workoutPlan.count({ where: { userId: ids.ana } })).toBe(1);
    });

    it('a Helena atualiza: a Ana é avisada e vê o que mudou, e o plano dela não muda', async () => {
      await prisma.workoutPlanExercise.updateMany({
        where: { planId: inferior, exerciseId: ex.agach },
        data: { targetSets: 5 },
      });
      await prisma.workoutPlanExercise.create({
        data: { planId: inferior, exerciseId: ex.stiff, order: 2, targetSets: 3, targetReps: '10' },
      });
      await offers.update(ids.helena, ids.anaMembership, offerId, {
        planId: inferior,
        schedule: 'CALENDAR',
        startDate: addDaysIso(today, 1),
        weeks: 1,
        weekdays: [1, 3, 5],
      });
      expect(notify).toHaveBeenCalledWith(
        [ids.ana],
        expect.objectContaining({
          kind: 'PLAN_RECEIVED',
          title: expect.stringContaining('atualizou'),
        }),
      );

      const view = await offers.get(ids.ana, offerId);
      expect(view.kind).toBe('update');
      expect(view.shown).toMatchObject({ version: 2, status: 'PENDING' });
      expect(view.accepted).toMatchObject({ version: 1, planId });
      expect(view.diff!.added).toHaveLength(1);
      expect(view.diff!.changed).toEqual([
        expect.objectContaining({ fields: [{ field: 'sets', before: '4', after: '5' }] }),
      ]);
      expect(view.shown.exercises.filter((e) => e.isNew).map((e) => e.exerciseId)).toEqual([
        ex.stiff,
      ]);
      // A agenda também mudou (outro início, 1 semana, 3 dias): entra no "o que mudou".
      expect(view.diff!.version.map((c) => c.field)).toEqual(['startDate', 'weeks', 'weekdays']);

      const plan = await prisma.workoutPlan.findUniqueOrThrow({
        where: { id: planId },
        include: { exercises: true },
      });
      expect(plan.exercises).toHaveLength(2);
      expect(plan.exercises.find((e) => e.exerciseId === ex.agach)?.targetSets).toBe(4);
    });

    it('manter a versão atual recusa a nova sem mexer no plano, no vínculo nem no consentimento', async () => {
      const linkAntes = await prisma.professionalLink.findFirstOrThrow({
        where: { subjectUserId: ids.ana, professionalId: ids.helena },
      });
      const view = await offers.get(ids.ana, offerId);
      const declined = await offers.decline(ids.ana, offerId, view.shown.id);
      expect(declined.shown.status).toBe('DECLINED');
      expect(notify).toHaveBeenCalledWith(
        [ids.helena],
        expect.objectContaining({ body: expect.stringContaining('manteve') }),
      );

      const linkDepois = await prisma.professionalLink.findUniqueOrThrow({
        where: { id: linkAntes.id },
      });
      expect(linkDepois.revokedAt).toBeNull();
      expect(linkDepois.scopes).toEqual(linkAntes.scopes);
      const plan = await prisma.workoutPlan.findUniqueOrThrow({
        where: { id: planId },
        include: { exercises: true },
      });
      expect(plan.exercises).toHaveLength(2);
    });

    it('"Desfazer" volta a versão a pendente', async () => {
      const view = await offers.get(ids.ana, offerId);
      const undone = await offers.undoDecline(ids.ana, offerId, view.shown.id);
      expect(undone.shown.status).toBe('PENDING');
    });

    it('aceitar a troca que começa amanhã mantém a atual até hoje; no dia, a nova assume no mesmo plano', async () => {
      // Uma sessão de ontem fica: aceitar uma versão nova não mexe no passado.
      await prisma.plannedSession.create({
        data: { userId: ids.ana, planId, date: addDaysIso(today, -1), order: 0 },
      });
      const view = await offers.get(ids.ana, offerId);
      const accepted = await offers.accept(ids.ana, offerId, view.shown.id, TZ);
      expect(accepted.planId).toBe(planId);
      expect(accepted.shown).toMatchObject({ version: 2, status: 'ACCEPTED' });

      // A v2 começa amanhã (revisão do PR #461): hoje o plano ainda é a v1.
      const exercicios = () =>
        prisma.workoutPlanExercise.findMany({
          where: { planId },
          select: { exerciseId: true, targetSets: true },
        });
      expect(await exercicios()).toHaveLength(2);
      let versions = await prisma.planOfferVersion.findMany({
        where: { offerId },
        orderBy: { version: 'asc' },
      });
      expect(versions.map((v) => v.status)).toEqual(['ACCEPTED', 'ACCEPTED']);

      // Da v2 em diante, a agenda já é a dela; o passado fica.
      const sessions = await prisma.plannedSession.findMany({
        where: { planId },
        orderBy: { date: 'asc' },
      });
      expect(sessions[0]!.date).toBe(addDaysIso(today, -1));
      const daV2 = sessions.filter((s) => s.date > today);
      expect(daV2).toHaveLength(3);
      expect(daV2.every((s) => s.offerVersionId === versions[1]!.id)).toBe(true);

      // No dia, a v2 assume: troca os exercícios do mesmo plano e a v1 sai.
      await prisma.planOfferVersion.update({
        where: { id: versions[1]!.id },
        data: { startDate: today },
      });
      expect(await offers.settleScheduledVersions()).toBeGreaterThanOrEqual(1);
      const depois = await exercicios();
      expect(depois).toHaveLength(3);
      expect(depois.find((e) => e.exerciseId === ex.agach)?.targetSets).toBe(5);
      versions = await prisma.planOfferVersion.findMany({
        where: { offerId },
        orderBy: { version: 'asc' },
      });
      expect(versions.map((v) => v.status)).toEqual(['SUPERSEDED', 'ACCEPTED']);
    });

    it('id de versão de outra oferta, ou de outra pessoa, responde como inexistente', async () => {
      const outra = await offers.send(ids.helena, ids.colegaMembership, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      const versaoDaColega = (await offers.get(ids.colega, outra.id)).shown.id;
      await expect(offers.accept(ids.ana, offerId, versaoDaColega, TZ)).rejects.toThrow(
        NotFoundException,
      );
      await expect(offers.accept(ids.ana, outra.id, versaoDaColega, TZ)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('plano flexível', () => {
    it('o aceite não cria sessão na agenda', async () => {
      const sent = await offers.send(ids.helena, ids.colegaMembership, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      const view = await offers.get(ids.colega, sent.id);
      expect(view.shown).toMatchObject({ schedule: 'FLEXIBLE', startDate: null, endDate: null });
      const accepted = await offers.accept(ids.colega, sent.id, view.shown.id, TZ);
      expect(await prisma.plannedSession.count({ where: { planId: accepted.planId! } })).toBe(0);
    });
  });

  describe('versão substituída', () => {
    it('a versão antiga que ainda esperava resposta vira substituída e não pode ser aceita', async () => {
      const sent = await offers.send(ids.helena, ids.anaMembership, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      const v1 = (await offers.get(ids.ana, sent.id)).shown.id;
      await offers.update(ids.helena, ids.anaMembership, sent.id, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      await expect(offers.accept(ids.ana, sent.id, v1, TZ)).rejects.toThrow(ConflictException);
      const view = await offers.get(ids.ana, sent.id);
      expect(view.shown.version).toBe(2);
    });

    it('a equipe não atualiza oferta de outro aluno pela associação de um terceiro', async () => {
      const sent = await offers.send(ids.helena, ids.anaMembership, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      await expect(
        offers.update(ids.helena, ids.colegaMembership, sent.id, {
          planId: inferior,
          schedule: 'FLEXIBLE',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

/**
 * Revisão da #379: aceite que falha no meio, vínculo encerrado e corrida entre
 * a resposta da pessoa e a versão nova da equipe.
 */
describe('plano recebido: falhas, vínculo e corrida (integração)', () => {
  const prisma = new PrismaService();
  const notify = jest.fn();
  const materializer = new PlanMaterializerService(prisma, new ExerciseService(prisma));
  const offers = new PlanOfferService(
    prisma,
    materializer,
    { notify } as unknown as NotificationService,
    new WorkoutPlanService(prisma),
  );
  const TZ = 'America/Sao_Paulo';
  const today = todayInTz(TZ);
  const stamp = `offer-r-${Date.now()}`;
  const criados: string[] = [];
  let groupId = '';
  let helena = '';
  let inferior = '';
  let n = 0;

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: `${stamp}-${n}@test.local`,
        name: nome,
        timezone: TZ,
      },
    });
    criados.push(user.id);
    return user.id;
  }

  /** Aluna da comunidade com vínculo ativo com a Helena. */
  async function aluna(nome: string) {
    const userId = await pessoa(nome);
    const membership = await prisma.groupMembership.create({
      data: { groupId, userId, role: 'MEMBER', status: 'ACTIVE' },
    });
    const link = await prisma.professionalLink.create({
      data: { subjectUserId: userId, professionalId: helena, groupId, scopes: ['WORKOUT'] },
    });
    return { userId, membershipId: membership.id, linkId: link.id };
  }

  const revoke = (linkId: string) =>
    prisma.professionalLink.update({
      where: { id: linkId },
      data: { revokedAt: new Date(), revokedReason: 'subject' },
    });
  const restore = (linkId: string) =>
    prisma.professionalLink.update({
      where: { id: linkId },
      data: { revokedAt: null, revokedReason: null },
    });

  const statuses = async (offerId: string) =>
    (
      await prisma.planOfferVersion.findMany({ where: { offerId }, orderBy: { version: 'asc' } })
    ).map((v) => v.status);

  /** Versão nova gravada direto, como a equipe faria entre a leitura e a escrita da pessoa. */
  async function versaoNova(offerId: string) {
    const last = await prisma.planOfferVersion.findFirstOrThrow({
      where: { offerId },
      orderBy: { version: 'desc' },
    });
    await prisma.planOfferVersion.create({
      data: {
        offerId,
        version: last.version + 1,
        title: last.title,
        snapshot: last.snapshot as object,
        snapshotVersion: last.snapshotVersion,
        schedule: 'FLEXIBLE',
      },
    });
  }

  /** A leitura da oferta volta "velha": a versão nova entra logo depois dela. */
  function leituraVelha(offerId: string) {
    const original = prisma.planOffer.findFirst.bind(prisma.planOffer);
    jest.spyOn(prisma.planOffer, 'findFirst').mockImplementationOnce((async (
      args: Parameters<typeof original>[0],
    ) => {
      const read = await original(args);
      await versaoNova(offerId);
      return read;
    }) as never);
  }

  beforeAll(async () => {
    await prisma.$connect();
    helena = await pessoa('Helena Personal');
    const dono = await pessoa('Bruno');
    const grupo = await prisma.group.create({
      data: { type: 'SPONSORED', name: 'Academia Demo', slug: `${stamp}-g`, ownerId: dono },
    });
    groupId = grupo.id;
    await prisma.groupMembership.createMany({
      data: [
        { groupId, userId: dono, role: 'OWNER', status: 'ACTIVE' },
        { groupId, userId: helena, role: 'PROFESSIONAL', status: 'ACTIVE' },
      ],
    });
    const catalogo = await prisma.exercise.findMany({
      where: { createdByUserId: null, groupOwned: false, muscleGroup: { not: 'cardio' } },
      take: 2,
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    const plan = await prisma.workoutPlan.create({
      data: {
        userId: helena,
        name: 'Inferior',
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
    inferior = plan.id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  beforeEach(() => notify.mockClear());
  afterEach(() => jest.restoreAllMocks());

  describe('aceite que falha no meio', () => {
    it('a agenda falha depois da cópia: a versão volta a esperar e só uma fica aceita', async () => {
      const a = await aluna('Edu');
      const sent = await offers.send(helena, a.membershipId, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      await offers.accept(a.userId, sent.id, sent.versionId, TZ);
      const v2 = await offers.update(helena, a.membershipId, sent.id, {
        planId: inferior,
        schedule: 'CALENDAR',
        startDate: today,
        weeks: 1,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      });
      jest.spyOn(prisma.plannedSession, 'createMany').mockImplementationOnce(() => {
        throw new Error('queda do banco');
      });
      await expect(offers.accept(a.userId, sent.id, v2.versionId, TZ)).rejects.toThrow(
        'queda do banco',
      );
      expect(await statuses(sent.id)).toEqual(['ACCEPTED', 'PENDING']);

      // A nova tentativa passa.
      await offers.accept(a.userId, sent.id, v2.versionId, TZ);
      expect(await statuses(sent.id)).toEqual(['SUPERSEDED', 'ACCEPTED']);
    });

    it('a primeira cópia falha na agenda: nenhum plano fica para trás', async () => {
      const a = await aluna('Ivo');
      const sent = await offers.send(helena, a.membershipId, {
        planId: inferior,
        schedule: 'CALENDAR',
        startDate: today,
        weeks: 1,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      });
      jest.spyOn(prisma.plannedSession, 'createMany').mockImplementationOnce(() => {
        throw new Error('queda do banco');
      });
      await expect(offers.accept(a.userId, sent.id, sent.versionId, TZ)).rejects.toThrow(
        'queda do banco',
      );
      expect(await statuses(sent.id)).toEqual(['PENDING']);
      expect(await prisma.workoutPlan.count({ where: { userId: a.userId } })).toBe(0);
    });

    it('com duas versões aceitas (resto de uma falha antiga), vale a de maior número', async () => {
      const a = await aluna('Juca');
      const sent = await offers.send(helena, a.membershipId, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      await offers.accept(a.userId, sent.id, sent.versionId, TZ);
      await versaoNova(sent.id);
      await prisma.planOfferVersion.updateMany({
        where: { offerId: sent.id, version: 2 },
        data: { status: 'ACCEPTED' },
      });
      const view = await offers.get(a.userId, sent.id);
      expect(view.accepted).toMatchObject({ version: 2 });
      expect(view.shown.version).toBe(2);
      const list = await offers.list(a.userId);
      expect(list.accepted.map((o) => o.version)).toEqual([2]);
    });
  });

  describe('vínculo encerrado', () => {
    it('aceitar, recusar e desfazer respondem 409, e a oferta sai da lista', async () => {
      const a = await aluna('Fabi');
      const sent = await offers.send(helena, a.membershipId, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      await revoke(a.linkId);
      await expect(offers.accept(a.userId, sent.id, sent.versionId, TZ)).rejects.toThrow(
        new ConflictException('Esse plano não está mais disponível'),
      );
      await expect(offers.decline(a.userId, sent.id, sent.versionId)).rejects.toThrow(
        new ConflictException('Esse plano não está mais disponível'),
      );
      expect((await offers.list(a.userId)).pending).toEqual([]);
      expect(await statuses(sent.id)).toEqual(['PENDING']);
      expect(await prisma.workoutPlan.count({ where: { userId: a.userId } })).toBe(0);

      await restore(a.linkId);
      expect((await offers.list(a.userId)).pending.map((o) => o.id)).toEqual([sent.id]);
      await offers.decline(a.userId, sent.id, sent.versionId);
      await revoke(a.linkId);
      await expect(offers.undoDecline(a.userId, sent.id, sent.versionId)).rejects.toThrow(
        new ConflictException('Esse plano não está mais disponível'),
      );
      expect(await statuses(sent.id)).toEqual(['DECLINED']);
    });

    it('vínculo com outra comunidade não vale', async () => {
      const a = await aluna('Lia');
      const sent = await offers.send(helena, a.membershipId, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      const outro = await prisma.group.create({
        data: { type: 'SPONSORED', name: 'Outra', slug: `${stamp}-o`, ownerId: helena },
      });
      await prisma.professionalLink.create({
        data: { subjectUserId: a.userId, professionalId: helena, groupId: outro.id, scopes: [] },
      });
      await revoke(a.linkId);
      await expect(offers.accept(a.userId, sent.id, sent.versionId, TZ)).rejects.toThrow(
        ConflictException,
      );
      expect((await offers.list(a.userId)).pending).toEqual([]);
      await prisma.group.delete({ where: { id: outro.id } });
    });

    it('vínculo encerrado durante o aceite: a profissional antiga não é avisada', async () => {
      const a = await aluna('Gil');
      const sent = await offers.send(helena, a.membershipId, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      notify.mockClear();
      const original = prisma.$transaction.bind(prisma) as (...args: unknown[]) => unknown;
      jest.spyOn(prisma, '$transaction').mockImplementation((async (...args: unknown[]) => {
        const result = await original(...args);
        if (Array.isArray(args[0])) await revoke(a.linkId);
        return result;
      }) as never);
      await offers.accept(a.userId, sent.id, sent.versionId, TZ);
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('corrida com a versão nova', () => {
    it('desfazer a recusa com leitura velha responde 409 e não deixa duas pendentes', async () => {
      const a = await aluna('Hugo');
      const sent = await offers.send(helena, a.membershipId, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      await offers.decline(a.userId, sent.id, sent.versionId);
      leituraVelha(sent.id);
      await expect(offers.undoDecline(a.userId, sent.id, sent.versionId)).rejects.toThrow(
        ConflictException,
      );
      expect(await statuses(sent.id)).toEqual(['DECLINED', 'PENDING']);
    });

    it('aceitar a recusada com leitura velha responde 409 e não cria plano', async () => {
      const a = await aluna('Nina');
      const sent = await offers.send(helena, a.membershipId, {
        planId: inferior,
        schedule: 'FLEXIBLE',
      });
      await offers.decline(a.userId, sent.id, sent.versionId);
      leituraVelha(sent.id);
      await expect(offers.accept(a.userId, sent.id, sent.versionId, TZ)).rejects.toThrow(
        ConflictException,
      );
      expect(await statuses(sent.id)).toEqual(['DECLINED', 'PENDING']);
      expect(await prisma.workoutPlan.count({ where: { userId: a.userId } })).toBe(0);
    });
  });
});
