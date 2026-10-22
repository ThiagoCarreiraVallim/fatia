import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateStepLogDto, ListStepLogsDto, UpdateStepLogDto } from '../dto/step-log.dto';
import { CreateWaterLogDto, ListWaterLogsDto, UpdateWaterLogDto } from '../dto/water-log.dto';
import { StepLogService } from '../step-log.service';
import { WaterLogService } from '../water-log.service';
import { WeightLogService } from '../weight-log.service';
import { ProgressService } from '../progress.service';
import { isCalendarDay } from '../helpers/log-day';
import type { PrismaService } from '../../common/prisma.service';

/**
 * Dia de registro em água, passos e peso, com os helpers de fuso **de verdade**
 * (os outros specs de progresso mockam `date-tz` e não veriam erro de fuso).
 *
 * Relógio fixo em 2026-10-14 23:30 em São Paulo = 2026-10-15 02:30 UTC: o dia
 * local e o dia UTC divergem, que é onde os defeitos aparecem.
 */
const SP = 'America/Sao_Paulo';
const NOW = new Date('2026-10-15T02:30:00Z');

function fakePrisma() {
  const model = () => ({
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'novo',
      ...data,
    })),
    findUnique: jest.fn(async () => ({ id: 'log-1', userId: 'user-A', date: '2026-10-10' })),
    findMany: jest.fn(async () => []),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'log-1',
      ...data,
    })),
  });
  return { waterLog: model(), stepLog: model(), weightLog: model() };
}

describe('dia do registro (água, passos, peso)', () => {
  let prisma: ReturnType<typeof fakePrisma>;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    prisma = fakePrisma();
  });

  afterEach(() => jest.useRealTimers());

  const water = () => new WaterLogService(prisma as unknown as PrismaService);
  const steps = () => new StepLogService(prisma as unknown as PrismaService);
  const weight = () => new WeightLogService(prisma as unknown as PrismaService);

  it('isCalendarDay recusa formato errado e dia que não existe', () => {
    expect(isCalendarDay('2026-10-14')).toBe(true);
    expect(isCalendarDay('2024-02-29')).toBe(true);
    expect(isCalendarDay('2026-02-30')).toBe(false);
    expect(isCalendarDay('2026-13-01')).toBe(false);
    expect(isCalendarDay('14/10/2026')).toBe(false);
    expect(isCalendarDay('abc')).toBe(false);
  });

  it('DTOs recusam data fora de AAAA-MM-DD, inclusive nos filtros de lista', () => {
    const errors = (cls: new () => object, body: object) =>
      validateSync(plainToInstance(cls, body)).map((e) => e.property);
    expect(errors(CreateWaterLogDto, { ml: 250, date: 'ontem' })).toEqual(['date']);
    expect(errors(UpdateWaterLogDto, { date: '2026-10-1' })).toEqual(['date']);
    expect(errors(CreateStepLogDto, { steps: 10, date: '14/10/2026' })).toEqual(['date']);
    expect(errors(UpdateStepLogDto, { date: 'x' })).toEqual(['date']);
    expect(errors(ListWaterLogsDto, { from: 'x', to: '2026-10-14' })).toEqual(['from']);
    expect(errors(ListStepLogsDto, { from: '2026-10-01', to: 'y' })).toEqual(['to']);
    expect(errors(CreateWaterLogDto, { ml: 250, date: '2026-10-13' })).toEqual([]);
  });

  describe('água', () => {
    it('aceita dia passado e hoje no fuso da pessoa', async () => {
      await water().create({ ml: 300, date: '2026-10-13' }, 'user-A', SP);
      // 23h30 em São Paulo: "hoje" ainda é dia 14, embora em UTC já seja 15.
      await water().create({ ml: 300 }, 'user-A', SP);
      expect(prisma.waterLog.create.mock.calls.map(([a]) => a.data.date)).toEqual([
        '2026-10-13',
        '2026-10-14',
      ]);
    });

    it('recusa dia futuro e dia que não existe, no create e no update', async () => {
      await expect(water().create({ ml: 300, date: '2026-10-15' }, 'user-A', SP)).rejects.toThrow(
        BadRequestException,
      );
      await expect(water().create({ ml: 300, date: '2026-02-30' }, 'user-A', SP)).rejects.toThrow(
        BadRequestException,
      );
      await expect(water().update('log-1', { date: '2026-10-15' }, 'user-A', SP)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.waterLog.create).not.toHaveBeenCalled();
      expect(prisma.waterLog.update).not.toHaveBeenCalled();
    });
  });

  describe('passos', () => {
    it('recusa dia futuro e dia que não existe, no create e no update', async () => {
      await expect(steps().create({ steps: 10, date: '2026-10-15' }, 'user-A', SP)).rejects.toThrow(
        BadRequestException,
      );
      await expect(steps().create({ steps: 10, date: '2026-04-31' }, 'user-A', SP)).rejects.toThrow(
        BadRequestException,
      );
      await expect(steps().update('log-1', { date: '2026-10-20' }, 'user-A', SP)).rejects.toThrow(
        BadRequestException,
      );
      await steps().create({ steps: 4321, date: '2026-10-13' }, 'user-A', SP);
      expect(prisma.stepLog.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('peso', () => {
    it('recusa pesagem num dia local futuro, no create e no update', async () => {
      await expect(
        weight().create({ weightKg: 77.7, loggedAt: '2026-10-15T15:00:00Z' }, 'user-A', SP),
      ).rejects.toThrow(BadRequestException);
      await expect(
        weight().update('log-1', { loggedAt: '2026-10-16T12:00:00Z' }, 'user-A', SP),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.weightLog.create).not.toHaveBeenCalled();
    });

    it('aceita pesagem de mais tarde hoje e de dia passado', async () => {
      // 23h50 local ainda é hoje, mesmo à frente do relógio.
      await weight().create({ weightKg: 77.7, loggedAt: '2026-10-15T02:50:00Z' }, 'user-A', SP);
      await weight().create({ weightKg: 77.7, loggedAt: '2026-10-13T15:00:00Z' }, 'user-A', SP);
      expect(prisma.weightLog.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('gráfico de peso', () => {
    function progress(logs: Array<{ loggedAt: Date; weightKg: number }>) {
      const db = { weightLog: { findMany: jest.fn(async () => logs) } };
      const service = new ProgressService(db as unknown as PrismaService, {} as never, {} as never);
      return { service, db };
    }

    it('põe a pesagem das 23h30 no dia local, e não no dia UTC seguinte', async () => {
      const { service } = progress([{ loggedAt: NOW, weightKg: 77.7 }]);
      const result = await service.weightProgress(7, { userId: 'user-A', timezone: SP });
      expect(result.points).toEqual([{ date: '2026-10-14', weightKg: 77.7 }]);
    });

    it('começa a janela na meia-noite local do primeiro dia', async () => {
      const { service, db } = progress([]);
      await service.weightProgress(7, { userId: 'user-A', timezone: SP });
      const [args] = db.weightLog.findMany.mock.calls[0] as unknown as [
        { where: { loggedAt: { gte: Date } } },
      ];
      // Primeiro dia = 08/10; meia-noite em São Paulo (UTC−3) = 03:00 UTC.
      expect(args.where.loggedAt.gte.toISOString()).toBe('2026-10-08T03:00:00.000Z');
    });
  });
});
