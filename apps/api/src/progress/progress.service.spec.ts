import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProgressService } from './progress.service';
import type { PrismaService } from '../common/prisma.service';
import type { StepLogService } from './step-log.service';

type MockPrisma = {
  weightLog: { findMany: jest.Mock };
  sessionSet: { findMany: jest.Mock };
  workoutSession: { findMany: jest.Mock };
  stepLog: { groupBy: jest.Mock };
  userGoals: { findUnique: jest.Mock };
  exercise: { findFirst: jest.Mock };
};

type MockStepLogs = {
  getHistory: jest.Mock;
};

const makePrisma = (): MockPrisma => ({
  weightLog: { findMany: jest.fn() },
  sessionSet: { findMany: jest.fn() },
  workoutSession: { findMany: jest.fn() },
  stepLog: { groupBy: jest.fn() },
  userGoals: { findUnique: jest.fn() },
  exercise: { findFirst: jest.fn() },
});

const makeStepLogs = (): MockStepLogs => ({
  getHistory: jest.fn(),
});

const TZ = 'UTC';

describe('ProgressService', () => {
  let prisma: MockPrisma;
  let stepLogs: MockStepLogs;
  let service: ProgressService;
  const userId = 'user-1';
  const ctx = { userId, timezone: TZ };

  beforeEach(() => {
    prisma = makePrisma();
    stepLogs = makeStepLogs();
    service = new ProgressService(
      prisma as unknown as PrismaService,
      stepLogs as unknown as StepLogService,
    );
  });

  // ── weightProgress ───────────────────────────────────────────────────────

  describe('weightProgress', () => {
    it('retorna totalDeltaKg entre primeiro e último ponto', async () => {
      prisma.weightLog.findMany.mockResolvedValue([
        { id: 'a', loggedAt: new Date('2026-01-01T10:00:00Z'), weightKg: 80 },
        { id: 'b', loggedAt: new Date('2026-01-05T10:00:00Z'), weightKg: 78.5 },
      ]);
      const result = await service.weightProgress(30, ctx);
      expect(result.totalDeltaKg).toBeCloseTo(-1.5);
    });

    it('retorna totalDeltaKg 0 com menos de 2 pontos', async () => {
      prisma.weightLog.findMany.mockResolvedValue([
        { id: 'a', loggedAt: new Date('2026-01-01T10:00:00Z'), weightKg: 80 },
      ]);
      const result = await service.weightProgress(30, ctx);
      expect(result.totalDeltaKg).toBe(0);
    });

    it('retorna pontos com campo date e weeklyAverages', async () => {
      prisma.weightLog.findMany.mockResolvedValue([
        { id: 'a', loggedAt: new Date('2026-01-05T10:00:00Z'), weightKg: 80 },
        { id: 'b', loggedAt: new Date('2026-01-06T10:00:00Z'), weightKg: 79 },
      ]);
      const result = await service.weightProgress(7, ctx);
      expect(result.points).toHaveLength(2);
      expect(result.points[0].date).toBe('2026-01-05');
      expect(result.weeklyAverages).toHaveLength(1);
      expect(result.weeklyAverages[0].avgKg).toBeCloseTo(79.5);
    });

    it('weekly avgKg arredonda corretamente', async () => {
      prisma.weightLog.findMany.mockResolvedValue([
        { id: 'a', loggedAt: new Date('2026-01-05T10:00:00Z'), weightKg: 80.1 },
        { id: 'b', loggedAt: new Date('2026-01-06T10:00:00Z'), weightKg: 80.2 },
        { id: 'c', loggedAt: new Date('2026-01-07T10:00:00Z'), weightKg: 80.3 },
      ]);
      const result = await service.weightProgress(7, ctx);
      expect(result.weeklyAverages[0].avgKg).toBeCloseTo(80.2);
    });
  });

  // ── strengthProgress ─────────────────────────────────────────────────────

  describe('strengthProgress', () => {
    it('lança BadRequest se exercício for cardio', async () => {
      prisma.exercise.findFirst.mockResolvedValue({
        id: 1,
        muscleGroup: 'cardio',
        createdByUserId: null,
      });
      await expect(service.strengthProgress(1, 30, 'estimated_1rm', ctx)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lança NotFoundException para exercício inexistente', async () => {
      prisma.exercise.findFirst.mockResolvedValue(null);
      await expect(service.strengthProgress(99, 30, 'estimated_1rm', ctx)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('calcula 1rm max na sessão (Epley)', async () => {
      prisma.exercise.findFirst.mockResolvedValue({
        id: 1,
        muscleGroup: 'chest',
        createdByUserId: null,
      });
      const session = { id: 's1', startedAt: new Date('2026-01-05T09:00:00Z') };
      prisma.sessionSet.findMany.mockResolvedValue([
        { session, exerciseId: 1, setNumber: 1, weightKg: 100, reps: 5 },
        { session, exerciseId: 1, setNumber: 2, weightKg: 90, reps: 10 },
      ]);
      const result = await service.strengthProgress(1, 30, 'estimated_1rm', ctx);
      // 100*(1+5/30)=116.67 vs 90*(1+10/30)=120 → max must be 120
      expect(result.points[0].value).toBe(120);
    });

    it('calcula volume como soma de weightKg*reps', async () => {
      prisma.exercise.findFirst.mockResolvedValue({
        id: 1,
        muscleGroup: 'back',
        createdByUserId: null,
      });
      const session = { id: 's1', startedAt: new Date('2026-01-05T09:00:00Z') };
      prisma.sessionSet.findMany.mockResolvedValue([
        { session, exerciseId: 1, setNumber: 1, weightKg: 100, reps: 5 },
        { session, exerciseId: 1, setNumber: 2, weightKg: 80, reps: 8 },
      ]);
      const result = await service.strengthProgress(1, 30, 'total_volume', ctx);
      expect(result.points[0].value).toBe(1140); // 100*5 + 80*8 = 500+640
    });

    it('calcula weight como max weightKg', async () => {
      prisma.exercise.findFirst.mockResolvedValue({
        id: 1,
        muscleGroup: 'legs',
        createdByUserId: null,
      });
      const session = { id: 's1', startedAt: new Date('2026-01-05T09:00:00Z') };
      prisma.sessionSet.findMany.mockResolvedValue([
        { session, exerciseId: 1, setNumber: 1, weightKg: 100, reps: 5 },
        { session, exerciseId: 1, setNumber: 2, weightKg: 120, reps: 3 },
      ]);
      const result = await service.strengthProgress(1, 30, 'max_weight', ctx);
      expect(result.points[0].value).toBe(120);
    });
  });

  // ── cardioProgress ───────────────────────────────────────────────────────

  describe('cardioProgress', () => {
    it('lança BadRequest se exercício não for cardio', async () => {
      prisma.exercise.findFirst.mockResolvedValue({
        id: 2,
        muscleGroup: 'chest',
        createdByUserId: null,
      });
      await expect(service.cardioProgress(2, 30, 'distance', ctx)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('calcula pace em segundos por km', async () => {
      prisma.exercise.findFirst.mockResolvedValue({
        id: 2,
        muscleGroup: 'cardio',
        createdByUserId: null,
      });
      const session = { id: 's1', startedAt: new Date('2026-01-05T09:00:00Z') };
      prisma.sessionSet.findMany.mockResolvedValue([
        {
          session,
          exerciseId: 2,
          setNumber: 1,
          durationSeconds: 1800,
          distanceMeters: 5000,
          kcalBurned: 300,
        },
      ]);
      const result = await service.cardioProgress(2, 30, 'pace', ctx);
      // pace = (1800/5000)*1000 = 360 s/km
      expect(result.points[0].value).toBe(360);
    });

    it('pace é 0 quando não há distância', async () => {
      prisma.exercise.findFirst.mockResolvedValue({
        id: 2,
        muscleGroup: 'cardio',
        createdByUserId: null,
      });
      const session = { id: 's1', startedAt: new Date('2026-01-05T09:00:00Z') };
      prisma.sessionSet.findMany.mockResolvedValue([
        {
          session,
          exerciseId: 2,
          setNumber: 1,
          durationSeconds: 600,
          distanceMeters: 0,
          kcalBurned: 100,
        },
      ]);
      const result = await service.cardioProgress(2, 30, 'pace', ctx);
      expect(result.points[0].value).toBe(0);
    });
  });

  // ── stepsProgress ────────────────────────────────────────────────────────

  describe('stepsProgress', () => {
    it('usa política de max por dia (ADR 007)', async () => {
      stepLogs.getHistory.mockResolvedValue([{ date: '2026-01-05', steps: 9000 }]);
      prisma.userGoals.findUnique.mockResolvedValue({ dailyStepsTarget: 8000 });
      const result = await service.stepsProgress(1, ctx);
      expect(result.points.length).toBeGreaterThanOrEqual(1);
      expect(result.points.every((p) => typeof p.steps === 'number')).toBe(true);
    });

    it('dias sem log retornam 0 steps', async () => {
      stepLogs.getHistory.mockResolvedValue([
        { date: '2026-01-05', steps: 0 },
        { date: '2026-01-06', steps: 0 },
        { date: '2026-01-07', steps: 0 },
      ]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      const result = await service.stepsProgress(3, ctx);
      expect(result.points.every((p) => p.steps === 0)).toBe(true);
      expect(result.points).toHaveLength(3);
    });

    it('daysWithGoalReached conta corretamente', async () => {
      const today = new Date().toISOString().slice(0, 10);
      stepLogs.getHistory.mockResolvedValue([{ date: today, steps: 10000 }]);
      prisma.userGoals.findUnique.mockResolvedValue({ dailyStepsTarget: 8000 });
      const result = await service.stepsProgress(1, ctx);
      expect(result.daysWithGoalReached).toBe(1);
      expect(result.goalTarget).toBe(8000);
    });

    it('usa goalTarget null quando userGoals é null', async () => {
      stepLogs.getHistory.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      const result = await service.stepsProgress(1, ctx);
      expect(result.goalTarget).toBeNull();
    });
  });
});
