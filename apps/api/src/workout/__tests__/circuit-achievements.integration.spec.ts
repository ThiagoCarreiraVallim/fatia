import { PrismaService } from '../../common/prisma.service';
import { AchievementService } from '../../progress/achievement.service';
import { ConsistencyService } from '../../progress/consistency.service';
import { CircuitSessionService } from '../circuit-session.service';
import { WorkoutPlanService } from '../workout-plan.service';
import { WorkoutSessionService } from '../workout-session.service';
import type { WorkoutFinishedHook } from '../workout-finished.hook';

/**
 * O circuito concluído é um treino concluído como qualquer outro para o progresso (#382): o
 * fim pelo relógio, o `log` com sessão aberta e o `log` sem sessão (o `log_circuit_result` do
 * MCP) disparam os mesmos `WORKOUT_FINISHED_HOOKS` do fim normal, e a sequência por dia ativo e
 * a constância do mês contam o dia do circuito.
 */
describe('circuito concluído e o progresso (banco real)', () => {
  const prisma = new PrismaService();
  const consistency = new ConsistencyService(prisma);
  const achievements = new AchievementService(prisma, consistency);
  // O mesmo gancho do `WorkoutHooksModule`, sem o Nest.
  const hooks: WorkoutFinishedHook[] = [
    { afterFinish: (userId) => achievements.evaluate({ userId, timezone: 'UTC' }) },
  ];
  const plans = new WorkoutPlanService(prisma);
  const sessions = new WorkoutSessionService(prisma, undefined, hooks);
  const circuits = new CircuitSessionService(prisma, hooks);
  const stamp = `circuito-conquista-${Date.now()}`;
  const userIds: string[] = [];
  let exerciseIds: number[];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do banco de teste.');
    const catalog = await prisma.exercise.findMany({
      where: { createdByUserId: null, groupOwned: false },
      orderBy: { id: 'asc' },
      take: 2,
      select: { id: true },
    });
    exerciseIds = catalog.map((e) => e.id);
    if (exerciseIds.length < 2) throw new Error('Rode o seed:exercises no banco de teste.');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function newUser(tag: string) {
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${tag}`, email: `${stamp}-${tag}@test.local`, name: tag },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function newAmrap(userId: string) {
    return plans.createCircuit(userId, {
      name: 'AMRAP 5',
      format: 'AMRAP',
      durationSeconds: 300,
      exercises: [
        { exerciseId: exerciseIds[0], unit: 'REPS', target: 10 },
        { exerciseId: exerciseIds[1], unit: 'REPS', target: 10 },
      ],
    });
  }

  async function unlocked(userId: string) {
    const rows = await prisma.userAchievement.findMany({
      where: { userId },
      select: { key: true },
    });
    return rows.map((r) => r.key);
  }

  it('"Encerrar circuito" desbloqueia o primeiro treino na hora', async () => {
    const userId = await newUser('relogio');
    const plan = await newAmrap(userId);
    const startedAt = new Date(Date.now() - 10 * 60_000);
    const s = await sessions.start(userId, { planId: plan.id, startedAt: startedAt.toISOString() });
    await circuits.finish(userId, s.id, {
      events: [1, 2, 3, 4].map((i) => ({
        type: 'mark' as const,
        at: startedAt.getTime() + i * 20_000,
      })),
    });

    expect(await unlocked(userId)).toContain('first_workout');
  });

  it('log_circuit_result sem sessão (MCP) desbloqueia o primeiro treino na hora', async () => {
    const userId = await newUser('log');
    const plan = await newAmrap(userId);
    await circuits.log(userId, { planId: plan.id, roundsCompleted: 3 });

    expect(await unlocked(userId)).toContain('first_workout');
  });

  it('log_circuit_result que fecha a sessão aberta desbloqueia o primeiro treino na hora', async () => {
    const userId = await newUser('log-sessao');
    const plan = await newAmrap(userId);
    const startedAt = new Date(Date.now() - 10 * 60_000);
    const s = await sessions.start(userId, { planId: plan.id, startedAt: startedAt.toISOString() });
    await circuits.log(userId, { planId: plan.id, sessionId: s.id, roundsCompleted: 2 });

    expect(await unlocked(userId)).toContain('first_workout');
  });

  it('um gancho que falha não desfaz o circuito encerrado', async () => {
    const userId = await newUser('falha');
    const plan = await newAmrap(userId);
    const broken = new CircuitSessionService(prisma, [
      { afterFinish: () => Promise.reject(new Error('banco fora do ar')) },
    ]);
    const done = await broken.log(userId, { planId: plan.id, roundsCompleted: 1 });

    expect(done.alreadyFinished).toBe(false);
    const session = await prisma.workoutSession.findUnique({ where: { id: done.sessionId } });
    expect(session?.completedAt).not.toBeNull();
  });

  it('a sequência por dia ativo e a constância do mês contam o dia do circuito', async () => {
    const userId = await newUser('constancia');
    const plan = await newAmrap(userId);
    await circuits.log(userId, { planId: plan.id, roundsCompleted: 3 });
    const ctx = { userId, timezone: 'UTC' };

    const streak = await consistency.streak(ctx);
    expect(streak.activeDays.periodos).toBe(1);
    const month = await consistency.report(ctx, 'month');
    expect(month.byArea.workout.days).toBe(1);
    expect(month.activeDays).toBe(1);
  });
});
