import { PrismaService } from '../../common/prisma.service';
import type { AchievementService } from '../../progress/achievement.service';
import type { ConsistencyService } from '../../progress/consistency.service';
import { DashboardService } from '../../progress/dashboard.service';
import type { StepLogService } from '../../progress/step-log.service';
import type { WaterLogService } from '../../progress/water-log.service';
import type { WeightLogService } from '../../progress/weight-log.service';
import { MuscleSummaryService } from '../muscle-summary.service';
import type { TrainingBlockService } from '../training-block.service';
import { WorkoutPlanService } from '../workout-plan.service';

/**
 * A ordem que a pessoa escolhe (#402) é a do Hoje: sem treino feito, o
 * próximo da rotação é o primeiro da lista, e no empate de grupos descansados
 * a sugestão também segue a lista.
 */
describe('ordem dos planos no Hoje (integração, #402)', () => {
  const prisma = new PrismaService();
  const plans = new WorkoutPlanService(prisma);
  const dashboard = new DashboardService(
    prisma,
    {
      getStepsForDate: jest.fn().mockResolvedValue({ steps: 0, logCount: 0, sources: [] }),
    } as unknown as StepLogService,
    { getLatest: jest.fn().mockResolvedValue(null) } as unknown as WeightLogService,
    {
      getForDate: jest.fn().mockResolvedValue({ date: '2026-01-01', totalMl: 0, logCount: 0 }),
    } as unknown as WaterLogService,
    {
      streak: jest.fn().mockResolvedValue({ current: 0, best: 0, freezes: 0, days: [] }),
    } as unknown as ConsistencyService,
    { list: jest.fn().mockResolvedValue([]), evaluate: jest.fn() } as unknown as AchievementService,
    { getActive: jest.fn().mockResolvedValue(null) } as unknown as TrainingBlockService,
  );
  const muscles = new MuscleSummaryService(prisma);
  const TZ = 'America/Sao_Paulo';
  const stamp = `ordem-hoje-${Date.now()}`;
  let userId = '';
  const p = { a: '', b: '' };

  beforeAll(async () => {
    await prisma.$connect();
    userId = (
      await prisma.user.create({
        data: { logtoSub: stamp, email: `${stamp}@test.local`, name: 'Ana', timezone: TZ },
      })
    ).id;
    const ex = await prisma.exercise.findFirstOrThrow({
      where: { createdByUserId: null, groupOwned: false, muscleGroup: 'peito' },
      select: { id: true },
    });
    const plano = (name: string, createdAt: Date) =>
      prisma.workoutPlan.create({
        data: {
          userId,
          name,
          createdAt,
          exercises: { create: [{ exerciseId: ex.id, order: 0, targetSets: 3, targetReps: '10' }] },
        },
      });
    p.a = (await plano('A', new Date('2026-01-01T12:00:00Z'))).id;
    p.b = (await plano('B', new Date('2026-01-02T12:00:00Z'))).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('reordenar muda o próximo plano e a sugestão da semana', async () => {
    const ctx = { userId, timezone: TZ };
    expect((await dashboard.today(ctx)).workout.nextPlan?.planId).toBe(p.a);
    expect((await muscles.weekly(userId, TZ)).suggestedPlan?.id).toBe(p.a);

    await plans.reorder(userId, [p.b, p.a]);

    expect((await dashboard.today(ctx)).workout.nextPlan?.planId).toBe(p.b);
    expect((await muscles.weekly(userId, TZ)).suggestedPlan?.id).toBe(p.b);
  });
});
