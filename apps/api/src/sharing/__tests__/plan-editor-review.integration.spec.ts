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
  const today = todayInTz(TZ);
  const stamp = `rev406-${Date.now()}`;
  const users: string[] = [];
  let n = 0;
  let ex: number[] = [];
  let cardio = 0;
  let coach = '';
  let gid = '';
  void [content, today, addDaysIso, () => cardio]; // os casos D2-D4 vêm a seguir
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
});
