import { PrismaService } from '../../common/prisma.service';
import { WorkoutSessionService } from '../workout-session.service';

/**
 * % de 1RM na sessão (#406, recomendação 2): a equipe prescreve "75% 1RM" e a
 * pessoa vê a carga em kg, calculada do 1RM estimado dela (melhor série de
 * força do exercício). Sem histórico, "sem 1RM": a carga fica nula.
 */
describe('carga em % de 1RM na sessão (#406, banco real)', () => {
  const prisma = new PrismaService();
  const sessions = new WorkoutSessionService(prisma);
  const stamp = `t406-1rm-${Date.now()}`;
  let userId = '';
  let outraId = '';
  let agachamento = 0;
  let remada = 0;
  let planId = '';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do banco de teste.');
    const [user, outra] = await Promise.all([
      prisma.user.create({
        data: { logtoSub: `${stamp}-a`, email: `${stamp}-a@test.local`, name: 'Ana' },
      }),
      prisma.user.create({
        data: { logtoSub: `${stamp}-b`, email: `${stamp}-b@test.local`, name: 'Bia' },
      }),
    ]);
    userId = user.id;
    outraId = outra.id;
    [agachamento, remada] = (
      await prisma.exercise.findMany({
        where: { createdByUserId: null, groupOwned: false, muscleGroup: { not: 'cardio' } },
        take: 2,
        orderBy: { id: 'asc' },
        select: { id: true },
      })
    ).map((e) => e.id) as [number, number];
    planId = (
      await prisma.workoutPlan.create({
        data: {
          userId,
          name: 'Inferior',
          exercises: {
            create: [
              {
                exerciseId: agachamento,
                order: 1,
                targetSets: 4,
                targetReps: '6-8',
                loadMode: 'PERCENT_1RM',
                loadPercent: 75,
              },
              { exerciseId: remada, order: 2, targetSets: 3, targetReps: '10', startLoadKg: 30 },
            ],
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.workoutSession.deleteMany({ where: { userId: { in: [userId, outraId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, outraId] } } });
    await prisma.$disconnect();
  });

  const doPlano = async () => {
    const aberta = await sessions.start(userId, { planId });
    const v = await sessions.findById(userId, aberta.id);
    await prisma.workoutSession.delete({ where: { id: aberta.id } });
    return v.plannedExercises;
  };

  it('sem histórico, "sem 1RM": a carga fica nula', async () => {
    const [a, b] = await doPlano();
    expect(a).toMatchObject({ loadMode: 'PERCENT_1RM', loadPercent: 75, percentLoadKg: null });
    expect(b!.percentLoadKg).toBeNull();
  });

  it('com histórico, a carga é a % do 1RM estimado, em 0,5 kg; só o dela conta', async () => {
    // A série de outra pessoa, mais pesada, não entra no 1RM da Ana.
    await prisma.workoutSession.create({
      data: {
        userId: outraId,
        startedAt: new Date(Date.now() - 3 * 86_400_000),
        completedAt: new Date(Date.now() - 3 * 86_400_000 + 3_600_000),
        sets: { create: [{ exerciseId: agachamento, setNumber: 1, weightKg: 200, reps: 5 }] },
      },
    });
    await prisma.workoutSession.create({
      data: {
        userId,
        startedAt: new Date(Date.now() - 2 * 86_400_000),
        completedAt: new Date(Date.now() - 2 * 86_400_000 + 3_600_000),
        sets: {
          create: [
            // 100 × 6 → 1RM 120; 75% = 90 kg.
            { exerciseId: agachamento, setNumber: 1, weightKg: 100, reps: 6 },
            { exerciseId: agachamento, setNumber: 2, weightKg: 90, reps: 6 },
          ],
        },
      },
    });
    const [a, b] = await doPlano();
    expect(a!.percentLoadKg).toBe(90);
    // Fora do modo % de 1RM, nada a calcular.
    expect(b!.percentLoadKg).toBeNull();
  });
});
