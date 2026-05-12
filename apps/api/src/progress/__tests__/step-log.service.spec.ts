import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StepSource } from '@prisma/client';
import { StepLogService } from '../step-log.service';
import type { PrismaService } from '../../common/prisma.service';

jest.mock('../helpers/date-tz', () => ({
  todayInTz: jest.fn(() => '2025-01-15'),
  addDaysIso: jest.fn((ymd: string, days: number) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }),
}));

type MockPrisma = {
  stepLog: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

const makePrisma = (): MockPrisma => ({
  stepLog: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

const makeLog = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'log-1',
  userId: 'user-A',
  date: '2025-01-15',
  steps: 8000,
  source: StepSource.MANUAL,
  notes: null,
  loggedAt: new Date('2025-01-15T20:00:00Z'),
  ...overrides,
});

describe('StepLogService', () => {
  let prisma: MockPrisma;
  let service: StepLogService;
  const userId = 'user-A';
  const timezone = 'America/Sao_Paulo';

  beforeEach(() => {
    prisma = makePrisma();
    service = new StepLogService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a record with a manual date and source by default', async () => {
      const log = makeLog();
      prisma.stepLog.create.mockResolvedValue(log);

      await service.create({ steps: 8000 }, userId, timezone);

      expect(prisma.stepLog.create).toHaveBeenCalledWith({
        data: {
          userId,
          date: '2025-01-15',
          steps: 8000,
          source: StepSource.MANUAL,
          notes: null,
        },
      });
    });

    it('use the date provided in the DTO, if available', async () => {
      prisma.stepLog.create.mockResolvedValue(makeLog({ date: '2025-01-10' }));

      await service.create({ steps: 5000, date: '2025-01-10' }, userId, timezone);

      const callArg = prisma.stepLog.create.mock.calls[0][0];
      expect(callArg.data.date).toBe('2025-01-10');
    });

    it('use the source provided in the DTO, if available', async () => {
      prisma.stepLog.create.mockResolvedValue(makeLog({ source: StepSource.GOOGLE_FIT }));

      await service.create({ steps: 10000, source: StepSource.GOOGLE_FIT }, userId, timezone);

      const callArg = prisma.stepLog.create.mock.calls[0][0];
      expect(callArg.data.source).toBe(StepSource.GOOGLE_FIT);
    });
  });

  describe('findById', () => {
    it('returns the record if it belongs to the user', async () => {
      const log = makeLog();
      prisma.stepLog.findUnique.mockResolvedValue(log);

      const result = await service.findById('log-1', userId);

      expect(result).toEqual(log);
    });

    it('returns NotFoundException when the record does not exist', async () => {
      prisma.stepLog.findUnique.mockResolvedValue(null);

      await expect(service.findById('log-inexistente', userId)).rejects.toThrow(NotFoundException);
    });

    it('returns NotFoundException when the record belongs to another user', async () => {
      prisma.stepLog.findUnique.mockResolvedValue(makeLog({ userId: 'user-B' }));

      await expect(service.findById('log-1', userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates steps when provided', async () => {
      prisma.stepLog.findUnique.mockResolvedValue(makeLog());
      prisma.stepLog.update.mockResolvedValue(makeLog({ steps: 12000 }));

      const result = await service.update('log-1', { steps: 12000 }, userId);

      expect(prisma.stepLog.update).toHaveBeenCalledWith({
        where: { id: 'log-1' },
        data: { steps: 12000 },
      });
      expect(result.steps).toBe(12000);
    });

    it('updates notes when an explicit value is provided', async () => {
      prisma.stepLog.findUnique.mockResolvedValue(makeLog());
      prisma.stepLog.update.mockResolvedValue(makeLog({ notes: 'walking after lunch' }));

      await service.update('log-1', { notes: 'walking after lunch' }, userId);

      const callArg = prisma.stepLog.update.mock.calls[0][0];
      expect(callArg.data).toEqual({ notes: 'walking after lunch' });
    });

    it('does not include notes in the update payload when omitted', async () => {
      prisma.stepLog.findUnique.mockResolvedValue(makeLog());
      prisma.stepLog.update.mockResolvedValue(makeLog());

      await service.update('log-1', { steps: 9000 }, userId);

      const callArg = prisma.stepLog.update.mock.calls[0][0];
      expect(callArg.data).not.toHaveProperty('notes');
    });

    it('returns NotFoundException when the record belongs to another user', async () => {
      prisma.stepLog.findUnique.mockResolvedValue(makeLog({ userId: 'user-B' }));

      await expect(service.update('log-1', { steps: 5000 }, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('successfully deletes its own record', async () => {
      const log = makeLog();
      prisma.stepLog.findUnique.mockResolvedValue(log);
      prisma.stepLog.delete.mockResolvedValue(log);

      const result = await service.delete('log-1', userId);

      expect(prisma.stepLog.delete).toHaveBeenCalledWith({ where: { id: 'log-1' } });
      expect(result).toEqual({ deleted: true });
    });

    it('returns NotFoundException when the record does not exist', async () => {
      prisma.stepLog.findUnique.mockResolvedValue(null);

      await expect(service.delete('log-inexistente', userId)).rejects.toThrow(NotFoundException);
    });

    it('returns ForbiddenException when the record belongs to another user', async () => {
      prisma.stepLog.findUnique.mockResolvedValue(makeLog({ userId: 'user-B' }));

      await expect(service.delete('log-1', userId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list', () => {
    it('returns records with pagination cursor when there are more items', async () => {
      const logs = Array.from({ length: 3 }, (_, i) =>
        makeLog({ id: `log-${i + 1}`, steps: 8000 - i * 1000 }),
      );
      prisma.stepLog.findMany.mockResolvedValue(logs);

      const result = await service.list({ limit: 2 }, userId);

      expect(result.logs).toHaveLength(2);
      expect(result.nextCursor).toBe('log-2');
    });

    it('returns nextCursor undefined when there are no more items', async () => {
      prisma.stepLog.findMany.mockResolvedValue([makeLog()]);

      const result = await service.list({ limit: 10 }, userId);

      expect(result.nextCursor).toBeUndefined();
    });

    it('filters by date range when from and to are provided', async () => {
      prisma.stepLog.findMany.mockResolvedValue([]);

      await service.list({ from: '2025-01-01', to: '2025-01-31' }, userId);

      const callArg = prisma.stepLog.findMany.mock.calls[0][0];
      expect(callArg.where.date).toEqual({ gte: '2025-01-01', lte: '2025-01-31' });
    });

    it('does not exceed the maximum limit of 100 records', async () => {
      prisma.stepLog.findMany.mockResolvedValue([]);

      await service.list({ limit: 9999 }, userId);

      const callArg = prisma.stepLog.findMany.mock.calls[0][0];
      expect(callArg.take).toBe(101);
    });
  });

  describe('getStepsForDate', () => {
    it('returns steps zero when there are no records for the day', async () => {
      prisma.stepLog.findMany.mockResolvedValue([]);

      const result = await service.getStepsForDate('2025-01-15', userId);

      expect(result).toEqual({ date: '2025-01-15', steps: 0, logCount: 0, sources: [] });
    });

    it('returns the highest steps value when there are multiple logs for the same day', async () => {
      prisma.stepLog.findMany.mockResolvedValue([
        makeLog({ steps: 6000, source: StepSource.MANUAL }),
        makeLog({ id: 'log-2', steps: 10000, source: StepSource.GOOGLE_FIT }),
        makeLog({ id: 'log-3', steps: 8000, source: StepSource.MANUAL }),
      ]);

      const result = await service.getStepsForDate('2025-01-15', userId);

      expect(result.steps).toBe(10000);
    });

    it('deduplicates sources in the sources list', async () => {
      prisma.stepLog.findMany.mockResolvedValue([
        makeLog({ steps: 6000, source: StepSource.MANUAL }),
        makeLog({ id: 'log-2', steps: 8000, source: StepSource.MANUAL }),
      ]);

      const result = await service.getStepsForDate('2025-01-15', userId);

      expect(result.sources).toEqual([StepSource.MANUAL]);
      expect(result.logCount).toBe(2);
    });

    it('returns all distinct sources', async () => {
      prisma.stepLog.findMany.mockResolvedValue([
        makeLog({ steps: 6000, source: StepSource.MANUAL }),
        makeLog({ id: 'log-2', steps: 9000, source: StepSource.APPLE_HEALTH }),
      ]);

      const result = await service.getStepsForDate('2025-01-15', userId);

      expect(result.sources).toContain(StepSource.MANUAL);
      expect(result.sources).toContain(StepSource.APPLE_HEALTH);
    });
  });

  describe('getHistory', () => {
    it('returns a series of N days with zero steps for days without records', async () => {
      prisma.stepLog.findMany.mockResolvedValue([]);

      const result = await service.getHistory(7, userId, timezone);

      expect(result).toHaveLength(7);
      expect(result.every((entry) => entry.steps === 0)).toBe(true);
    });

    it('populates steps correctly for days with records', async () => {
      prisma.stepLog.findMany.mockResolvedValue([
        makeLog({ date: '2025-01-13', steps: 5000 }),
        makeLog({ id: 'log-2', date: '2025-01-15', steps: 9500 }),
      ]);

      const result = await service.getHistory(7, userId, timezone);

      const jan13 = result.find((e) => e.date === '2025-01-13');
      const jan15 = result.find((e) => e.date === '2025-01-15');

      expect(jan13?.steps).toBe(5000);
      expect(jan15?.steps).toBe(9500);
    });

    it('uses the highest value when there are multiple logs for the same day', async () => {
      prisma.stepLog.findMany.mockResolvedValue([
        makeLog({ date: '2025-01-15', steps: 4000 }),
        makeLog({ id: 'log-2', date: '2025-01-15', steps: 11000 }),
      ]);

      const result = await service.getHistory(3, userId, timezone);

      const jan15 = result.find((e) => e.date === '2025-01-15');
      expect(jan15?.steps).toBe(11000);
    });
  });
});
