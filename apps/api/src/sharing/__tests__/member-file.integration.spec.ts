import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ShareScope } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { CheckpointPurgeService } from '../../chat/checkpoint-purge.service';
import type { LogtoManagementService } from '../../auth/logto-management.service';
import type { NotificationService } from '../../notifications/notification.service';
import { NutritionSummaryService } from '../../nutrition/nutrition-summary.service';
import { addDaysIso, todayInTz } from '../../progress/helpers/date-tz';
import { ProgressService } from '../../progress/progress.service';
import { StepLogService } from '../../progress/step-log.service';
import { WaterLogService } from '../../progress/water-log.service';
import { AccountService } from '../../users/account.service';
import { ExerciseService } from '../../workout/exercise.service';
import { AgendaService } from '../../workout/agenda.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { AccessAuditService } from '../access-audit.service';
import { ForYouService } from '../for-you.service';
import { MemberFileService } from '../member-file.service';
import { MemberNoteService } from '../member-note.service';
import { MembershipService } from '../membership.service';
import { PanelService } from '../panel.service';
import { PlanMaterializerService } from '../plan-materializer.service';
import { PlanOfferService } from '../plan-offer.service';
import { buildPlanSnapshot, PLAN_SNAPSHOT_VERSION } from '../plan-snapshot';
import { ProfessionalAccessService } from '../professional-access.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * A ficha da pessoa no painel (#402), no Postgres real.
 *
 * O roteiro é o critério de pronto da issue: a Helena abre a ficha da Ana,
 * manda um plano da biblioteca com recado, a Ana aceita e recebe a cópia; a
 * Helena reordena e depois apaga um plano antigo, mantendo o que a Ana
 * registrou. Tudo o que é dado de saúde passa pela porta de leitura e entra na
 * trilha da Ana.
 */
describe('ficha da pessoa (integração, #402)', () => {
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
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const notes = new MemberNoteService(prisma);
  const file = new MemberFileService(
    prisma,
    access,
    new NutritionSummaryService(prisma),
    new ProgressService(prisma, new StepLogService(prisma), new WaterLogService(prisma)),
    notes,
  );
  const memberships = new MembershipService(
    prisma,
    new ProfessionalLinkService(prisma),
    notifications,
  );
  const forYou = new ForYouService(prisma);
  const panel = new PanelService(prisma);
  const agendaDaPessoa = new AgendaService(prisma);
  const TZ = 'America/Sao_Paulo';
  const today = todayInTz(TZ);

  const stamp = `ficha-${Date.now()}`;
  const criados: string[] = [];
  let n = 0;
  const g = { id: '', outro: '' };
  const ids = {
    ana: '',
    helena: '',
    nina: '',
    bruno: '',
    colega: '',
    anaM: '',
    colegaM: '',
    deOutroGrupoM: '',
    ex: '',
    saiuM: '',
    banidaM: '',
    convidadaM: '',
    ruiM: '',
    biaM: '',
    exNoOutroM: '',
  };
  const t = { hipertrofia: '', deOutroGrupo: '', glúteo: '' };
  let planoDaHelena = '';

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

  const membershipOf = async (groupId: string, userId: string) =>
    (
      await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId } },
      })
    ).id;

  async function modelo(groupId: string, title: string) {
    const snapshot = buildPlanSnapshot(await plans.findById(ids.helena, planoDaHelena));
    const tpl = await prisma.groupPlanTemplate.create({
      data: {
        groupId,
        authorId: ids.helena,
        kind: 'WORKOUT',
        title,
        snapshot: snapshot as object,
        snapshotVersion: PLAN_SNAPSHOT_VERSION,
        publishedAt: new Date(),
      },
    });
    return tpl.id;
  }

  const logsOf = (professionalId: string) =>
    prisma.professionalAccessLog.count({ where: { professionalId, subjectUserId: ids.ana } });

  beforeAll(async () => {
    await prisma.$connect();
    ids.ana = await pessoa('Ana Dias');
    ids.helena = await pessoa('Helena Prado');
    ids.nina = await pessoa('Nina');
    ids.bruno = await pessoa('Bruno Lima');
    ids.colega = await pessoa('Colega');
    const deFora = await pessoa('Dona de fora');
    ids.ex = await pessoa('Ex da equipe');
    const saiu = await pessoa('Saiu');
    const banida = await pessoa('Banida');
    const convidada = await pessoa('Convidada');
    const rui = await pessoa('Rui');
    const bia = await pessoa('Bia');

    g.id = (
      await prisma.group.create({
        data: { type: 'SPONSORED', name: 'Academia Demo', slug: `${stamp}-g`, ownerId: ids.bruno },
      })
    ).id;
    g.outro = (
      await prisma.group.create({
        data: { type: 'SPONSORED', name: 'Outra', slug: `${stamp}-o`, ownerId: deFora },
      })
    ).id;
    await prisma.groupMembership.createMany({
      data: [
        { groupId: g.id, userId: ids.bruno, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g.id, userId: ids.helena, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId: g.id, userId: ids.nina, role: 'PROFESSIONAL', status: 'ACTIVE' },
        {
          groupId: g.id,
          userId: ids.ana,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: new Date('2026-09-01T12:00:00Z'),
        },
        { groupId: g.id, userId: ids.colega, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g.outro, userId: deFora, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g.outro, userId: ids.colega, role: 'MEMBER', status: 'ACTIVE' },
        // Ex-equipe daqui que segue na equipe da outra comunidade.
        { groupId: g.id, userId: ids.ex, role: 'PROFESSIONAL', status: 'LEFT' },
        { groupId: g.outro, userId: ids.ex, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId: g.id, userId: saiu, role: 'MEMBER', status: 'LEFT' },
        { groupId: g.id, userId: banida, role: 'MEMBER', status: 'BANNED' },
        { groupId: g.id, userId: convidada, role: 'MEMBER', status: 'INVITED' },
        { groupId: g.id, userId: rui, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g.id, userId: bia, role: 'MEMBER', status: 'ACTIVE' },
      ],
    });
    ids.saiuM = await membershipOf(g.id, saiu);
    ids.banidaM = await membershipOf(g.id, banida);
    ids.convidadaM = await membershipOf(g.id, convidada);
    ids.ruiM = await membershipOf(g.id, rui);
    ids.biaM = await membershipOf(g.id, bia);
    ids.exNoOutroM = await membershipOf(g.outro, ids.ex);
    ids.anaM = await membershipOf(g.id, ids.ana);
    ids.colegaM = await membershipOf(g.id, ids.colega);
    ids.deOutroGrupoM = await membershipOf(g.outro, ids.colega);
    await prisma.professionalLink.createMany({
      data: [
        {
          subjectUserId: ids.ana,
          professionalId: ids.helena,
          groupId: g.id,
          scopes: ['WORKOUT', 'NUTRITION', 'BODY'],
        },
        { subjectUserId: ids.colega, professionalId: ids.helena, groupId: g.id, scopes: [] },
      ],
    });

    const catalogo = await prisma.exercise.findMany({
      where: { createdByUserId: null, groupOwned: false, muscleGroup: { not: 'cardio' } },
      take: 2,
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (catalogo.length < 2) throw new Error('rode seed:exercises no banco de teste');
    planoDaHelena = (
      await prisma.workoutPlan.create({
        data: {
          userId: ids.helena,
          name: 'Inferior v2',
          exercises: {
            create: catalogo.map((e, order) => ({
              exerciseId: e.id,
              order,
              targetSets: 3,
              targetReps: '10',
            })),
          },
        },
      })
    ).id;
    t.hipertrofia = await modelo(g.id, 'Hipertrofia');
    t.glúteo = await modelo(g.id, 'Glúteos e posterior');
    t.deOutroGrupo = await modelo(g.outro, 'Plano de fora');

    // O que a Ana registrou hoje: um treino, uma refeição e uma pesagem.
    await prisma.workoutSession.create({
      data: { userId: ids.ana, startedAt: new Date(), completedAt: new Date() },
    });
    await prisma.weightLog.create({
      data: { userId: ids.ana, weightKg: 70.2, loggedAt: new Date() },
    });
    await prisma.meal.create({
      data: {
        userId: ids.ana,
        mealType: 'LUNCH',
        eatenAt: new Date(),
        items: {
          create: [
            {
              foodName: 'Arroz',
              grams: 100,
              kcal: 500,
              proteinG: 40,
              carbsG: 50,
              fatG: 10,
              source: 'MANUAL',
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: [g.id, g.outro] } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  beforeEach(() => notify.mockClear());

  describe('quem abre a ficha', () => {
    it('membro comum não abre; associação de outra comunidade responde como inexistente', async () => {
      await expect(file.file(ids.colega, g.id, ids.anaM)).rejects.toThrow(ForbiddenException);
      await expect(file.file(ids.helena, g.id, ids.deOutroGrupoM)).rejects.toThrow(
        NotFoundException,
      );
      // A Helena não é do outro grupo: a URL dele com a Ana não abre nada.
      await expect(file.file(ids.helena, g.outro, ids.anaM)).rejects.toThrow(NotFoundException);
      await expect(file.agenda(ids.helena, g.id, ids.deOutroGrupoM)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('quem saiu, foi banida ou só foi convidada não tem ficha nem agenda', async () => {
      for (const m of [ids.saiuM, ids.banidaM, ids.convidadaM]) {
        await expect(file.file(ids.helena, g.id, m)).rejects.toThrow(NotFoundException);
        await expect(file.agenda(ids.helena, g.id, m)).rejects.toThrow(NotFoundException);
      }
    });

    it('ex-equipe não abre a ficha', async () => {
      await expect(file.file(ids.ex, g.id, ids.anaM)).rejects.toThrow();
      await expect(file.agenda(ids.ex, g.id, ids.anaM)).rejects.toThrow();
    });

    it('a agenda não passa de 42 dias por vez', async () => {
      await expect(
        file.agenda(ids.helena, g.id, ids.anaM, today, addDaysIso(today, 42)),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resumo', () => {
    it('mostra só o que a Ana liberou para quem olha, e cada categoria lida entra na trilha', async () => {
      const antes = await logsOf(ids.helena);
      const f = await file.file(ids.helena, g.id, ids.anaM);

      expect(f.name).toBe('Ana Dias');
      expect([...f.grantedToMe].sort()).toEqual(['BODY', 'NUTRITION', 'WORKOUT']);
      expect(f.followedBy).toEqual(['Helena Prado']);
      expect(f.canSendPlans).toBe(true);
      expect(f.week.workouts?.done).toBeGreaterThanOrEqual(1);
      expect(f.week.nutrition?.daysLogged).toBeGreaterThanOrEqual(1);
      expect(f.week.body?.currentWeightKg).toBe(70.2);

      // A abertura e uma linha por categoria lida, com o nome da operação.
      expect((await logsOf(ids.helena)) - antes).toBe(4);
      const abertura = await prisma.professionalAccessLog.findFirstOrThrow({
        where: { professionalId: ids.helena, subjectUserId: ids.ana, action: 'open_member_file' },
        orderBy: { at: 'desc' },
      });
      expect(abertura).toMatchObject({ scope: null, denied: false, groupId: g.id });
      const linhas = await prisma.professionalAccessLog.findMany({
        where: { professionalId: ids.helena, subjectUserId: ids.ana, action: 'get_member_file' },
        select: { scope: true, denied: true },
      });
      expect(linhas.map((l) => l.scope).sort()).toEqual(['BODY', 'NUTRITION', 'WORKOUT']);
      expect(linhas.every((l) => !l.denied)).toBe(true);
      const comGrupo = await prisma.professionalAccessLog.count({
        where: { professionalId: ids.helena, subjectUserId: ids.ana, groupId: g.id },
      });
      expect(comGrupo).toBe((await logsOf(ids.helena)) - antes);
    });

    it('sem vínculo, o dono vê a ficha sem nenhum número; a abertura e cada categoria trancada ficam na trilha', async () => {
      const desde = new Date(Date.now() - 1000);
      const f = await file.file(ids.bruno, g.id, ids.anaM);
      expect(f.grantedToMe).toEqual([]);
      expect(f.week).toEqual({ workouts: null, nutrition: null, body: null });
      expect(f.canSendPlans).toBe(false);
      const linhas = await prisma.professionalAccessLog.findMany({
        where: { professionalId: ids.bruno, subjectUserId: ids.ana, at: { gte: desde } },
        select: { scope: true, denied: true, action: true, groupId: true },
      });
      expect(linhas).toContainEqual({
        scope: null,
        denied: false,
        action: 'open_member_file',
        groupId: g.id,
      });
      const negadas = linhas.filter((l) => l.denied);
      expect(negadas.map((l) => l.scope).sort()).toEqual(['BODY', 'NUTRITION', 'WORKOUT']);
      expect(negadas.every((l) => l.groupId === g.id && l.action === 'get_member_file')).toBe(true);
    });

    it('o histórico da ficha é só desta comunidade: nem ex-equipe de fora, nem linha antiga sem comunidade', async () => {
      // O Ex saiu da equipe daqui e tenta ler a colega pela outra comunidade.
      await access
        .assertReadable(
          ids.ex,
          ids.deOutroGrupoM,
          'NUTRITION' as ShareScope,
          'get_student_progress',
        )
        .catch(() => undefined);
      const link = await prisma.professionalLink.findFirstOrThrow({
        where: { subjectUserId: ids.colega, professionalId: ids.helena, groupId: g.id },
      });
      // Linha de antes da coluna `groupId`.
      await prisma.professionalAccessLog.create({
        data: {
          linkId: link.id,
          professionalId: ids.helena,
          subjectUserId: ids.colega,
          scope: 'GOALS',
          action: 'linha_antiga',
        },
      });
      const f = await file.file(ids.helena, g.id, ids.colegaM);
      expect(f.accessLog.some((l) => l.professionalName === 'Ex da equipe')).toBe(false);
      expect(f.accessLog.some((l) => l.action === 'linha_antiga')).toBe(false);
      expect(f.accessLog.some((l) => l.isMe && l.action === 'open_member_file')).toBe(true);
    });

    it('histórico de acesso traz a tentativa negada de quem é da equipe', async () => {
      await access
        .assertReadable(ids.nina, ids.anaM, 'NUTRITION' as ShareScope, 'get_student_progress')
        .catch(() => undefined);
      const f = await file.file(ids.helena, g.id, ids.anaM);
      const negada = f.accessLog.find((l) => l.denied);
      expect(negada).toMatchObject({ professionalName: 'Nina', scope: 'NUTRITION', isMe: false });
      expect(f.accessLog.some((l) => l.isMe && l.action === 'get_member_file')).toBe(true);
    });
  });

  describe('planos', () => {
    let primeira = '';
    let segunda = '';

    it('manda um modelo da biblioteca desta comunidade, e só com vínculo', async () => {
      await expect(
        offers.sendToMember(ids.helena, g.id, ids.anaM, {
          templateId: t.deOutroGrupo,
          schedule: 'FLEXIBLE',
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        offers.sendToMember(ids.helena, g.id, ids.anaM, {
          templateId: t.hipertrofia,
          planId: planoDaHelena,
          schedule: 'FLEXIBLE',
        }),
      ).rejects.toThrow(BadRequestException);
      // A Nina é da equipe, mas a Ana não liberou nada para ela.
      await expect(
        offers.sendToMember(ids.nina, g.id, ids.anaM, {
          templateId: t.hipertrofia,
          schedule: 'FLEXIBLE',
        }),
      ).rejects.toThrow(NotFoundException);
      // Associação de outra comunidade, com o grupo da URL desta.
      await expect(
        offers.sendToMember(ids.helena, g.id, ids.deOutroGrupoM, {
          templateId: t.hipertrofia,
          schedule: 'FLEXIBLE',
        }),
      ).rejects.toThrow(NotFoundException);

      const sent = await offers.sendToMember(ids.helena, g.id, ids.anaM, {
        templateId: t.hipertrofia,
        schedule: 'FLEXIBLE',
        note: 'Vamos reforçar glúteo 2× na semana.',
      });
      primeira = sent.id;
      expect(notify).toHaveBeenCalledWith([ids.ana], expect.anything());

      const f = await file.file(ids.helena, g.id, ids.anaM);
      expect(f.plans.workout).toEqual([
        expect.objectContaining({
          offerId: primeira,
          title: 'Hipertrofia',
          status: 'PENDING',
          sourceTemplateId: t.hipertrofia,
          note: 'Vamos reforçar glúteo 2× na semana.',
          authorName: 'Helena Prado',
        }),
      ]);
    });

    it('a Ana aceita e recebe a cópia; o modelo da biblioteca não muda', async () => {
      const recebida = await offers.get(ids.ana, primeira);
      await offers.accept(ids.ana, primeira, recebida.shown.id, TZ);
      const f = await file.file(ids.helena, g.id, ids.anaM);
      expect(f.plans.workout[0]).toMatchObject({ offerId: primeira, status: 'ACTIVE' });
      const tpl = await prisma.groupPlanTemplate.findUniqueOrThrow({
        where: { id: t.hipertrofia },
      });
      expect(tpl.title).toBe('Hipertrofia');
    });

    it('reordenar na ficha muda a ordem do app enquanto a Ana não reordenou', async () => {
      const sent = await offers.sendToMember(ids.helena, g.id, ids.anaM, {
        templateId: t.glúteo,
        schedule: 'CALENDAR',
        startDate: today,
        weeks: 2,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      });
      segunda = sent.id;
      await offers.accept(ids.ana, segunda, sent.versionId, TZ);

      // A ficha manda a lista inteira, sem repetir.
      await expect(offers.reorderForMember(ids.helena, g.id, ids.anaM, [segunda])).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        offers.reorderForMember(ids.helena, g.id, ids.anaM, [segunda, primeira, segunda]),
      ).rejects.toThrow(BadRequestException);
      await expect(
        offers.reorderForMember(ids.helena, g.id, ids.anaM, [segunda, primeira]),
      ).resolves.toEqual({ offerIds: [segunda, primeira] });
      const f = await file.file(ids.helena, g.id, ids.anaM);
      expect(f.plans.workout.map((p) => p.offerId)).toEqual([segunda, primeira]);
      expect(f.plans.reorderedBySubject).toBe(false);

      const copias = await prisma.workoutPlan.findMany({
        where: { userId: ids.ana },
        select: { id: true, fromOfferId: true },
      });
      const copiaDe = (offerId: string) => copias.find((c) => c.fromOfferId === offerId)!.id;
      expect((await plans.order(ids.ana)).planIds).toEqual([copiaDe(segunda), copiaDe(primeira)]);

      // A Ana reordena no app: a lista passa a ser dela.
      await plans.reorder(ids.ana, [copiaDe(primeira), copiaDe(segunda)]);
      await offers.reorderForMember(ids.helena, g.id, ids.anaM, [segunda, primeira]);
      expect(await plans.order(ids.ana)).toEqual({
        planIds: [copiaDe(primeira), copiaDe(segunda)],
        customized: true,
      });
      expect((await file.file(ids.helena, g.id, ids.anaM)).plans.reorderedBySubject).toBe(true);
    });

    it('envios ao mesmo tempo não repetem a posição', async () => {
      await Promise.all(
        [0, 1, 2, 3].map(() =>
          offers.sendToMember(ids.helena, g.id, ids.colegaM, {
            templateId: t.hipertrofia,
            schedule: 'FLEXIBLE',
          }),
        ),
      );
      const rows = await prisma.planOffer.findMany({
        where: { userId: ids.colega, groupId: g.id, removedAt: null },
        select: { position: true },
      });
      expect(new Set(rows.map((r) => r.position)).size).toBe(rows.length);
    });

    it('reordenar não aceita id de outra pessoa', async () => {
      const daColega = await offers.sendToMember(ids.helena, g.id, ids.colegaM, {
        templateId: t.hipertrofia,
        schedule: 'FLEXIBLE',
      });
      await expect(
        offers.reorderForMember(ids.helena, g.id, ids.anaM, [daColega.id, primeira]),
      ).rejects.toThrow(NotFoundException);
      const daAna = await prisma.workoutPlan.findFirstOrThrow({ where: { userId: ids.ana } });
      await expect(plans.reorder(ids.colega, [daAna.id])).rejects.toThrow(NotFoundException);
    });

    it('a agenda da ficha traz o treino planejado; "feito" e pesagem só com a categoria liberada', async () => {
      // A Ana renomeia a cópia e remarca o primeiro dia: é dado de Treino dela.
      const copia = await prisma.workoutPlan.findFirstOrThrow({
        where: { userId: ids.ana, fromOfferId: segunda },
      });
      await prisma.workoutPlan.update({ where: { id: copia.id }, data: { name: 'Nome só meu' } });
      await prisma.plannedSession.updateMany({
        where: { planId: copia.id, date: today },
        data: { date: addDaysIso(today, 1), originalDate: today },
      });
      const daHelena = await file.agenda(ids.helena, g.id, ids.anaM, today, addDaysIso(today, 6));
      const itens = daHelena.days.flatMap((d) => d.items);
      expect(daHelena.showsDone).toBe(true);
      expect(daHelena.showsWeighins).toBe(true);
      expect(itens.filter((i) => i.kind === 'planned').length).toBe(7);
      expect(itens.some((i) => i.title === 'Nome só meu')).toBe(true);
      expect(itens.find((i) => i.kind === 'weighin')?.weightKg).toBe(70.2);

      const doBruno = await file.agenda(ids.bruno, g.id, ids.anaM, today, addDaysIso(today, 6));
      const deles = doBruno.days.flatMap((d) => d.items);
      expect(doBruno.showsDone).toBe(false);
      expect(deles.filter((i) => i.kind === 'planned').length).toBe(7);
      expect(deles.some((i) => i.kind === 'weighin')).toBe(false);
      expect(deles.every((i) => i.state === 'planned')).toBe(true);
      // Sem Treino: o título e os dias são os da versão que a equipe mandou.
      expect(deles.some((i) => i.title === 'Nome só meu')).toBe(false);
      expect(doBruno.days.map((d) => d.items.filter((i) => i.kind === 'planned').length)).toEqual([
        1, 1, 1, 1, 1, 1, 1,
      ]);
      expect(deles.every((i) => i.kind !== 'planned' || i.title === 'Glúteos e posterior')).toBe(
        true,
      );
      const f = await file.file(ids.bruno, g.id, ids.anaM);
      expect(f.nextDays.flatMap((d) => d.items).some((i) => i.title === 'Nome só meu')).toBe(false);
    });

    it('"Terminar hoje" tira a agenda de amanhã em diante e deixa a cópia com a Ana', async () => {
      // Uma linha de outra pessoa que aponta para a mesma oferta não é tocada.
      const alheio = await prisma.workoutPlan.create({
        data: { userId: ids.colega, name: 'Da colega', fromOfferId: segunda },
      });
      await prisma.plannedSession.create({
        data: { userId: ids.colega, planId: alheio.id, date: addDaysIso(today, 3), order: 1 },
      });
      await expect(
        offers.removeForMember(ids.nina, g.id, ids.anaM, segunda, {
          notify: false,
          endToday: true,
        }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        offers.removeForMember(ids.helena, g.id, ids.anaM, segunda, {
          notify: false,
          endToday: true,
        }),
      ).resolves.toEqual({ offerId: segunda, result: 'ended' });
      const copia = await prisma.workoutPlan.findFirstOrThrow({
        where: { userId: ids.ana, fromOfferId: segunda },
      });
      expect(
        await prisma.plannedSession.count({ where: { planId: copia.id, date: { gt: today } } }),
      ).toBe(0);
      const f = await file.file(ids.helena, g.id, ids.anaM);
      expect(f.plans.workout.find((p) => p.offerId === segunda)?.status).toBe('ENDED');
      expect(notify).not.toHaveBeenCalled();
      expect(await prisma.plannedSession.count({ where: { planId: alheio.id } })).toBe(1);
      await prisma.workoutPlan.delete({ where: { id: alheio.id } });

      // Terminada não recebe versão nova.
      await expect(
        offers.update(ids.helena, ids.anaM, segunda, {
          planId: planoDaHelena,
          schedule: 'FLEXIBLE',
        }),
      ).rejects.toThrow(ConflictException);

      // No app da Ana o plano aparece terminado hoje, não vigente.
      const agenda = await agendaDaPessoa.range(ids.ana, TZ);
      expect(agenda.calendarPlan?.planId).not.toBe(copia.id);
      expect(
        agenda.days
          .flatMap((d) => d.items)
          .every((i) => i.planId !== copia.id || i.endDate === today),
      ).toBe(true);
    });

    it('"Apagar da Ana" tira a cópia e a oferta, mas o treino que ela registrou fica', async () => {
      const jsonParaVoce = async () => JSON.stringify(await forYou.get(ids.ana, g.id));
      const enviados = async () =>
        (await panel.overview(ids.helena, g.id, 7)).items.sent.map((i) => i.id);
      expect(await jsonParaVoce()).toContain(primeira);
      expect(await enviados()).toContain(primeira);
      const copia = await prisma.workoutPlan.findFirstOrThrow({
        where: { userId: ids.ana, fromOfferId: primeira },
      });
      const sessao = await prisma.workoutSession.create({
        data: {
          userId: ids.ana,
          planId: copia.id,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });

      // O dono apaga o que a Helena mandou.
      await expect(
        offers.removeForMember(ids.bruno, g.id, ids.anaM, primeira, {
          notify: true,
          endToday: false,
        }),
      ).resolves.toEqual({ offerId: primeira, result: 'removed' });

      expect(await prisma.workoutPlan.count({ where: { id: copia.id } })).toBe(0);
      const ficou = await prisma.workoutSession.findUniqueOrThrow({ where: { id: sessao.id } });
      expect(ficou.planId).toBeNull();
      expect(notify).toHaveBeenCalledWith([ids.ana], expect.anything());

      const f = await file.file(ids.helena, g.id, ids.anaM);
      expect(f.plans.workout.map((p) => p.offerId)).not.toContain(primeira);
      const daAna = await offers.list(ids.ana);
      expect([...daAna.pending, ...daAna.accepted].map((o) => o.id)).not.toContain(primeira);
      await expect(offers.get(ids.ana, primeira)).rejects.toThrow(NotFoundException);
      // A linha fica para o export dela.
      expect(await prisma.planOffer.count({ where: { id: primeira } })).toBe(1);
      expect(await jsonParaVoce()).not.toContain(primeira);
      expect(await enviados()).not.toContain(primeira);
      // Apagada não recebe versão nova.
      await expect(
        offers.update(ids.helena, ids.anaM, primeira, {
          planId: planoDaHelena,
          schedule: 'FLEXIBLE',
        }),
      ).rejects.toThrow(NotFoundException);
      // Apagar de novo é 404.
      await expect(
        offers.removeForMember(ids.helena, g.id, ids.anaM, primeira, {
          notify: false,
          endToday: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('anotações da equipe', () => {
    let nota = '';

    it('a equipe anota; membro comum não; texto vazio é recusado', async () => {
      await expect(notes.create(ids.colega, g.id, ids.anaM, 'oi')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(notes.create(ids.helena, g.id, ids.anaM, '   ')).rejects.toThrow(
        BadRequestException,
      );
      await expect(notes.create(ids.helena, g.id, ids.deOutroGrupoM, 'oi')).rejects.toThrow(
        NotFoundException,
      );
      const criada = await notes.create(
        ids.helena,
        g.id,
        ids.anaM,
        ' Joelho direito dói no agachamento. ',
      );
      nota = criada.id;
      expect(criada).toMatchObject({
        text: 'Joelho direito dói no agachamento.',
        authorName: 'Helena Prado',
        isMine: true,
        canEdit: true,
      });
      const f = await file.file(ids.nina, g.id, ids.anaM);
      expect(f.notes).toEqual([
        expect.objectContaining({ id: nota, isMine: false, canEdit: false }),
      ]);
    });

    it('editar e apagar é do autor ou do dono', async () => {
      await expect(notes.update(ids.nina, g.id, ids.anaM, nota, 'x')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(notes.remove(ids.nina, g.id, ids.anaM, nota)).rejects.toThrow(
        ForbiddenException,
      );
      // A nota da Ana não se edita pela associação da colega.
      await expect(notes.update(ids.helena, g.id, ids.colegaM, nota, 'x')).rejects.toThrow(
        NotFoundException,
      );
      const editada = await notes.update(ids.bruno, g.id, ids.anaM, nota, 'Joelho melhorou.');
      expect(editada.text).toBe('Joelho melhorou.');
    });

    it('a Ana lê as notas dela, só da comunidade pedida; a colega não lê as da Ana', async () => {
      const daAna = await notes.mine(ids.ana, g.id);
      expect(daAna).toEqual([
        expect.objectContaining({ id: nota, text: 'Joelho melhorou.', authorName: 'Helena Prado' }),
      ]);
      expect(JSON.stringify(daAna)).not.toContain(ids.helena);
      expect(await notes.mine(ids.colega, g.id)).toEqual([]);
      await expect(notes.mine(ids.ana, g.outro)).rejects.toThrow(NotFoundException);
    });

    it('a nota entra no export da Ana', async () => {
      const conta = new AccountService(
        prisma,
        {} as LogtoManagementService,
        {} as CheckpointPurgeService,
      );
      // Tipo solto de propósito: o campo é o que este teste exige do export.
      const exp = (await conta.exportData(ids.ana)) as unknown as {
        memberNotes: unknown;
        counts: Record<string, number>;
      };
      expect(exp.memberNotes).toEqual([
        expect.objectContaining({ text: 'Joelho melhorou.', authorName: 'Helena Prado' }),
      ]);
      expect(exp.counts.memberNotes).toBe(1);
    });

    it('remover e banir também apagam as notas', async () => {
      await notes.create(ids.helena, g.id, ids.ruiM, 'Nota do Rui');
      await notes.create(ids.helena, g.id, ids.biaM, 'Nota da Bia');
      await memberships.removeMember(ids.bruno, g.id, ids.ruiM);
      await memberships.ban(ids.bruno, g.id, ids.biaM);
      expect(
        await prisma.memberNote.count({
          where: { groupId: g.id, text: { in: ['Nota do Rui', 'Nota da Bia'] } },
        }),
      ).toBe(0);
    });

    it('sair da comunidade apaga as notas e encerra os planos que esperavam aceite', async () => {
      const pendente = await offers.sendToMember(ids.helena, g.id, ids.anaM, {
        templateId: t.hipertrofia,
        schedule: 'FLEXIBLE',
      });
      await memberships.leave(ids.ana, g.id);
      expect(await prisma.memberNote.count({ where: { subjectUserId: ids.ana } })).toBe(0);
      const versao = await prisma.planOfferVersion.findUniqueOrThrow({
        where: { id: pendente.versionId },
      });
      expect(versao.status).toBe('SUPERSEDED');
      expect((await offers.list(ids.ana)).pending.map((o) => o.id)).not.toContain(pendente.id);
    });
  });
});
