import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WeightLogService } from '../weight-log.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  weightLog: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

const makePrisma = (): MockPrisma => ({
  weightLog: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

const makeLog = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'log-1',
  userId: 'user-A',
  weightKg: 80.5,
  loggedAt: new Date('2025-01-15T10:00:00Z'),
  notes: null,
  ...overrides,
});

describe('WeightLogService', () => {
  let prisma: MockPrisma;
  let service: WeightLogService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new WeightLogService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a record with the specified date', async () => {
      const log = makeLog();
      prisma.weightLog.create.mockResolvedValue(log);

      const result = await service.create(
        { weightKg: 80.5, loggedAt: '2025-01-15T10:00:00Z' },
        userId,
      );

      expect(prisma.weightLog.create).toHaveBeenCalledWith({
        data: {
          userId,
          weightKg: 80.5,
          loggedAt: new Date('2025-01-15T10:00:00Z'),
          notes: null,
        },
      });
      expect(result).toEqual(log);
    });

    it('uses current date when loggedAt is not provided', async () => {
      const log = makeLog();
      prisma.weightLog.create.mockResolvedValue(log);

      await service.create({ weightKg: 80.5 }, userId);

      const callArg = prisma.weightLog.create.mock.calls[0][0];
      expect(callArg.data.loggedAt).toBeInstanceOf(Date);
    });

    it('saves notes as null when not provided', async () => {
      prisma.weightLog.create.mockResolvedValue(makeLog());
      await service.create({ weightKg: 75 }, userId);

      const callArg = prisma.weightLog.create.mock.calls[0][0];
      expect(callArg.data.notes).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns the record when it belongs to the user', async () => {
      const log = makeLog();
      prisma.weightLog.findUnique.mockResolvedValue(log);

      const result = await service.findById('log-1', userId);

      expect(result).toEqual(log);
    });

    it('returns NotFoundException when record does not exist', async () => {
      prisma.weightLog.findUnique.mockResolvedValue(null);

      await expect(service.findById('log-inexistente', userId)).rejects.toThrow(NotFoundException);
    });

    it('returns NotFoundException when record belongs to another user', async () => {
      prisma.weightLog.findUnique.mockResolvedValue(makeLog({ userId: 'user-B' }));

      await expect(service.findById('log-1', userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates only the provided fields', async () => {
      const log = makeLog();
      prisma.weightLog.findUnique.mockResolvedValue(log);
      prisma.weightLog.update.mockResolvedValue({ ...log, weightKg: 79 });

      const result = await service.update('log-1', { weightKg: 79 }, userId);

      expect(prisma.weightLog.update).toHaveBeenCalledWith({
        where: { id: 'log-1' },
        data: { weightKg: 79 },
      });
      expect(result.weightKg).toBe(79);
    });

    it('updates loggedAt when provided', async () => {
      const log = makeLog();
      const newDate = '2025-02-01T08:00:00Z';
      prisma.weightLog.findUnique.mockResolvedValue(log);
      prisma.weightLog.update.mockResolvedValue(log);

      await service.update('log-1', { loggedAt: newDate }, userId);

      const callArg = prisma.weightLog.update.mock.calls[0][0];
      expect(callArg.data.loggedAt).toEqual(new Date(newDate));
    });

    it('updates notes when an explicit value is provided', async () => {
      const log = makeLog();
      prisma.weightLog.findUnique.mockResolvedValue(log);
      prisma.weightLog.update.mockResolvedValue(log);

      await service.update('log-1', { notes: 'after workout' }, userId);

      const callArg = prisma.weightLog.update.mock.calls[0][0];
      expect(callArg.data).toEqual({ notes: 'after workout' });
    });

    it('does not include notes in the update payload when omitted', async () => {
      const log = makeLog();
      prisma.weightLog.findUnique.mockResolvedValue(log);
      prisma.weightLog.update.mockResolvedValue(log);

      await service.update('log-1', { weightKg: 81 }, userId);

      const callArg = prisma.weightLog.update.mock.calls[0][0];
      expect(callArg.data).not.toHaveProperty('notes');
    });

    it('does not allow user A to edit a record from user B', async () => {
      prisma.weightLog.findUnique.mockResolvedValue(makeLog({ userId: 'user-B' }));

      await expect(service.update('log-1', { weightKg: 90 }, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('successfully deletes its own record', async () => {
      const log = makeLog();
      prisma.weightLog.findUnique.mockResolvedValue(log);
      prisma.weightLog.delete.mockResolvedValue(log);

      const result = await service.delete('log-1', userId);

      expect(prisma.weightLog.delete).toHaveBeenCalledWith({ where: { id: 'log-1' } });
      expect(result).toEqual({ deleted: true });
    });

    it('returns NotFoundException when record does not exist', async () => {
      prisma.weightLog.findUnique.mockResolvedValue(null);

      await expect(service.delete('log-inexistente', userId)).rejects.toThrow(NotFoundException);
    });

    it('returns ForbiddenException when record belongs to another user', async () => {
      prisma.weightLog.findUnique.mockResolvedValue(makeLog({ userId: 'user-B' }));

      await expect(service.delete('log-1', userId)).rejects.toThrow(ForbiddenException);
    });

    it('does not call prisma.delete when the record belongs to another user', async () => {
      prisma.weightLog.findUnique.mockResolvedValue(makeLog({ userId: 'user-B' }));

      await expect(service.delete('log-1', userId)).rejects.toThrow(ForbiddenException);
      expect(prisma.weightLog.delete).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns records with pagination cursor when there are more items', async () => {
      const logs = Array.from({ length: 3 }, (_, i) =>
        makeLog({ id: `log-${i + 1}`, weightKg: 80 - i }),
      );
      prisma.weightLog.findMany.mockResolvedValue(logs);

      const result = await service.list({ limit: 2 }, userId);

      expect(result.logs).toHaveLength(2);
      expect(result.nextCursor).toBe('log-2');
    });

    it('returns nextCursor undefined when there are no more items', async () => {
      const logs = [makeLog()];
      prisma.weightLog.findMany.mockResolvedValue(logs);

      const result = await service.list({ limit: 10 }, userId);

      expect(result.nextCursor).toBeUndefined();
    });

    it('filters by date range when from and to are provided', async () => {
      prisma.weightLog.findMany.mockResolvedValue([]);

      const from = '2025-01-01T00:00:00Z';
      const to = '2025-01-31T23:59:59Z';
      await service.list({ from, to }, userId);

      const callArg = prisma.weightLog.findMany.mock.calls[0][0];
      expect(callArg.where.loggedAt).toEqual({
        gte: new Date(from),
        lte: new Date(to),
      });
    });

    it('does not exceed the maximum limit of 100 records', async () => {
      prisma.weightLog.findMany.mockResolvedValue([]);

      await service.list({ limit: 9999 }, userId);

      const callArg = prisma.weightLog.findMany.mock.calls[0][0];
      expect(callArg.take).toBe(101);
    });

    it('always filters by userId (isolation boundary)', async () => {
      prisma.weightLog.findMany.mockResolvedValue([]);

      await service.list({}, userId);

      const callArg = prisma.weightLog.findMany.mock.calls[0][0];
      expect(callArg.where.userId).toBe(userId);
    });

    it('forwards cursor pagination and skips the cursor row', async () => {
      prisma.weightLog.findMany.mockResolvedValue([]);

      await service.list({ cursor: 'log-50' }, userId);

      const callArg = prisma.weightLog.findMany.mock.calls[0][0];
      expect(callArg.cursor).toEqual({ id: 'log-50' });
      expect(callArg.skip).toBe(1);
    });

    it('does not include cursor/skip in the query when no cursor is provided', async () => {
      prisma.weightLog.findMany.mockResolvedValue([]);

      await service.list({}, userId);

      const callArg = prisma.weightLog.findMany.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('cursor');
      expect(callArg).not.toHaveProperty('skip');
    });
  });

  describe('getLatest', () => {
    it('returns the most recent record for the user', async () => {
      const log = makeLog();
      prisma.weightLog.findFirst.mockResolvedValue(log);

      const result = await service.getLatest(userId);

      expect(prisma.weightLog.findFirst).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { loggedAt: 'desc' },
      });
      expect(result).toEqual(log);
    });

    it('returns null when there are no records', async () => {
      prisma.weightLog.findFirst.mockResolvedValue(null);

      const result = await service.getLatest(userId);

      expect(result).toBeNull();
    });
  });
});
