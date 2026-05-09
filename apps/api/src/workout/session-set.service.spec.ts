import { BadRequestException } from '@nestjs/common';
import { SessionSetService } from './session-set.service';
import type { PrismaService } from '../common/prisma.service';

type MockPrisma = {
  workoutSession: { findFirst: jest.Mock; findUnique: jest.Mock };
  exercise: { findFirst: jest.Mock; findUnique: jest.Mock };
  sessionSet: { aggregate: jest.Mock; create: jest.Mock; findFirst: jest.Mock; groupBy: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  workoutSession: { findFirst: jest.fn(), findUnique: jest.fn() },
  exercise: { findFirst: jest.fn(), findUnique: jest.fn() },
  sessionSet: { aggregate: jest.fn(), create: jest.fn(), findFirst: jest.fn(), groupBy: jest.fn() },
});

const strengthExercise = { id: 1, name: 'Supino', muscleGroup: 'peito', createdByUserId: null };
const cardioExercise = { id: 2, name: 'Corrida', muscleGroup: 'cardio', createdByUserId: null };

describe('SessionSetService.create', () => {
  let prisma: MockPrisma;
  let service: SessionSetService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SessionSetService(prisma as unknown as PrismaService);
    prisma.workoutSession.findFirst.mockResolvedValue({ id: 'sess-1', userId: 'user-A' });
    prisma.sessionSet.aggregate.mockResolvedValue({ _max: { setNumber: 2 } });
    prisma.sessionSet.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'set-1', ...data }),
    );
  });

  it('creates strength set and assigns correct setNumber', async () => {
    prisma.exercise.findFirst.mockResolvedValue(strengthExercise);

    await service.create('user-A', { sessionId: 'sess-1', exerciseId: 1, weightKg: 80, reps: 10 });

    expect(prisma.sessionSet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ setNumber: 3, weightKg: 80, reps: 10 }),
      }),
    );
  });

  it('creates cardio set for cardio exercise', async () => {
    prisma.exercise.findFirst.mockResolvedValue(cardioExercise);

    await service.create('user-A', { sessionId: 'sess-1', exerciseId: 2, durationSeconds: 1800 });

    expect(prisma.sessionSet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ setNumber: 3, durationSeconds: 1800 }),
      }),
    );
  });

  it('rejects strength fields for cardio exercise', async () => {
    prisma.exercise.findFirst.mockResolvedValue(cardioExercise);

    await expect(
      service.create('user-A', { sessionId: 'sess-1', exerciseId: 2, weightKg: 80, reps: 10 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects cardio fields for strength exercise', async () => {
    prisma.exercise.findFirst.mockResolvedValue(strengthExercise);

    await expect(
      service.create('user-A', { sessionId: 'sess-1', exerciseId: 1, durationSeconds: 1800 }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('SessionSetService.getLastForExercise', () => {
  it('filters by session.userId for user isolation', async () => {
    const prisma = makePrisma();
    const service = new SessionSetService(prisma as unknown as PrismaService);
    prisma.sessionSet.findFirst.mockResolvedValue(null);

    await service.getLastForExercise('user-A', 1);

    expect(prisma.sessionSet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session: expect.objectContaining({ userId: 'user-A' }),
        }),
      }),
    );
  });
});

describe('SessionSetService.getPersonalRecord', () => {
  it('returns highest weightKg for strength exercise', async () => {
    const prisma = makePrisma();
    const service = new SessionSetService(prisma as unknown as PrismaService);
    prisma.exercise.findFirst.mockResolvedValue(strengthExercise);
    prisma.sessionSet.findFirst.mockResolvedValue({
      weightKg: 120,
      reps: 5,
      session: { startedAt: new Date('2026-01-01') },
    });

    const pr = await service.getPersonalRecord('user-A', 1);

    expect(pr?.weightKg).toBe(120);
    expect(pr?.reps).toBe(5);
  });

  it('returns max distance sum for cardio exercise', async () => {
    const prisma = makePrisma();
    const service = new SessionSetService(prisma as unknown as PrismaService);
    prisma.exercise.findFirst.mockResolvedValue(cardioExercise);
    prisma.sessionSet.groupBy.mockResolvedValue([
      { sessionId: 'sess-1', _sum: { distanceMeters: 10000, durationSeconds: 3600 } },
    ]);
    prisma.workoutSession.findUnique.mockResolvedValue({ startedAt: new Date('2026-01-01') });

    const pr = await service.getPersonalRecord('user-A', 2);

    expect(pr?.distanceMeters).toBe(10000);
  });

  it('returns null when no records exist', async () => {
    const prisma = makePrisma();
    const service = new SessionSetService(prisma as unknown as PrismaService);
    prisma.exercise.findFirst.mockResolvedValue(strengthExercise);
    prisma.sessionSet.findFirst.mockResolvedValue(null);

    const pr = await service.getPersonalRecord('user-A', 1);

    expect(pr).toBeNull();
  });
});
