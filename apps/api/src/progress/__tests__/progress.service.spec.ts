import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProgressService } from '../progress.service';
import type { PrismaService } from '../../common/prisma.service';
import type { StepLogService } from '../step-log.service';
import type { WaterLogService } from '../water-log.service';

jest.mock('../helpers/date-tz', () => ({
  todayInTz: jest.fn(() => '2026-01-15'),
  addDaysIso: jest.fn((ymd: string, days: number) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }),
  weekStartInTz: jest.fn((date: Date) => {
    const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dow = utc.getUTCDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    utc.setUTCDate(utc.getUTCDate() + offset);
    return utc.toISOString().slice(0, 10);
  }),
}));

type MockPrisma = {
  weightLog: { findMany: jest.Mock };
  sessionSet: { findMany: jest.Mock };
  exercise: { findUnique: jest.Mock };
  userGoals: { findUnique: jest.Mock };
};

type MockStepLogs = {
  getHistory: jest.Mock;
};

type MockWaterLogs = {
  getHistory: jest.Mock;
};

const makePrisma = (): MockPrisma => ({
  weightLog: { findMany: jest.fn() },
  sessionSet: { findMany: jest.fn() },
  exercise: { findUnique: jest.fn() },
  userGoals: { findUnique: jest.fn() },
});

const makeStepLogs = (): MockStepLogs => ({
  getHistory: jest.fn(),
});

const makeWaterLogs = (): MockWaterLogs => ({
  getHistory: jest.fn(),
});

const strengthExercise = {
  id: 1,
  name: 'Bench Press',
  muscleGroup: 'chest',
  createdByUserId: null,
};

const cardioExercise = {
  id: 2,
  name: 'Running',
  muscleGroup: 'cardio',
  createdByUserId: null,
};

const makeStrengthSet = (overrides: Partial<Record<string, unknown>> = {}) => ({
  exerciseId: 1,
  setNumber: 1,
  weightKg: 100,
  reps: 5,
  session: { id: 's1', startedAt: new Date('2026-01-10T09:00:00Z') },
  ...overrides,
});

const makeCardioSet = (overrides: Partial<Record<string, unknown>> = {}) => ({
  exerciseId: 2,
  setNumber: 1,
  durationSeconds: 1800,
  distanceMeters: 5000,
  kcalBurned: 300,
  session: { id: 's1', startedAt: new Date('2026-01-10T09:00:00Z') },
  ...overrides,
});

describe('ProgressService', () => {
  let prisma: MockPrisma;
  let stepLogs: MockStepLogs;
  let waterLogs: MockWaterLogs;
  let service: ProgressService;
  const userId = 'user-A';
  const ctx = { userId, timezone: 'UTC' };

  beforeEach(() => {
    prisma = makePrisma();
    stepLogs = makeStepLogs();
    waterLogs = makeWaterLogs();
    service = new ProgressService(
      prisma as unknown as PrismaService,
      stepLogs as unknown as StepLogService,
      waterLogs as unknown as WaterLogService,
    );
  });

  describe('weightProgress', () => {
    it('computes totalDeltaKg between first and last point', async () => {
      prisma.weightLog.findMany.mockResolvedValue([
        { id: 'a', loggedAt: new Date('2026-01-01T10:00:00Z'), weightKg: 80 },
        { id: 'b', loggedAt: new Date('2026-01-05T10:00:00Z'), weightKg: 78.5 },
      ]);

      const result = await service.weightProgress(30, ctx);

      expect(result.totalDeltaKg).toBeCloseTo(-1.5);
      expect(result.currentWeightKg).toBe(78.5);
    });

    it('returns totalDeltaKg = 0 when fewer than two points', async () => {
      prisma.weightLog.findMany.mockResolvedValue([
        { id: 'a', loggedAt: new Date('2026-01-01T10:00:00Z'), weightKg: 80 },
      ]);

      const result = await service.weightProgress(30, ctx);

      expect(result.totalDeltaKg).toBe(0);
      expect(result.currentWeightKg).toBe(80);
    });

    it('returns currentWeightKg null and empty arrays when there are no points', async () => {
      prisma.weightLog.findMany.mockResolvedValue([]);

      const result = await service.weightProgress(30, ctx);

      expect(result.currentWeightKg).toBeNull();
      expect(result.points).toEqual([]);
      expect(result.weeklyAverages).toEqual([]);
      expect(result.totalDeltaKg).toBe(0);
    });

    it('maps each log to a point with ISO date and computes weekly averages', async () => {
      prisma.weightLog.findMany.mockResolvedValue([
        { id: 'a', loggedAt: new Date('2026-01-05T10:00:00Z'), weightKg: 80 },
        { id: 'b', loggedAt: new Date('2026-01-06T10:00:00Z'), weightKg: 79 },
      ]);

      const result = await service.weightProgress(7, ctx);

      expect(result.points).toHaveLength(2);
      expect(result.points[0].date).toBe('2026-01-05');
      expect(result.weeklyAverages).toHaveLength(1);
      expect(result.weeklyAverages[0].avgKg).toBeCloseTo(79.5);
      expect(result.weeklyAverages[0].deltaKg).toBeNull();
    });

    it('filters records by userId (isolation boundary)', async () => {
      prisma.weightLog.findMany.mockResolvedValue([]);

      await service.weightProgress(30, ctx);

      const callArg = prisma.weightLog.findMany.mock.calls[0][0];
      expect(callArg.where.userId).toBe(userId);
    });
  });

  describe('strengthProgress', () => {
    it('throws NotFoundException when the exercise does not exist', async () => {
      prisma.exercise.findUnique.mockResolvedValue(null);

      await expect(service.strengthProgress(99, 30, 'estimated_1rm', ctx)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the exercise is cardio', async () => {
      prisma.exercise.findUnique.mockResolvedValue(cardioExercise);

      await expect(service.strengthProgress(2, 30, 'estimated_1rm', ctx)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns the max estimated 1RM per session (Epley formula)', async () => {
      prisma.exercise.findUnique.mockResolvedValue(strengthExercise);
      prisma.sessionSet.findMany.mockResolvedValue([
        makeStrengthSet({ weightKg: 100, reps: 5 }),
        makeStrengthSet({ setNumber: 2, weightKg: 90, reps: 10 }),
      ]);

      const result = await service.strengthProgress(1, 30, 'estimated_1rm', ctx);

      expect(result.points[0].value).toBeCloseTo(116.67, 2);
    });

    it('computes total_volume by summing weightKg*reps across all sets of a session', async () => {
      prisma.exercise.findUnique.mockResolvedValue(strengthExercise);
      prisma.sessionSet.findMany.mockResolvedValue([
        makeStrengthSet({ weightKg: 100, reps: 5 }),
        makeStrengthSet({ setNumber: 2, weightKg: 80, reps: 8 }),
      ]);

      const result = await service.strengthProgress(1, 30, 'total_volume', ctx);

      expect(result.points[0].value).toBe(1140);
    });

    it('computes max_weight as the heaviest set of the session', async () => {
      prisma.exercise.findUnique.mockResolvedValue(strengthExercise);
      prisma.sessionSet.findMany.mockResolvedValue([
        makeStrengthSet({ weightKg: 100, reps: 5 }),
        makeStrengthSet({ setNumber: 2, weightKg: 120, reps: 3 }),
      ]);

      const result = await service.strengthProgress(1, 30, 'max_weight', ctx);

      expect(result.points[0].value).toBe(120);
    });

    it('returns null start/current/delta when there are no points', async () => {
      prisma.exercise.findUnique.mockResolvedValue(strengthExercise);
      prisma.sessionSet.findMany.mockResolvedValue([]);

      const result = await service.strengthProgress(1, 30, 'max_weight', ctx);

      expect(result.points).toEqual([]);
      expect(result.startValue).toBeNull();
      expect(result.currentValue).toBeNull();
      expect(result.deltaPercent).toBeNull();
    });

    it('sorts points chronologically by sessionDate', async () => {
      prisma.exercise.findUnique.mockResolvedValue(strengthExercise);
      prisma.sessionSet.findMany.mockResolvedValue([
        makeStrengthSet({
          session: { id: 's2', startedAt: new Date('2026-01-12T09:00:00Z') },
          weightKg: 110,
        }),
        makeStrengthSet({
          session: { id: 's1', startedAt: new Date('2026-01-05T09:00:00Z') },
          weightKg: 100,
        }),
      ]);

      const result = await service.strengthProgress(1, 30, 'max_weight', ctx);

      expect(result.points.map((p) => p.sessionDate)).toEqual(['2026-01-05', '2026-01-12']);
    });

    it('filters sets by session userId (isolation boundary)', async () => {
      prisma.exercise.findUnique.mockResolvedValue(strengthExercise);
      prisma.sessionSet.findMany.mockResolvedValue([]);

      await service.strengthProgress(1, 30, 'max_weight', ctx);

      const callArg = prisma.sessionSet.findMany.mock.calls[0][0];
      expect(callArg.where.session.userId).toBe(userId);
    });
  });

  describe('cardioProgress', () => {
    it('throws NotFoundException when the exercise does not exist', async () => {
      prisma.exercise.findUnique.mockResolvedValue(null);

      await expect(service.cardioProgress(99, 30, 'distance', ctx)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the exercise is not cardio', async () => {
      prisma.exercise.findUnique.mockResolvedValue(strengthExercise);

      await expect(service.cardioProgress(1, 30, 'distance', ctx)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('computes pace in seconds per km', async () => {
      prisma.exercise.findUnique.mockResolvedValue(cardioExercise);
      prisma.sessionSet.findMany.mockResolvedValue([
        makeCardioSet({ durationSeconds: 1800, distanceMeters: 5000 }),
      ]);

      const result = await service.cardioProgress(2, 30, 'pace', ctx);

      expect(result.points[0].value).toBe(360);
      expect(result.points[0].paceSecondsPerKm).toBe(360);
    });

    it('exposes paceSecondsPerKm as null and pace value as 0 when distance is zero', async () => {
      prisma.exercise.findUnique.mockResolvedValue(cardioExercise);
      prisma.sessionSet.findMany.mockResolvedValue([
        makeCardioSet({ durationSeconds: 600, distanceMeters: 0 }),
      ]);

      const result = await service.cardioProgress(2, 30, 'pace', ctx);

      expect(result.points[0].paceSecondsPerKm).toBeNull();
      expect(result.points[0].value).toBe(0);
    });

    it('returns bestSession with the highest metric value', async () => {
      prisma.exercise.findUnique.mockResolvedValue(cardioExercise);
      prisma.sessionSet.findMany.mockResolvedValue([
        makeCardioSet({
          session: { id: 's1', startedAt: new Date('2026-01-05T09:00:00Z') },
          distanceMeters: 5000,
        }),
        makeCardioSet({
          session: { id: 's2', startedAt: new Date('2026-01-08T09:00:00Z') },
          distanceMeters: 10000,
        }),
      ]);

      const result = await service.cardioProgress(2, 30, 'distance', ctx);

      expect(result.bestSession?.sessionId).toBe('s2');
      expect(result.bestSession?.value).toBe(10000);
    });

    it('returns bestSession null when there are no points', async () => {
      prisma.exercise.findUnique.mockResolvedValue(cardioExercise);
      prisma.sessionSet.findMany.mockResolvedValue([]);

      const result = await service.cardioProgress(2, 30, 'distance', ctx);

      expect(result.points).toEqual([]);
      expect(result.bestSession).toBeNull();
    });
  });

  describe('volumeProgress', () => {
    const session = (id: string, isoDate: string) => ({
      id,
      startedAt: new Date(`${isoDate}T09:00:00Z`),
    });

    it('aggregates weekly volume and counts distinct sessions', async () => {
      prisma.sessionSet.findMany.mockResolvedValue([
        { weightKg: 100, reps: 5, session: session('s1', '2026-01-06') },
        { weightKg: 80, reps: 8, session: session('s1', '2026-01-06') },
        { weightKg: 60, reps: 10, session: session('s2', '2026-01-08') },
      ]);

      const result = await service.volumeProgress(30, undefined, ctx);

      expect(result.weeks).toHaveLength(1);
      expect(result.weeks[0].totalVolumeKg).toBe(100 * 5 + 80 * 8 + 60 * 10);
      expect(result.weeks[0].sessionCount).toBe(2);
    });

    it('returns averageWeeklyVolumeKg = 0 when there are no sets', async () => {
      prisma.sessionSet.findMany.mockResolvedValue([]);

      const result = await service.volumeProgress(30, undefined, ctx);

      expect(result.weeks).toEqual([]);
      expect(result.averageWeeklyVolumeKg).toBe(0);
    });

    it('passes the muscleGroup filter through to the query when provided', async () => {
      prisma.sessionSet.findMany.mockResolvedValue([]);

      await service.volumeProgress(30, 'chest', ctx);

      const callArg = prisma.sessionSet.findMany.mock.calls[0][0];
      expect(callArg.where.exercise).toEqual({ muscleGroup: 'chest' });
    });

    it('does not include exercise filter when muscleGroup is omitted', async () => {
      prisma.sessionSet.findMany.mockResolvedValue([]);

      await service.volumeProgress(30, undefined, ctx);

      const callArg = prisma.sessionSet.findMany.mock.calls[0][0];
      expect(callArg.where).not.toHaveProperty('exercise');
    });
  });

  describe('stepsProgress', () => {
    it('flags goalReached per day based on the user target', async () => {
      stepLogs.getHistory.mockResolvedValue([
        { date: '2026-01-13', steps: 7000 },
        { date: '2026-01-14', steps: 9000 },
      ]);
      prisma.userGoals.findUnique.mockResolvedValue({ dailyStepsTarget: 8000 });

      const result = await service.stepsProgress(2, ctx);

      expect(result.points[0].goalReached).toBe(false);
      expect(result.points[1].goalReached).toBe(true);
      expect(result.daysWithGoalReached).toBe(1);
      expect(result.goalTarget).toBe(8000);
    });

    it('returns goalReached null on each day when there is no goal set', async () => {
      stepLogs.getHistory.mockResolvedValue([{ date: '2026-01-15', steps: 5000 }]);
      prisma.userGoals.findUnique.mockResolvedValue(null);

      const result = await service.stepsProgress(1, ctx);

      expect(result.points[0].goalReached).toBeNull();
      expect(result.goalTarget).toBeNull();
      expect(result.daysWithGoalReached).toBe(0);
    });

    it('computes totalSteps, averageDaily and bestDay', async () => {
      stepLogs.getHistory.mockResolvedValue([
        { date: '2026-01-13', steps: 4000 },
        { date: '2026-01-14', steps: 12000 },
        { date: '2026-01-15', steps: 8000 },
      ]);
      prisma.userGoals.findUnique.mockResolvedValue(null);

      const result = await service.stepsProgress(3, ctx);

      expect(result.totalSteps).toBe(24000);
      expect(result.averageDaily).toBe(8000);
      expect(result.bestDay).toEqual({ date: '2026-01-14', steps: 12000 });
    });

    it('ignores zero-step days when picking bestDay', async () => {
      stepLogs.getHistory.mockResolvedValue([
        { date: '2026-01-13', steps: 0 },
        { date: '2026-01-14', steps: 0 },
        { date: '2026-01-15', steps: 0 },
      ]);
      prisma.userGoals.findUnique.mockResolvedValue(null);

      const result = await service.stepsProgress(3, ctx);

      expect(result.bestDay).toBeNull();
    });
  });
});
