import { GoalKind, GoalStatus, type Goal } from '@prisma/client';
import { GoalsService } from '../../../goals/goals.service';
import type { PrismaService } from '../../../common/prisma.service';
import type { WeightLogService } from '../../../progress/weight-log.service';
import type { StepLogService } from '../../../progress/step-log.service';
import type { McpToolContext } from '../../../common/decorators/tool.decorator';
import { MarkGoalDoneTool } from '../tools/mark-goal-done.tool';

/**
 * "Bati a meta" pelo chat (#382): a meta com o prazo vencido é lida como `expired`, mas ainda é a
 * meta em aberto da pessoa. Procurar só nas `active` respondia 404 ou concluía outra por aproximação.
 */
describe('mark_goal_done', () => {
  const AGORA = new Date('2026-11-16T12:00:00.000Z');
  const ctx = { userId: 'user-A', timezone: 'America/Sao_Paulo' } as McpToolContext;

  beforeEach(() => jest.useFakeTimers().setSystemTime(AGORA));
  afterEach(() => jest.useRealTimers());

  function meta(parcial: Partial<Goal>): Goal {
    return {
      id: 'g1',
      userId: 'user-A',
      kind: GoalKind.custom,
      title: 'Correr 5 km',
      description: null,
      startValue: 0,
      targetValue: 5,
      unit: 'km',
      lastReportedValue: 2,
      deadline: null,
      status: GoalStatus.active,
      createdAt: new Date('2026-10-01T12:00:00.000Z'),
      completedAt: null,
      ...parcial,
    };
  }

  function build(goals: Goal[]) {
    const prisma = {
      goal: {
        findMany: jest.fn().mockResolvedValue(goals),
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(goals.find((g) => g.id === where.id) ?? null),
        ),
        update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<Goal> }) =>
          Promise.resolve({ ...goals.find((g) => g.id === where.id)!, ...data }),
        ),
      },
    };
    const service = new GoalsService(
      prisma as unknown as PrismaService,
      { getLatest: jest.fn() } as unknown as WeightLogService,
      { getHistory: jest.fn().mockResolvedValue([]) } as unknown as StepLogService,
    );
    return { tool: new MarkGoalDoneTool(service), prisma };
  }

  it('acha e conclui a meta cujo prazo já passou', async () => {
    const { tool, prisma } = build([
      meta({ id: 'g1', title: 'Pesar 68 kg', deadline: new Date('2026-10-31T12:00:00.000Z') }),
      meta({ id: 'g2', title: 'Correr 5 km' }),
    ]);

    const done = await tool.execute({ goal: 'pesar 68 kg' } as never, ctx);

    expect(prisma.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g1' },
        data: expect.objectContaining({ status: GoalStatus.completed }),
      }),
    );
    expect(done.id).toBe('g1');
  });

  it('concluída ou arquivada não entra na busca', async () => {
    const { tool } = build([meta({ id: 'g1', title: 'Pesar 68 kg', status: GoalStatus.archived })]);

    await expect(tool.execute({ goal: 'pesar 68 kg' } as never, ctx)).rejects.toThrow();
  });
});
