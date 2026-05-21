import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkoutSessionService } from '../workout-session.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  workoutSession: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

const makePrisma = (): MockPrisma => ({
  workoutSession: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

describe('WorkoutSessionService', () => {
  let prisma: MockPrisma;
  let service: WorkoutSessionService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new WorkoutSessionService(prisma as unknown as PrismaService);
  });

  describe('start', () => {
    it('creates a session with planId, parsed startedAt, and notes when provided', async () => {
      prisma.workoutSession.create.mockResolvedValue({ id: 'sess-1' });

      await service.start(userId, {
        planId: 'plan-1',
        startedAt: '2026-01-15T09:00:00Z',
        notes: 'Heavy day',
      });

      expect(prisma.workoutSession.create).toHaveBeenCalledWith({
        data: {
          userId,
          planId: 'plan-1',
          startedAt: new Date('2026-01-15T09:00:00Z'),
          notes: 'Heavy day',
        },
      });
    });

    it('uses "now" when startedAt is omitted and stores planId as null when not provided', async () => {
      prisma.workoutSession.create.mockResolvedValue({ id: 'sess-1' });

      await service.start(userId, {});

      const data = prisma.workoutSession.create.mock.calls[0][0].data;
      expect(data.planId).toBeNull();
      expect(data.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('findById', () => {
    it('scopes the lookup by userId', async () => {
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 'sess-1', sets: [], plan: null });

      await service.findById(userId, 'sess-1');

      expect(prisma.workoutSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sess-1', userId } }),
      );
    });

    it('throws NotFoundException when no session matches the user/id pair', async () => {
      prisma.workoutSession.findFirst.mockResolvedValue(null);

      await expect(service.findById(userId, 'sess-x')).rejects.toThrow(NotFoundException);
    });

    it('returns an empty plannedExercises array when the session is free training', async () => {
      prisma.workoutSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        planId: null,
        sets: [],
        plan: null,
      });

      const result = await service.findById(userId, 'sess-1');

      expect(result.plannedExercises).toEqual([]);
      expect(result).not.toHaveProperty('plan');
    });

    it('projects plan exercises into plannedExercises in plan order', async () => {
      prisma.workoutSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        planId: 'plan-1',
        sets: [],
        plan: {
          id: 'plan-1',
          exercises: [
            {
              exerciseId: 10,
              order: 1,
              targetSets: 4,
              targetReps: '8-12',
              exercise: { id: 10, name: 'Supino', muscleGroup: 'CHEST' },
            },
            {
              exerciseId: 11,
              order: 2,
              targetSets: 3,
              targetReps: '10',
              exercise: { id: 11, name: 'Esteira', muscleGroup: 'CARDIO' },
            },
          ],
        },
      });

      const result = await service.findById(userId, 'sess-1');

      expect(result.plannedExercises).toEqual([
        {
          exerciseId: 10,
          exerciseName: 'Supino',
          muscleGroup: 'CHEST',
          order: 1,
          targetSets: 4,
          targetReps: '8-12',
        },
        {
          exerciseId: 11,
          exerciseName: 'Esteira',
          muscleGroup: 'CARDIO',
          order: 2,
          targetSets: 3,
          targetReps: '10',
        },
      ]);
    });
  });

  describe('findActive', () => {
    it('returns the most recent uncompleted session for the user', async () => {
      prisma.workoutSession.findFirst.mockResolvedValue({
        id: 'sess-active',
        sets: [],
        plan: null,
      });

      await service.findActive(userId);

      expect(prisma.workoutSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, completedAt: null },
          orderBy: { startedAt: 'desc' },
        }),
      );
    });

    it('returns null when there is no active session', async () => {
      prisma.workoutSession.findFirst.mockResolvedValue(null);

      const result = await service.findActive(userId);

      expect(result).toBeNull();
    });

    it('includes plannedExercises for plan-backed active sessions', async () => {
      prisma.workoutSession.findFirst.mockResolvedValue({
        id: 'sess-active',
        planId: 'plan-1',
        sets: [],
        plan: {
          id: 'plan-1',
          exercises: [
            {
              exerciseId: 7,
              order: 1,
              targetSets: 3,
              targetReps: '5',
              exercise: { id: 7, name: 'Agachamento', muscleGroup: 'LEGS' },
            },
          ],
        },
      });

      const result = await service.findActive(userId);

      expect(result?.plannedExercises).toEqual([
        {
          exerciseId: 7,
          exerciseName: 'Agachamento',
          muscleGroup: 'LEGS',
          order: 1,
          targetSets: 3,
          targetReps: '5',
        },
      ]);
    });
  });

  describe('list', () => {
    it('always filters by userId (isolation boundary)', async () => {
      prisma.workoutSession.findMany.mockResolvedValue([]);

      await service.list(userId, {});

      expect(prisma.workoutSession.findMany.mock.calls[0][0].where.userId).toBe(userId);
    });

    it('applies a UTC day window when date is provided', async () => {
      prisma.workoutSession.findMany.mockResolvedValue([]);

      await service.list(userId, { date: '2026-01-15' });

      const where = prisma.workoutSession.findMany.mock.calls[0][0].where;
      expect(where.startedAt.gte).toEqual(new Date('2026-01-15T00:00:00.000Z'));
      expect(where.startedAt.lt).toEqual(new Date('2026-01-16T00:00:00.000Z'));
    });

    it('caps limit at 50 and forwards cursor pagination', async () => {
      prisma.workoutSession.findMany.mockResolvedValue([]);

      await service.list(userId, { limit: 9999, cursor: 'sess-50' });

      const callArg = prisma.workoutSession.findMany.mock.calls[0][0];
      expect(callArg.take).toBe(50);
      expect(callArg.cursor).toEqual({ id: 'sess-50' });
      expect(callArg.skip).toBe(1);
    });
  });

  describe('finish', () => {
    it('sets completedAt to now when the session is still active', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        userId,
        completedAt: null,
      });
      prisma.workoutSession.update.mockResolvedValue({ id: 'sess-1', completedAt: new Date() });

      await service.finish(userId, 'sess-1', {});

      const data = prisma.workoutSession.update.mock.calls[0][0].data;
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it('is idempotent: keeps the original completedAt when finishing an already-finished session', async () => {
      const original = new Date('2026-01-15T10:00:00Z');
      prisma.workoutSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        userId,
        completedAt: original,
      });
      prisma.workoutSession.update.mockResolvedValue({});

      await service.finish(userId, 'sess-1', {});

      expect(prisma.workoutSession.update.mock.calls[0][0].data.completedAt).toBe(original);
    });

    it('updates notes only when they are provided', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        userId,
        completedAt: null,
      });
      prisma.workoutSession.update.mockResolvedValue({});

      await service.finish(userId, 'sess-1', { notes: 'felt strong' });
      expect(prisma.workoutSession.update.mock.calls[0][0].data.notes).toBe('felt strong');

      await service.finish(userId, 'sess-1', {});
      expect(prisma.workoutSession.update.mock.calls[1][0].data).not.toHaveProperty('notes');
    });

    it('refuses to finish a session owned by another user', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        userId: 'user-B',
        completedAt: null,
      });

      await expect(service.finish(userId, 'sess-1', {})).rejects.toThrow(ForbiddenException);
      expect(prisma.workoutSession.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates the session when the user owns it', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({ id: 'sess-1', userId });
      prisma.workoutSession.update.mockResolvedValue({});

      await service.update(userId, 'sess-1', { notes: 'edit' });

      expect(prisma.workoutSession.update).toHaveBeenCalledWith({
        where: { id: 'sess-1' },
        data: { notes: 'edit' },
      });
    });

    it('throws NotFoundException when the session does not exist', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, 'sess-x', { notes: 'edit' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('deletes the session when the user owns it', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({ id: 'sess-1', userId });
      prisma.workoutSession.delete.mockResolvedValue({});

      await service.delete(userId, 'sess-1');

      expect(prisma.workoutSession.delete).toHaveBeenCalledWith({ where: { id: 'sess-1' } });
    });

    it('throws ForbiddenException when the session belongs to another user', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({ id: 'sess-1', userId: 'user-B' });

      await expect(service.delete(userId, 'sess-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.workoutSession.delete).not.toHaveBeenCalled();
    });
  });
});
