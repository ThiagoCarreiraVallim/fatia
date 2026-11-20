import type { NotificationService } from '../../notifications/notification.service';
import { PrismaService } from '../../common/prisma.service';
import { addDaysIso, todayInTz } from '../../progress/helpers/date-tz';
import { ExerciseService } from '../../workout/exercise.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { PlanMaterializerService } from '../../sharing/plan-materializer.service';
import { PlanOfferService } from '../../sharing/plan-offer.service';
import { ContentService } from '../../sharing/content.service';
import { MealTemplateService } from '../../nutrition/meal-template.service';
import type { MealService } from '../../nutrition/meal.service';
import { UserGoalsService } from '../../nutrition/user-goals.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';

/**
 * Revisão do PR #462 (#406): os defeitos achados, cada um com a prova de que
 * volta a quebrar se a correção sair.
 */
describe('editor de plano: revisão do PR #462 (#406)', () => {
  const prisma = new PrismaService();
  const notifications = { notify: jest.fn() } as unknown as NotificationService;
  const plans = new WorkoutPlanService(prisma);
  const materializer = new PlanMaterializerService(prisma, new ExerciseService(prisma));
  const offers = new PlanOfferService(prisma, materializer, notifications, plans);
  const content = new ContentService(
    prisma,
    plans,
    new MealTemplateService(prisma, {} as unknown as MealService),
    new UserGoalsService(prisma),
    materializer,
    new MediaService(prisma, new MemoryObjectStore()),
  );
  const TZ = 'America/Sao_Paulo';
  const KEY_A = '0a0a0a0a-0000-4000-8000-00000000000a';
  const KEY_B = '0b0b0b0b-0000-4000-8000-00000000000b';
  const today = todayInTz(TZ);
  const stamp = `rev406-${Date.now()}`;
  const users: string[] = [];
  let n = 0;
  let ex: number[] = [];
  let cardio = 0;
  let coach = '';
  let gid = '';
  async function student() {
    const id = await person();
    await prisma.professionalLink.create({
      data: { subjectUserId: id, professionalId: coach, groupId: gid, scopes: ['WORKOUT'] },
    });
    return id;
  }

  async function person() {
    n += 1;
    const u = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: `${stamp}-${n}@t.local`,
        name: `p${n}`,
        timezone: TZ,
      },
    });
    users.push(u.id);
    return u.id;
  }

  const item = (id: number, extra: Record<string, unknown> = {}) => ({
    type: 'exercise',
    source: 'catalog',
    catalogExerciseId: id,
    targetSets: 3,
    targetReps: '10',
    ...extra,
  });

  beforeAll(async () => {
    await prisma.$connect();
    coach = await person();
    gid = (
      await prisma.group.create({
        data: { type: 'SPONSORED', name: 'G0', slug: `${stamp}-g0`, ownerId: coach, autoPosts: [] },
      })
    ).id;
    ex = (
      await prisma.exercise.findMany({
        where: { createdByUserId: null, groupOwned: false, muscleGroup: { not: 'cardio' } },
        take: 4,
        orderBy: { id: 'asc' },
        select: { id: true },
      })
    ).map((e) => e.id);
    cardio = (
      await prisma.exercise.findFirstOrThrow({
        where: { createdByUserId: null, groupOwned: false, muscleGroup: 'cardio' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.workoutSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.workoutPlan.deleteMany({ where: { userId: { in: users } } });
    await prisma.group.deleteMany({ where: { slug: { startsWith: stamp } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('D1: a pessoa troca a carga de % de 1RM para peso pelo app (PATCH só com loadMode)', async () => {
    const ana = await student();
    const offer = await prisma.planOffer.create({
      data: {
        userId: ana,
        authorId: coach,
        groupId: gid,
        versions: {
          create: {
            version: 1,
            title: 'Força',
            snapshotVersion: 2,
            schedule: 'FLEXIBLE',
            snapshot: {
              version: 2,
              name: 'Força',
              sessions: [
                { name: '', items: [item(ex[0]!, { loadMode: 'PERCENT_1RM', loadPercent: 75 })] },
              ],
            },
          },
        },
      },
      include: { versions: true },
    });
    await offers.accept(ana, offer.id, offer.versions[0]!.id, TZ);
    const plan = await prisma.workoutPlan.findFirstOrThrow({
      where: { userId: ana, fromOfferId: offer.id },
      include: { exercises: true },
    });
    const pe = plan.exercises[0]!;
    expect(pe.loadMode).toBe('PERCENT_1RM');
    // O app (planDraftToInput) não conhece loadPercent: manda só loadMode.
    await expect(
      plans.updatePlanExercise(ana, plan.id, pe.id, { loadMode: 'WEIGHT', startLoadKg: 60 }),
    ).resolves.toBeDefined();
  });

  it('D1: mandar % de 1RM junto com outra carga continua sendo 400', async () => {
    const ana = await student();
    const plan = await prisma.workoutPlan.create({ data: { userId: ana, name: 'Força' } });
    await expect(
      plans.addExercise(ana, plan.id, {
        exerciseId: ex[0]!,
        targetSets: 3,
        targetReps: '10',
        loadMode: 'WEIGHT',
        loadPercent: 70,
      }),
    ).rejects.toThrow('A % de 1RM vale só com a carga em % de 1RM.');
  });

  it('D1: trocar para peso apaga a % de 1RM guardada', async () => {
    const ana = await student();
    const plan = await prisma.workoutPlan.create({ data: { userId: ana, name: 'Força' } });
    const pe = await plans.addExercise(ana, plan.id, {
      exerciseId: ex[0]!,
      targetSets: 3,
      targetReps: '10',
      loadMode: 'PERCENT_1RM',
      loadPercent: 75,
    });
    await plans.updatePlanExercise(ana, plan.id, pe.id, { loadMode: 'WEIGHT' });
    const row = await prisma.workoutPlanExercise.findUniqueOrThrow({ where: { id: pe.id } });
    expect(row).toMatchObject({ loadMode: 'WEIGHT', loadPercent: null });
  });

  it('D3: documento do editor com duas intensidades de cardio (zona e RPE) é recusado como no REST', async () => {
    const owner = await person();
    const g = await prisma.group.create({
      data: { type: 'SPONSORED', name: 'G', slug: `${stamp}-g`, ownerId: owner, autoPosts: [] },
    });
    await prisma.groupMembership.create({
      data: { groupId: g.id, userId: owner, role: 'OWNER', status: 'ACTIVE' },
    });
    const doc = {
      sessions: [
        {
          name: 'C',
          items: [
            {
              type: 'exercise',
              exerciseId: cardio,
              targetSets: 1,
              targetReps: '1',
              cardioTarget: 'CALORIES',
              cardioZone: 2,
              cardioRpe: 9,
            },
          ],
        },
      ],
    };
    await expect(
      content.createWorkoutTemplate(owner, g.id, { title: 'x', document: doc }),
    ).rejects.toThrow(/intensidade/);
    // Meta por calorias sem as calorias, também como no REST.
    const semCalorias = structuredClone(doc);
    delete (semCalorias.sessions[0]!.items[0] as Record<string, unknown>).cardioRpe;
    await expect(
      content.createWorkoutTemplate(owner, g.id, { title: 'x', document: semCalorias }),
    ).rejects.toThrow(/calorias/);
    // Completo, passa.
    const ok = structuredClone(semCalorias);
    (ok.sessions[0]!.items[0] as Record<string, unknown>).cardioCalories = 300;
    await expect(
      content.createWorkoutTemplate(owner, g.id, { title: 'x', document: ok }),
    ).resolves.toBeDefined();
  });

  it('D2: versão aceita para o futuro com uma sessão a menos: a agenda futura fica só nos planos da versão nova', async () => {
    const ana = await student();
    const v1Start = addDaysIso(today, -21);
    const twoSessions = {
      version: 2,
      name: 'AB',
      sessions: [
        { name: 'A', items: [item(ex[0]!)] },
        { name: 'B', items: [item(ex[1]!)] },
      ],
    };
    const offer = await prisma.planOffer.create({
      data: {
        userId: ana,
        authorId: coach,
        groupId: gid,
        versions: {
          create: {
            version: 1,
            title: 'AB',
            snapshotVersion: 2,
            schedule: 'CALENDAR',
            startDate: v1Start,
            weeks: 8,
            weekdays: [1, 2, 3, 4, 5],
            snapshot: twoSessions,
          },
        },
      },
      include: { versions: true },
    });
    await offers.accept(ana, offer.id, offer.versions[0]!.id, TZ);
    const before = await prisma.workoutPlan.findMany({
      where: { userId: ana, fromOfferId: offer.id },
    });
    expect(before).toHaveLength(2);

    // v2: uma sessão só, começando daqui a 7 dias.
    const v2Start = addDaysIso(today, 7);
    const v2 = await prisma.planOfferVersion.create({
      data: {
        offerId: offer.id,
        version: 2,
        title: 'A',
        snapshotVersion: 2,
        schedule: 'CALENDAR',
        startDate: v2Start,
        weeks: 4,
        weekdays: [1, 2, 3, 4, 5],
        snapshot: { version: 2, name: 'A', sessions: [{ name: 'A', items: [item(ex[2]!)] }] },
      },
    });
    await offers.accept(ana, offer.id, v2.id, TZ);
    // No aceite, a agenda futura da v2 já fica só no plano da sessão que ela tem.
    const pa = before.find((p) => p.sessionIndex === 0)!;
    const accepted = await prisma.plannedSession.findMany({
      where: { userId: ana, offerVersionId: v2.id },
      select: { planId: true },
    });
    expect(accepted.length).toBe(20);
    expect(new Set(accepted.map((r) => r.planId))).toEqual(new Set([pa.id]));
    // O tempo passa: a v2 começa hoje e o job assume.
    await prisma.planOfferVersion.update({ where: { id: v2.id }, data: { startDate: today } });
    await offers.settleScheduledVersions();

    const linked = new Set(
      (await prisma.workoutPlan.findMany({ where: { userId: ana, fromOfferId: offer.id } })).map(
        (p) => p.id,
      ),
    );
    const future = await prisma.plannedSession.findMany({
      where: { userId: ana, date: { gte: v2Start }, offerVersionId: v2.id },
      include: { plan: { select: { name: true, fromOfferId: true } } },
    });
    const total = 4 * 5;
    const stray = future.filter((r) => !linked.has(r.planId));
    expect(future.length).toBeGreaterThan(total - 6); // a agenda da v2 existe inteira
    expect(stray).toHaveLength(0);
  });

  // D4: a sessão é casada pela chave estável, não pela posição.
  async function keyedOffer(ana: string) {
    const offer = await prisma.planOffer.create({
      data: {
        userId: ana,
        authorId: coach,
        groupId: gid,
        versions: {
          create: {
            version: 1,
            title: 'AB',
            snapshotVersion: 2,
            schedule: 'FLEXIBLE',
            snapshot: {
              version: 2,
              name: 'AB',
              sessions: [
                { key: KEY_A, name: 'A', items: [item(ex[0]!)] },
                { key: KEY_B, name: 'B', items: [item(ex[1]!)] },
              ],
            },
          },
        },
      },
      include: { versions: true },
    });
    await offers.accept(ana, offer.id, offer.versions[0]!.id, TZ);
    const [pa, pb] = await Promise.all(
      [KEY_A, KEY_B].map((sessionKey) =>
        prisma.workoutPlan.findFirstOrThrow({
          where: { userId: ana, fromOfferId: offer.id, sessionKey },
        }),
      ),
    );
    return { offer, pa: pa!, pb: pb! };
  }

  async function nextVersion(offerId: string, version: number, sessions: unknown[]) {
    return prisma.planOfferVersion.create({
      data: {
        offerId,
        version,
        title: 'v',
        snapshotVersion: 2,
        schedule: 'FLEXIBLE',
        snapshot: { version: 2, name: 'v', sessions } as never,
      },
    });
  }

  const exercisesOf = async (planId: string) =>
    (await prisma.workoutPlanExercise.findMany({ where: { planId } })).map((e) => e.exerciseId);

  it('D4: tirar a sessão A na cópia: A fica com a pessoa, solta, e B segue no plano de B', async () => {
    const ana = await student();
    const { offer, pa, pb } = await keyedOffer(ana);
    await prisma.workoutSession.create({
      data: { userId: ana, planId: pa.id, startedAt: new Date(), completedAt: new Date() },
    });
    const v2 = await nextVersion(offer.id, 2, [{ key: KEY_B, name: 'B', items: [item(ex[1]!)] }]);
    await offers.accept(ana, offer.id, v2.id, TZ);

    const a = await prisma.workoutPlan.findUniqueOrThrow({ where: { id: pa.id } });
    expect(a.fromOfferId).toBeNull();
    expect(await exercisesOf(pa.id)).toEqual([ex[0]]);
    const b = await prisma.workoutPlan.findUniqueOrThrow({ where: { id: pb.id } });
    expect(b.fromOfferId).toBe(offer.id);
    expect(await exercisesOf(pb.id)).toEqual([ex[1]]);
  });

  it('D4: sessão que sai sem histórico é apagada; trocar a ordem não troca os planos', async () => {
    const ana = await student();
    const { offer, pa, pb } = await keyedOffer(ana);
    const v2 = await nextVersion(offer.id, 2, [
      { key: KEY_B, name: 'B', items: [item(ex[1]!)] },
      { key: KEY_A, name: 'A', items: [item(ex[0]!)] },
    ]);
    await offers.accept(ana, offer.id, v2.id, TZ);
    expect(await exercisesOf(pa.id)).toEqual([ex[0]]);
    expect(await exercisesOf(pb.id)).toEqual([ex[1]]);

    const v3 = await nextVersion(offer.id, 3, [{ key: KEY_B, name: 'B', items: [item(ex[1]!)] }]);
    await offers.accept(ana, offer.id, v3.id, TZ);
    expect(await prisma.workoutPlan.findUnique({ where: { id: pa.id } })).toBeNull();
    expect(await exercisesOf(pb.id)).toEqual([ex[1]]);
  });

  it('D4: o editor dá chave a cada sessão e a chave volta na leitura', async () => {
    const owner = await person();
    const g = await prisma.group.create({
      data: { type: 'SPONSORED', name: 'G4', slug: `${stamp}-g4`, ownerId: owner, autoPosts: [] },
    });
    await prisma.groupMembership.create({
      data: { groupId: g.id, userId: owner, role: 'OWNER', status: 'ACTIVE' },
    });
    const ref = (id: number) => ({
      type: 'exercise',
      exerciseId: id,
      targetSets: 3,
      targetReps: '10',
    });
    const doc = {
      sessions: [
        { name: 'A', items: [ref(ex[0]!)] },
        { key: KEY_B, name: 'B', items: [ref(ex[1]!)] },
      ],
    };
    const t = await content.createWorkoutTemplate(owner, g.id, { title: 'x', document: doc });
    const row = await prisma.groupPlanTemplate.findUniqueOrThrow({ where: { id: t.id } });
    const keys = (row.snapshot as { sessions: Array<{ key?: string }> }).sessions.map((s) => s.key);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(KEY_B);
    expect(t.document?.sessions.map((s) => s.key)).toEqual(keys);
  });

  it('P2: o plano adotado de um modelo com sessões é o da sessão A', async () => {
    const owner = await person();
    const g = await prisma.group.create({
      data: { type: 'SPONSORED', name: 'G5', slug: `${stamp}-g5`, ownerId: owner, autoPosts: [] },
    });
    const ana = await person();
    await prisma.groupMembership.createMany({
      data: [
        { groupId: g.id, userId: owner, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g.id, userId: ana, role: 'MEMBER', status: 'ACTIVE' },
      ],
    });
    const ref = (id: number) => ({
      type: 'exercise',
      exerciseId: id,
      targetSets: 3,
      targetReps: '10',
    });
    const t = await content.createWorkoutTemplate(owner, g.id, {
      title: 'ABC',
      document: {
        sessions: [
          { name: 'A', items: [ref(ex[0]!)] },
          { name: 'B', items: [ref(ex[1]!)] },
          { name: 'C', items: [ref(ex[2]!)] },
        ],
      },
    });
    await prisma.groupPlanTemplate.update({
      where: { id: t.id },
      data: { publishedAt: new Date() },
    });
    const row = await prisma.groupPlanTemplate.findUniqueOrThrow({ where: { id: t.id } });
    await materializer.materialize(ana, row.snapshot, t.id, g.id);
    const a = await prisma.workoutPlan.findFirstOrThrow({
      where: { userId: ana, fromTemplateId: t.id, sessionIndex: 0 },
    });
    const list = await content.listWorkoutTemplatesForMe(ana);
    const mine = list.flatMap((x) => x.templates).find((x) => x.id === t.id);
    expect(mine?.adoptedPlanId).toBe(a.id);
  });
});
