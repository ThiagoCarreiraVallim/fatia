import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SessionSetService } from '../session-set.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  workoutSession: { findFirst: jest.Mock; findUnique: jest.Mock };
  exercise: { findFirst: jest.Mock; findUnique: jest.Mock };
  sessionSet: {
    aggregate: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
    groupBy: jest.Mock;
  };
};

const makePrisma = (): MockPrisma => ({
  workoutSession: { findFirst: jest.fn(), findUnique: jest.fn() },
  exercise: { findFirst: jest.fn(), findUnique: jest.fn() },
  sessionSet: {
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
    groupBy: jest.fn(),
  },
});

const strengthExercise = {
  id: 1,
  name: 'Bench Press',
  muscleGroup: 'chest',
  createdByUserId: null,
};
const cardioExercise = { id: 2, name: 'Running', muscleGroup: 'cardio', createdByUserId: null };

describe('SessionSetService', () => {
  let prisma: MockPrisma;
  let service: SessionSetService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new SessionSetService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 'sess-1', userId });
      prisma.sessionSet.aggregate.mockResolvedValue({ _max: { setNumber: 2 } });
      prisma.sessionSet.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'set-1', ...data }),
      );
    });

    it('creates a strength set with the next setNumber within the session/exercise', async () => {
      prisma.exercise.findFirst.mockResolvedValue(strengthExercise);

      await service.create(userId, { sessionId: 'sess-1', exerciseId: 1, weightKg: 80, reps: 10 });

      expect(prisma.sessionSet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'sess-1',
            exerciseId: 1,
            setNumber: 3,
            weightKg: 80,
            reps: 10,
          }),
        }),
      );
    });

    it('creates a cardio set with durationSeconds', async () => {
      prisma.exercise.findFirst.mockResolvedValue(cardioExercise);

      await service.create(userId, {
        sessionId: 'sess-1',
        exerciseId: 2,
        durationSeconds: 1800,
        distanceMeters: 5000,
      });

      expect(prisma.sessionSet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            setNumber: 3,
            durationSeconds: 1800,
            distanceMeters: 5000,
          }),
        }),
      );
    });

    it('starts at setNumber 1 when no previous set exists for the same exercise', async () => {
      prisma.exercise.findFirst.mockResolvedValue(strengthExercise);
      prisma.sessionSet.aggregate.mockResolvedValue({ _max: { setNumber: null } });

      await service.create(userId, { sessionId: 'sess-1', exerciseId: 1, weightKg: 80, reps: 10 });

      expect(prisma.sessionSet.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ setNumber: 1 }) }),
      );
    });

    it('throws NotFoundException when the session does not exist or does not belong to the user', async () => {
      prisma.workoutSession.findFirst.mockResolvedValue(null);

      await expect(
        service.create(userId, { sessionId: 'sess-x', exerciseId: 1, weightKg: 80, reps: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the exercise is not accessible to the user', async () => {
      prisma.exercise.findFirst.mockResolvedValue(null);

      await expect(
        service.create(userId, { sessionId: 'sess-1', exerciseId: 999, weightKg: 80, reps: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects strength fields (weightKg/reps) for a cardio exercise', async () => {
      prisma.exercise.findFirst.mockResolvedValue(cardioExercise);

      await expect(
        service.create(userId, { sessionId: 'sess-1', exerciseId: 2, weightKg: 80, reps: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cardio fields (durationSeconds) for a strength exercise', async () => {
      prisma.exercise.findFirst.mockResolvedValue(strengthExercise);

      await expect(
        service.create(userId, { sessionId: 'sess-1', exerciseId: 1, durationSeconds: 1800 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const ownedSet = {
      id: 'set-1',
      sessionId: 'sess-1',
      exerciseId: 1,
      session: { userId },
    };

    it('updates a set the user owns', async () => {
      prisma.sessionSet.findFirst.mockResolvedValue(ownedSet);
      prisma.exercise.findUnique.mockResolvedValue(strengthExercise);
      prisma.sessionSet.update.mockResolvedValue({ ...ownedSet, weightKg: 90 });

      await service.update(userId, 'set-1', { weightKg: 90, reps: 5 });

      expect(prisma.sessionSet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'set-1' },
          data: { weightKg: 90, reps: 5 },
        }),
      );
    });

    it('throws NotFoundException when the set does not exist', async () => {
      prisma.sessionSet.findFirst.mockResolvedValue(null);

      await expect(service.update(userId, 'set-x', { reps: 5 })).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the set belongs to another user', async () => {
      prisma.sessionSet.findFirst.mockResolvedValue({ ...ownedSet, session: { userId: 'user-B' } });

      await expect(service.update(userId, 'set-1', { reps: 5 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects strength fields on a cardio set', async () => {
      prisma.sessionSet.findFirst.mockResolvedValue({ ...ownedSet, exerciseId: 2 });
      prisma.exercise.findUnique.mockResolvedValue(cardioExercise);

      await expect(service.update(userId, 'set-1', { weightKg: 90 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('delete', () => {
    it('deletes a set the user owns', async () => {
      prisma.sessionSet.findFirst.mockResolvedValue({ id: 'set-1', session: { userId } });
      prisma.sessionSet.delete.mockResolvedValue({});

      await service.delete(userId, 'set-1');

      expect(prisma.sessionSet.delete).toHaveBeenCalledWith({ where: { id: 'set-1' } });
    });

    it('throws ForbiddenException when the set belongs to another user', async () => {
      prisma.sessionSet.findFirst.mockResolvedValue({
        id: 'set-1',
        session: { userId: 'user-B' },
      });

      await expect(service.delete(userId, 'set-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.sessionSet.delete).not.toHaveBeenCalled();
    });
  });

  describe('getLastForExercise', () => {
    it('filters by session.userId to keep training history isolated per user', async () => {
      prisma.sessionSet.findFirst.mockResolvedValue(null);

      await service.getLastForExercise(userId, 1);

      expect(prisma.sessionSet.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            session: expect.objectContaining({ userId }),
          }),
        }),
      );
    });

    it('adds a startedAt < before filter when before is provided', async () => {
      prisma.sessionSet.findFirst.mockResolvedValue(null);
      const before = '2026-02-01T00:00:00Z';

      await service.getLastForExercise(userId, 1, before);

      const where = prisma.sessionSet.findFirst.mock.calls[0][0].where;
      expect(where.session.startedAt).toEqual({ lt: new Date(before) });
    });
  });

  describe('getPersonalRecord', () => {
    it('throws NotFoundException when the exercise is not accessible', async () => {
      prisma.exercise.findFirst.mockResolvedValue(null);

      await expect(service.getPersonalRecord(userId, 1)).rejects.toThrow(NotFoundException);
    });

    it('returns the highest weightKg as PR for a strength exercise', async () => {
      prisma.exercise.findFirst.mockResolvedValue(strengthExercise);
      prisma.sessionSet.findFirst.mockResolvedValue({
        weightKg: 120,
        reps: 5,
        session: { startedAt: new Date('2026-01-01') },
      });

      const pr = await service.getPersonalRecord(userId, 1);

      expect(pr?.weightKg).toBe(120);
      expect(pr?.reps).toBe(5);
    });

    it('returns null when a strength exercise has no records', async () => {
      prisma.exercise.findFirst.mockResolvedValue(strengthExercise);
      prisma.sessionSet.findFirst.mockResolvedValue(null);

      const pr = await service.getPersonalRecord(userId, 1);

      expect(pr).toBeNull();
    });

    it('returns the session with the largest total distance as PR for a cardio exercise', async () => {
      prisma.exercise.findFirst.mockResolvedValue(cardioExercise);
      prisma.sessionSet.groupBy.mockResolvedValue([
        { sessionId: 'sess-1', _sum: { distanceMeters: 10000, durationSeconds: 3600 } },
      ]);
      prisma.workoutSession.findUnique.mockResolvedValue({ startedAt: new Date('2026-01-01') });

      const pr = await service.getPersonalRecord(userId, 2);

      expect(pr?.distanceMeters).toBe(10000);
      expect(pr?.durationSeconds).toBe(3600);
    });

    it('returns null when a cardio exercise has no sessions with distance', async () => {
      prisma.exercise.findFirst.mockResolvedValue(cardioExercise);
      prisma.sessionSet.groupBy.mockResolvedValue([]);

      const pr = await service.getPersonalRecord(userId, 2);

      expect(pr).toBeNull();
    });
  });
});
