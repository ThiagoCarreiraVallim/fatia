import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MealService } from '../../nutrition/meal.service';
import { MealTemplateService } from '../../nutrition/meal-template.service';
import { UserGoalsService } from '../../nutrition/user-goals.service';
import type { NotificationService } from '../../notifications/notification.service';
import { todayInTz } from '../../progress/helpers/date-tz';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { ExerciseService } from '../../workout/exercise.service';
import { isoWeekday } from '../../workout/helpers/planned-schedule';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { AccessAuditService } from '../access-audit.service';
import { ContentService } from '../content.service';
import { PlanCopyService } from '../plan-copy.service';
import { PlanMaterializerService } from '../plan-materializer.service';
import { PlanOfferService } from '../plan-offer.service';
import type { PlanSnapshotV2 } from '../plan-snapshot-v2';
import { ProfessionalAccessService } from '../professional-access.service';

/**
 * O editor de plano de treino da equipe (#406, Pn-09 a Pn-09e), no Postgres real.
 *
 * Roteiro: a Helena monta o "Inferior v2" no editor com sessões A–D (A segunda,
 * B quinta, C cardio, D um Tabata), com faixa de repetições, % de 1RM,
 * aquecimento, um AMRAP dentro da sessão B e cardio em zona 2; manda para a
 * Ana, que aceita e treina; depois a Helena edita a cópia da Ana pela ficha
 * ("Salvar na cópia da Ana"): vira uma versão nova, o modelo não muda, e nada
 * do que a Ana registrou se perde.
 */
describe('editor de plano de treino (#406, banco real)', () => {
  const prisma = new PrismaService();
  const notify = jest.fn();
  const notifications = { notify } as unknown as NotificationService;
  const plans = new WorkoutPlanService(prisma);
  const materializer = new PlanMaterializerService(prisma, new ExerciseService(prisma));
  const content = new ContentService(
    prisma,
    plans,
    new MealTemplateService(prisma, {} as unknown as MealService),
    new UserGoalsService(prisma),
    materializer,
    new MediaService(prisma, new MemoryObjectStore()),
  );
  const offers = new PlanOfferService(prisma, materializer, notifications, plans);
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const copies = new PlanCopyService(prisma, offers, access, notifications);

  const TZ = 'America/Sao_Paulo';
  const today = todayInTz(TZ);
  const stamp = `editor-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  const u: Record<string, string> = {};
  const m: Record<string, string> = {};
  let n = 0;
  let g = '';
  let g2 = '';
  let forca: number[] = [];
  let cardio = 0;
  let daComunidade = 0;
  let daOutraComunidade = 0;
  let doCarlos = 0;
  let daHelena = 0;

  async function pessoa(k: string, nome = k) {
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
    u[k] = user.id;
    return user.id;
  }

  const membershipOf = async (groupId: string, userId: string) =>
    (
      await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId } },
      })
    ).id;

  async function exercicio(nome: string, extra: Record<string, unknown>) {
    return (
      await prisma.exercise.create({
        data: { name: `${nome} ${stamp}`, muscleGroup: 'pernas', ...extra },
      })
    ).id;
  }

  /** O "Inferior v2" do roteiro, como a tela manda. */
  type Doc = {
    sessions: Array<{
      name: string;
      weekday?: number | null;
      items: Array<Record<string, unknown>>;
    }>;
  };

  function documento(): Doc {
    return {
      sessions: [
        {
          name: 'Pernas',
          weekday: 1,
          items: [
            {
              type: 'exercise',
              exerciseId: forca[0],
              targetSets: 4,
              targetReps: '6-8',
              loadMode: 'PERCENT_1RM',
              loadPercent: 75,
              restSeconds: 120,
              warmupBefore: true,
              notes: 'Desça até a paralela',
            },
            {
              type: 'exercise',
              exerciseId: daComunidade,
              targetSets: 3,
              targetReps: '12',
              loadMode: 'WEIGHT',
              startLoadKg: 40,
            },
          ],
        },
        {
          name: 'Posterior',
          weekday: 4,
          items: [
            { type: 'exercise', exerciseId: forca[1], targetSets: 3, targetReps: '10' },
            {
              type: 'circuit',
              name: 'Finalizador',
              format: 'AMRAP',
              durationSeconds: 720,
              exercises: [
                { type: 'exercise', exerciseId: forca[2], targetSets: 1, targetReps: '10' },
                {
                  type: 'exercise',
                  exerciseId: forca[3],
                  targetSets: 1,
                  targetReps: 'MAX',
                  repUnit: 'MAX',
                },
              ],
            },
          ],
        },
        {
          name: 'Cardio',
          items: [
            {
              type: 'exercise',
              exerciseId: cardio,
              targetSets: 1,
              targetReps: '1',
              cardioTarget: 'TIME',
              cardioDurationSeconds: 1800,
              cardioInclinePercent: 6,
              cardioZone: 2,
            },
          ],
        },
        {
          name: 'Tabata',
          items: [
            {
              type: 'circuit',
              format: 'TABATA',
              workSeconds: 20,
              restSeconds: 10,
              intervals: 8,
              exercises: [
                { type: 'exercise', exerciseId: forca[4], targetSets: 1, targetReps: '20' },
              ],
            },
          ],
        },
      ],
    };
  }

  let templateId = '';
  let offerId = '';

  beforeAll(async () => {
    await prisma.$connect();
    for (const k of ['bruno', 'helena', 'carlos', 'recepcao', 'ana', 'carla', 'ze'])
      await pessoa(k, k === 'helena' ? 'Helena Souza' : k);
    g = (
      await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'Academia',
          slug: `${stamp}-g`,
          ownerId: u.bruno!,
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
        { groupId: g, userId: u.recepcao!, role: 'RECEPTION', status: 'ACTIVE' },
        { groupId: g, userId: u.ana!, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g, userId: u.carla!, role: 'MEMBER', status: 'ACTIVE' },
        { groupId: g2, userId: u.helena!, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g2, userId: u.ze!, role: 'MEMBER', status: 'ACTIVE' },
      ],
    });
    for (const k of ['helena', 'carlos', 'recepcao', 'ana', 'carla'])
      m[k] = await membershipOf(g, u[k]!);
    m.ze = await membershipOf(g2, u.ze!);
    await prisma.professionalLink.createMany({
      data: [
        { subjectUserId: u.ana!, professionalId: u.helena!, groupId: g, scopes: ['WORKOUT'] },
        { subjectUserId: u.carla!, professionalId: u.helena!, groupId: g, scopes: ['WORKOUT'] },
        { subjectUserId: u.ze!, professionalId: u.helena!, groupId: g2, scopes: ['WORKOUT'] },
      ],
    });
    forca = (
      await prisma.exercise.findMany({
        where: { createdByUserId: null, groupOwned: false, muscleGroup: { not: 'cardio' } },
        take: 5,
        orderBy: { id: 'asc' },
        select: { id: true },
      })
    ).map((e) => e.id);
    cardio = (
      await prisma.exercise.findFirstOrThrow({
        where: { createdByUserId: null, groupOwned: false, muscleGroup: 'cardio' },
        select: { id: true },
      })
    ).id;
    daComunidade = await exercicio('Agachamento búlgaro', { groupOwned: true, groupId: g });
    daOutraComunidade = await exercicio('Da outra', { groupOwned: true, groupId: g2 });
    doCarlos = await exercicio('Do Carlos', { createdByUserId: u.carlos! });
    daHelena = await exercicio('Da Helena', { createdByUserId: u.helena! });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    // Os planos antes das contas: o exercício por valor é da própria pessoa.
    await prisma.workoutSession.deleteMany({ where: { userId: { in: criados } } });
    await prisma.workoutPlan.deleteMany({ where: { userId: { in: criados } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.exercise.deleteMany({
      where: { id: { in: [daComunidade, daOutraComunidade, doCarlos, daHelena] } },
    });
    await prisma.$disconnect();
  });

  beforeEach(() => notify.mockClear());

  describe('modelo da biblioteca montado no editor (Pn-09)', () => {
    it('cria o modelo com sessões, circuito, cardio, etiquetas e período', async () => {
      const v = await content.createWorkoutTemplate(u.helena!, g, {
        title: 'Inferior v2',
        document: documento(),
        level: 'intermediate',
        tags: ['Hipertrofia', ' força ', 'hipertrofia'],
        schedule: 'CALENDAR',
        startDate: '2026-12-01',
        endDate: '2027-01-31',
      });
      templateId = v.id;
      expect(v).toMatchObject({
        title: 'Inferior v2',
        draft: false,
        tags: ['hipertrofia', 'força'],
        schedule: 'CALENDAR',
        startDate: '2026-12-01',
        endDate: '2027-01-31',
        sessionCount: 4,
      });
      const row = await prisma.groupPlanTemplate.findUniqueOrThrow({ where: { id: v.id } });
      expect(row.snapshotVersion).toBe(2);
      const snap = row.snapshot as unknown as PlanSnapshotV2;
      expect(snap.sessions.map((s) => [s.name, s.weekday ?? null])).toEqual([
        ['Pernas', 1],
        ['Posterior', 4],
        ['Cardio', null],
        ['Tabata', null],
      ]);
      // O exercício da comunidade, no modelo da biblioteca, vai por referência.
      expect(snap.sessions[0]!.items[1]).toMatchObject({
        source: 'group',
        groupExerciseId: daComunidade,
      });
      expect(snap.sessions[0]!.items[0]).toMatchObject({
        source: 'catalog',
        targetReps: '6-8',
        loadMode: 'PERCENT_1RM',
        loadPercent: 75,
        warmupBefore: true,
      });
    });

    it('o editor relê o documento com nome e grupo de cada exercício', async () => {
      const v = await content.getTemplateForTeam(u.helena!, g, templateId);
      const doc = v.document!;
      expect(doc.sessions).toHaveLength(4);
      const bulgaro = doc.sessions[0]!.items[1]!;
      expect(bulgaro).toMatchObject({
        type: 'exercise',
        exerciseId: daComunidade,
        name: `Agachamento búlgaro ${stamp}`,
      });
      const amrap = doc.sessions[1]!.items[1]!;
      expect(amrap).toMatchObject({ type: 'circuit', format: 'AMRAP', durationSeconds: 720 });
      expect(doc.sessions[2]!.items[0]).toMatchObject({
        isCardio: true,
        cardioZone: 2,
        cardioInclinePercent: 6,
      });
    });

    it('salvar o documento troca o retrato do modelo', async () => {
      const doc = documento();
      doc.sessions[0]!.items[0]!.restSeconds = 150;
      const v = await content.updateTemplate(u.helena!, g, templateId, { document: doc });
      expect((v.document!.sessions[0]!.items[0] as { restSeconds?: number }).restSeconds).toBe(150);
    });

    it('exercício de outra comunidade ou de outra pessoa é 400, sem gravar', async () => {
      for (const id of [daOutraComunidade, doCarlos, 999_999_999]) {
        const doc = documento();
        doc.sessions[0]!.items[0]!.exerciseId = id;
        await expect(
          content.createWorkoutTemplate(u.helena!, g, { title: 'Intruso', document: doc }),
        ).rejects.toThrow(BadRequestException);
      }
      expect(
        await prisma.groupPlanTemplate.count({ where: { groupId: g, title: 'Intruso' } }),
      ).toBe(0);
    });

    it('o exercício da conta de quem edita viaja por valor', async () => {
      const doc = documento();
      doc.sessions[0]!.items[0]!.exerciseId = daHelena;
      const v = await content.createWorkoutTemplate(u.helena!, g, {
        title: 'Com exercício meu',
        document: doc,
      });
      const row = await prisma.groupPlanTemplate.findUniqueOrThrow({ where: { id: v.id } });
      const item = (row.snapshot as unknown as PlanSnapshotV2).sessions[0]!.items[0]!;
      expect(item).toMatchObject({ source: 'custom' });
      expect(JSON.stringify(item)).not.toContain(String(daHelena));
    });

    it('sessão vazia, circuito sem duração e dia repetido são recusados', async () => {
      const vazia = documento();
      vazia.sessions[2]!.items = [];
      const semDuracao = documento();
      delete (semDuracao.sessions[1]!.items[1] as { durationSeconds?: number }).durationSeconds;
      const diaRepetido = documento();
      diaRepetido.sessions[1]!.weekday = 1;
      for (const doc of [vazia, semDuracao, diaRepetido]) {
        await expect(
          content.createWorkoutTemplate(u.helena!, g, { title: 'Ruim', document: doc }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('etiqueta demais é 400', async () => {
      await expect(
        content.updateTemplate(u.helena!, g, templateId, {
          tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('a Ana recebe e aceita: uma cópia por sessão', () => {
    it('o aceite cria um plano por sessão, com circuito e agenda por dia da semana', async () => {
      const sent = await offers.sendToMember(u.helena!, g, m.ana!, {
        templateId,
        schedule: 'CALENDAR',
        startDate: today,
        weeks: 2,
        weekdays: [1, 4],
      });
      offerId = sent.id;
      await offers.accept(u.ana!, offerId, sent.versionId, TZ);

      const copias = await prisma.workoutPlan.findMany({
        where: { userId: u.ana!, fromOfferId: offerId },
        include: { exercises: { orderBy: { order: 'asc' } }, circuits: true, circuit: true },
        orderBy: { sessionIndex: 'asc' },
      });
      expect(copias.map((p) => p.sessionIndex)).toEqual([0, 1, 2, 3]);
      expect(copias.map((p) => p.name)).toEqual([
        'Inferior v2 · A · Pernas',
        'Inferior v2 · B · Posterior',
        'Inferior v2 · C · Cardio',
        'Inferior v2 · D · Tabata',
      ]);
      const [a, b, c, d] = copias;
      expect(a!.exercises[0]).toMatchObject({
        targetReps: '6-8',
        loadMode: 'PERCENT_1RM',
        loadPercent: 75,
        warmupBefore: true,
        restSeconds: 150,
      });
      // O exercício da comunidade chega na cópia por valor (#379).
      const bulgaro = await prisma.exercise.findUniqueOrThrow({
        where: { id: a!.exercises[1]!.exerciseId },
      });
      expect(bulgaro.createdByUserId).toBe(u.ana);
      // B: o AMRAP dentro da sessão de força.
      expect(b!.kind).toBe('STRENGTH');
      expect(b!.circuits).toHaveLength(1);
      expect(b!.circuits[0]).toMatchObject({ format: 'AMRAP', durationSeconds: 720 });
      expect(b!.exercises.filter((e) => e.circuitId === b!.circuits[0]!.id)).toHaveLength(2);
      expect(b!.exercises[2]).toMatchObject({ repUnit: 'MAX' });
      // C: o cardio em zona 2.
      expect(c!.exercises[0]).toMatchObject({
        cardioZone: 2,
        cardioInclinePercent: 6,
        cardioDurationSeconds: 1800,
      });
      // D: a sessão que é só um circuito vira um plano de circuito.
      expect(d!.kind).toBe('CIRCUIT');
      expect(d!.circuit).toMatchObject({
        format: 'TABATA',
        workSeconds: 20,
        restSeconds: 10,
        intervals: 8,
      });

      const agenda = await prisma.plannedSession.findMany({
        where: { userId: u.ana!, planId: { in: copias.map((p) => p.id) } },
      });
      expect(agenda.length).toBeGreaterThan(0);
      for (const s of agenda) {
        const dia = isoWeekday(s.date);
        expect(s.planId).toBe(dia === 1 ? a!.id : b!.id);
      }
    });
  });

  describe('editar a cópia da Ana pela ficha (Pn-09e)', () => {
    let planoA = '';
    let sessaoFeita = '';

    beforeAll(async () => {
      planoA = (
        await prisma.workoutPlan.findFirstOrThrow({
          where: { userId: u.ana!, fromOfferId: offerId, sessionIndex: 0 },
        })
      ).id;
      const exA = await prisma.workoutPlanExercise.findFirstOrThrow({
        where: { planId: planoA },
        orderBy: { order: 'asc' },
      });
      sessaoFeita = (
        await prisma.workoutSession.create({
          data: {
            userId: u.ana!,
            planId: planoA,
            fromPlan: true,
            planName: 'Inferior v2 · A · Pernas',
            startedAt: new Date(Date.now() - 86_400_000),
            completedAt: new Date(Date.now() - 86_000_000),
            sets: {
              create: [
                { exerciseId: exA.exerciseId, setNumber: 1, weightKg: 60, reps: 8 },
                { exerciseId: exA.exerciseId, setNumber: 2, weightKg: 62.5, reps: 8 },
              ],
            },
          },
        })
      ).id;
    });

    it('abre a cópia com o documento, o progresso e a última série da Ana', async () => {
      const v = await copies.get(u.helena!, g, m.ana!, offerId);
      expect(v).toMatchObject({
        offerId,
        studentName: 'ana',
        title: 'Inferior v2',
        template: { id: templateId, title: 'Inferior v2' },
        version: { version: 1, status: 'ACCEPTED' },
        pendingUpdate: false,
      });
      expect(v.document!.sessions).toHaveLength(4);
      expect(v.progress.done).toBe(1);
      expect(Object.values(v.lastSets)).toContainEqual({ weightKg: 62.5, reps: 8 });
      const trilha = await prisma.professionalAccessLog.findFirst({
        where: { subjectUserId: u.ana!, action: 'open_plan_copy', denied: false },
      });
      expect(trilha).not.toBeNull();
    });

    it('salvar grava uma versão nova; o modelo e a cópia em uso ficam como estão', async () => {
      const antes = await prisma.groupPlanTemplate.findUniqueOrThrow({ where: { id: templateId } });
      const aberta = await copies.get(u.helena!, g, m.ana!, offerId);
      const doc = JSON.parse(JSON.stringify(aberta.document)) as Doc;
      doc.sessions[0]!.items[0]!.restSeconds = 180;
      doc.sessions.pop(); // tira a sessão D (Tabata)

      const r = await copies.save(u.helena!, g, m.ana!, offerId, {
        document: doc,
        changeNote: 'Mais descanso no agachamento',
      });
      expect(r.version).toBe(2);
      const v2 = await prisma.planOfferVersion.findUniqueOrThrow({ where: { id: r.versionId } });
      expect(v2).toMatchObject({
        status: 'PENDING',
        authorId: u.helena,
        changeNote: 'Mais descanso no agachamento',
        snapshotVersion: 2,
      });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][0]).toEqual([u.ana]);
      expect(notify.mock.calls[0][1]).toMatchObject({ title: 'Helena ajustou seu treino' });

      // O modelo da biblioteca não muda.
      const depois = await prisma.groupPlanTemplate.findUniqueOrThrow({
        where: { id: templateId },
      });
      expect(depois.snapshot).toEqual(antes.snapshot);
      // A versão em uso continua a 1 até a Ana aceitar.
      const exA = await prisma.workoutPlanExercise.findFirstOrThrow({
        where: { planId: planoA },
        orderBy: { order: 'asc' },
      });
      expect(exA.restSeconds).toBe(150);
      expect(
        await prisma.workoutPlan.count({ where: { userId: u.ana!, fromOfferId: offerId } }),
      ).toBe(4);
    });

    it('a Ana aceita: a cópia muda e o que ela registrou fica', async () => {
      const v = await offers.get(u.ana!, offerId);
      expect(v.shown.status).toBe('PENDING');
      await offers.accept(u.ana!, offerId, v.shown.id, TZ);

      const exA = await prisma.workoutPlanExercise.findFirstOrThrow({
        where: { planId: planoA },
        orderBy: { order: 'asc' },
      });
      expect(exA.restSeconds).toBe(180);
      // A sessão feita continua no mesmo plano, com as séries.
      const feita = await prisma.workoutSession.findUniqueOrThrow({
        where: { id: sessaoFeita },
        include: { sets: true },
      });
      expect(feita.planId).toBe(planoA);
      expect(feita.sets).toHaveLength(2);
      // A sessão D saiu.
      expect(
        (
          await prisma.workoutPlan.findMany({
            where: { userId: u.ana!, fromOfferId: offerId },
            select: { sessionIndex: true },
            orderBy: { sessionIndex: 'asc' },
          })
        ).map((p) => p.sessionIndex),
      ).toEqual([0, 1, 2]);
    });

    it('"Avisar a Ana" desligado não manda aviso', async () => {
      const aberta = await copies.get(u.helena!, g, m.ana!, offerId);
      await copies.save(u.helena!, g, m.ana!, offerId, {
        document: aberta.document,
        title: 'Inferior v3',
        notify: false,
      });
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('isolamento da cópia', () => {
    const docValido = () => documento();

    it('profissional sem vínculo com a pessoa não abre nem salva (404)', async () => {
      await expect(copies.get(u.carlos!, g, m.ana!, offerId)).rejects.toThrow(NotFoundException);
      await expect(
        copies.save(u.carlos!, g, m.ana!, offerId, { document: docValido() }),
      ).rejects.toThrow(NotFoundException);
    });

    it('a recepção não tem member.plans (403)', async () => {
      await expect(copies.get(u.recepcao!, g, m.ana!, offerId)).rejects.toThrow(ForbiddenException);
    });

    it('oferta da Ana pela ficha da Carla, ou pessoa de outra comunidade, é 404', async () => {
      await expect(copies.get(u.helena!, g, m.carla!, offerId)).rejects.toThrow(NotFoundException);
      await expect(copies.get(u.helena!, g, m.ze!, offerId)).rejects.toThrow(NotFoundException);
      await expect(copies.get(u.helena!, g2, m.ana!, offerId)).rejects.toThrow(NotFoundException);
    });

    it('exercício de outra comunidade no corpo é 400 e não grava versão', async () => {
      const antes = await prisma.planOfferVersion.count({ where: { offerId } });
      const doc = docValido();
      doc.sessions[0]!.items[0]!.exerciseId = daOutraComunidade;
      await expect(copies.save(u.helena!, g, m.ana!, offerId, { document: doc })).rejects.toThrow(
        BadRequestException,
      );
      expect(await prisma.planOfferVersion.count({ where: { offerId } })).toBe(antes);
    });

    it('sem o vínculo de Treino, a cópia some (404) e a tentativa fica na trilha', async () => {
      await prisma.professionalLink.updateMany({
        where: { subjectUserId: u.ana!, professionalId: u.helena! },
        data: { revokedAt: new Date() },
      });
      try {
        await expect(copies.get(u.helena!, g, m.ana!, offerId)).rejects.toThrow(NotFoundException);
        const negada = await prisma.professionalAccessLog.findFirst({
          where: { subjectUserId: u.ana!, action: 'open_plan_copy', denied: true },
        });
        expect(negada).not.toBeNull();
      } finally {
        await prisma.professionalLink.updateMany({
          where: { subjectUserId: u.ana!, professionalId: u.helena! },
          data: { revokedAt: null },
        });
      }
    });

    it('plano terminado não recebe versão nova (409)', async () => {
      await prisma.planOffer.update({ where: { id: offerId }, data: { endedAt: new Date() } });
      await expect(
        copies.save(u.helena!, g, m.ana!, offerId, { document: docValido() }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
