import { BadRequestException } from '@nestjs/common';
import { GoalKind, GoalStatus, type Goal } from '@prisma/client';
import { GoalsService } from '../goals.service';
import type { PrismaService } from '../../common/prisma.service';
import type { WeightLogService } from '../../progress/weight-log.service';
import type { StepLogService } from '../../progress/step-log.service';

/**
 * Metas pessoais (#382, pranchas Al-G9 e Al-G10). O prazo que passa vira "vencida" na leitura —
 * nada grava isso num GET — e um novo prazo traz a meta de volta para as ativas.
 */
describe('GoalsService', () => {
  const AGORA = new Date('2026-11-16T12:00:00.000Z');
  const userId = 'user-A';
  const TZ = 'America/Sao_Paulo';

  beforeEach(() => jest.useFakeTimers().setSystemTime(AGORA));
  afterEach(() => jest.useRealTimers());

  function meta(parcial: Partial<Goal>): Goal {
    return {
      id: 'g1',
      userId,
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
        create: jest.fn(({ data }: { data: Partial<Goal> }) => Promise.resolve(meta(data))),
      },
      workoutSession: { count: jest.fn().mockResolvedValue(3) },
    };
    const weights = { getLatest: jest.fn().mockResolvedValue({ weightKg: 70.2 }) };
    const steps = { getHistory: jest.fn().mockResolvedValue([]) };
    const service = new GoalsService(
      prisma as unknown as PrismaService,
      weights as unknown as WeightLogService,
      steps as unknown as StepLogService,
    );
    return { service, prisma };
  }

  const ontem = new Date('2026-11-15T23:59:59.000-03:00');
  const ano = new Date('2026-12-31T23:59:59.000-03:00');

  describe('meta vencida', () => {
    it('ativa com o prazo passado é lida como vencida', async () => {
      const { service } = build([meta({ deadline: ontem })]);

      const [g] = await service.list({}, userId, TZ);

      expect(g.status).toBe(GoalStatus.expired);
    });

    it('o filtro de status vale para a situação lida, não só a gravada', async () => {
      const { service } = build([
        meta({ id: 'vencida', deadline: ontem }),
        meta({ id: 'em-dia', deadline: ano }),
      ]);

      const vencidas = await service.list({ status: GoalStatus.expired }, userId, TZ);
      const ativas = await service.list({ status: GoalStatus.active }, userId, TZ);

      expect(vencidas.map((g) => g.id)).toEqual(['vencida']);
      expect(ativas.map((g) => g.id)).toEqual(['em-dia']);
    });

    it('concluída ou arquivada com prazo passado não vira vencida', async () => {
      const { service } = build([
        meta({ id: 'c', status: GoalStatus.completed, deadline: ontem }),
        meta({ id: 'a', status: GoalStatus.archived, deadline: ontem }),
      ]);

      const lista = await service.list({}, userId, TZ);

      expect(lista.map((g) => g.status)).toEqual([GoalStatus.completed, GoalStatus.archived]);
    });
  });

  describe('novo prazo (PATCH /goals/:id)', () => {
    it('um prazo no futuro volta a meta gravada como vencida para ativa', async () => {
      const { service, prisma } = build([meta({ status: GoalStatus.expired, deadline: ontem })]);

      const g = await service.update('g1', { deadline: ano.toISOString() }, userId, TZ);

      expect(prisma.goal.update.mock.calls[0][0].data.status).toBe(GoalStatus.active);
      expect(g.status).toBe(GoalStatus.active);
    });

    it('a ativa com prazo passado também volta, e o status explícito vence', async () => {
      const { service } = build([meta({ deadline: ontem })]);

      const renovada = await service.update('g1', { deadline: ano.toISOString() }, userId, TZ);
      expect(renovada.status).toBe(GoalStatus.active);

      const arquivada = await service.update(
        'g1',
        { deadline: ano.toISOString(), status: GoalStatus.archived },
        userId,
        TZ,
      );
      expect(arquivada.status).toBe(GoalStatus.archived);
    });

    it('um prazo novo que já passou é recusado (400), e nada é gravado', async () => {
      const { service, prisma } = build([meta({ status: GoalStatus.expired, deadline: ontem })]);

      await expect(
        service.update('g1', { deadline: '2026-11-01T23:59:59-03:00' }, userId, TZ),
      ).rejects.toThrow(new BadRequestException('O prazo não pode estar no passado.'));
      expect(prisma.goal.update).not.toHaveBeenCalled();
    });

    it('arquivar e reabrir: voltar a ativa limpa a data de conclusão', async () => {
      const { service, prisma } = build([
        meta({ status: GoalStatus.completed, completedAt: new Date('2026-11-01T00:00:00Z') }),
      ]);

      await service.update('g1', { status: GoalStatus.active }, userId, TZ);

      expect(prisma.goal.update.mock.calls[0][0].data.completedAt).toBeNull();
    });
  });

  describe('prazo', () => {
    it('criar com prazo no passado é recusado (400)', async () => {
      const { service, prisma } = build([]);

      await expect(
        service.create(
          {
            kind: GoalKind.custom,
            title: 'Ler',
            targetValue: 4,
            unit: 'livros',
            deadline: '2026-11-10',
          },
          userId,
          TZ,
        ),
      ).rejects.toThrow(new BadRequestException('O prazo não pode estar no passado.'));
      expect(prisma.goal.create).not.toHaveBeenCalled();
    });

    it('só a data ("2026-12-31") vale até o fim daquele dia no fuso da pessoa', async () => {
      const { service, prisma } = build([]);

      await service.create(
        {
          kind: GoalKind.custom,
          title: 'Ler',
          targetValue: 4,
          unit: 'livros',
          deadline: '2026-12-31',
        },
        userId,
        TZ,
      );

      const gravado = prisma.goal.create.mock.calls[0][0].data.deadline as Date;
      expect(gravado.toISOString()).toBe('2027-01-01T02:59:59.999Z');
    });

    it('hoje, só a data, ainda vale: o dia não acabou', async () => {
      const { service, prisma } = build([meta({ status: GoalStatus.expired, deadline: ontem })]);

      await service.update('g1', { deadline: '2026-11-16' }, userId, TZ);

      expect(prisma.goal.update.mock.calls[0][0].data.status).toBe(GoalStatus.active);
    });

    it('tirar o prazo continua valendo', async () => {
      const { service, prisma } = build([meta({ deadline: ano })]);

      await service.update('g1', { deadline: '' }, userId, TZ);

      expect(prisma.goal.update.mock.calls[0][0].data.deadline).toBeNull();
    });
  });
});
