import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkoutPlanService } from '../workout-plan.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  workoutPlan: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  workoutPlanExercise: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  $transaction: jest.Mock;
};

const makePrisma = (): MockPrisma => ({
  workoutPlan: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  workoutPlanExercise: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
});

describe('WorkoutPlanService', () => {
  let prisma: MockPrisma;
  let service: WorkoutPlanService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new WorkoutPlanService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a plan tied to the user and includes ordered exercises', async () => {
      prisma.workoutPlan.create.mockResolvedValue({ id: 'plan-1', exercises: [] });

      await service.create(userId, { name: 'Push A' });

      expect(prisma.workoutPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId, name: 'Push A' },
          include: expect.objectContaining({
            exercises: expect.objectContaining({ orderBy: { order: 'asc' } }),
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('filters by userId in the query (isolation boundary)', async () => {
      prisma.workoutPlan.findFirst.mockResolvedValue({ id: 'plan-1', exercises: [] });

      await service.findById(userId, 'plan-1');

      expect(prisma.workoutPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'plan-1', userId } }),
      );
    });

    it('throws NotFoundException when no plan matches the user/id pair', async () => {
      prisma.workoutPlan.findFirst.mockResolvedValue(null);

      await expect(service.findById(userId, 'plan-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns only the user own plans sorted by createdAt asc', async () => {
      prisma.workoutPlan.findMany.mockResolvedValue([]);

      await service.list(userId);

      expect(prisma.workoutPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });
  });

  describe('update', () => {
    it('updates a plan the user owns', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId });
      prisma.workoutPlan.update.mockResolvedValue({ id: 'plan-1', name: 'Renamed' });

      await service.update(userId, 'plan-1', { name: 'Renamed' });

      expect(prisma.workoutPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'plan-1' }, data: { name: 'Renamed' } }),
      );
    });

    it('throws NotFoundException when the plan does not exist', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, 'plan-x', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the plan belongs to another user', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId: 'user-B' });

      await expect(service.update(userId, 'plan-1', { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.workoutPlan.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes a plan the user owns', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId });
      prisma.workoutPlan.delete.mockResolvedValue({});

      await service.delete(userId, 'plan-1');

      expect(prisma.workoutPlan.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
    });

    it('refuses to delete a plan that belongs to another user', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId: 'user-B' });

      await expect(service.delete(userId, 'plan-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.workoutPlan.delete).not.toHaveBeenCalled();
    });
  });

  describe('addExercise', () => {
    it('creates the plan-exercise row when the plan belongs to the user', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId });
      prisma.workoutPlanExercise.create.mockResolvedValue({ id: 'pe-1' });

      await service.addExercise(userId, 'plan-1', {
        exerciseId: 1,
        order: 1,
        targetSets: 3,
        targetReps: '8-12',
      });

      expect(prisma.workoutPlanExercise.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            planId: 'plan-1',
            exerciseId: 1,
            order: 1,
            targetSets: 3,
            targetReps: '8-12',
          }),
        }),
      );
    });

    it('translates P2002 (exercise already in plan) into ConflictException', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId });
      prisma.workoutPlanExercise.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.addExercise(userId, 'plan-1', {
          exerciseId: 1,
          order: 1,
          targetSets: 3,
          targetReps: '8-12',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('re-throws unexpected errors unchanged', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId });
      const boom = new Error('DB exploded');
      prisma.workoutPlanExercise.create.mockRejectedValue(boom);

      await expect(
        service.addExercise(userId, 'plan-1', {
          exerciseId: 1,
          order: 1,
          targetSets: 3,
          targetReps: '8-12',
        }),
      ).rejects.toBe(boom);
    });

    it('refuses to add to a plan owned by another user', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId: 'user-B' });

      await expect(
        service.addExercise(userId, 'plan-1', {
          exerciseId: 1,
          order: 1,
          targetSets: 3,
          targetReps: '8-12',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updatePlanExercise', () => {
    it('updates the plan-exercise when both ownership and (planId, peId) match', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId });
      prisma.workoutPlanExercise.findFirst.mockResolvedValue({ id: 'pe-1' });
      prisma.workoutPlanExercise.update.mockResolvedValue({ id: 'pe-1', order: 5 });

      await service.updatePlanExercise(userId, 'plan-1', 'pe-1', { order: 5 });

      expect(prisma.workoutPlanExercise.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pe-1' }, data: { order: 5 } }),
      );
    });

    it('throws NotFoundException when the plan-exercise does not belong to that plan', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId });
      prisma.workoutPlanExercise.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePlanExercise(userId, 'plan-1', 'pe-x', { order: 5 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeExercise', () => {
    it('deletes the plan-exercise when ownership and scoping match', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId });
      prisma.workoutPlanExercise.findFirst.mockResolvedValue({ id: 'pe-1' });
      prisma.workoutPlanExercise.delete.mockResolvedValue({});

      await service.removeExercise(userId, 'plan-1', 'pe-1');

      expect(prisma.workoutPlanExercise.delete).toHaveBeenCalledWith({ where: { id: 'pe-1' } });
    });

    it('throws NotFoundException when the plan-exercise is not in that plan', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId });
      prisma.workoutPlanExercise.findFirst.mockResolvedValue(null);

      await expect(service.removeExercise(userId, 'plan-1', 'pe-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reorderExercises', () => {
    it('updates every plan-exercise inside a single transaction', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId });
      prisma.workoutPlan.findFirst.mockResolvedValue({ id: 'plan-1', exercises: [] });
      prisma.workoutPlanExercise.update.mockResolvedValue({});

      await service.reorderExercises(userId, 'plan-1', {
        exercises: [
          { id: 'pe-1', order: 2 },
          { id: 'pe-2', order: 1 },
        ],
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.workoutPlanExercise.update).toHaveBeenCalledTimes(2);
      expect(prisma.workoutPlanExercise.update).toHaveBeenCalledWith({
        where: { id: 'pe-1' },
        data: { order: 2 },
      });
    });

    it('refuses to reorder a plan owned by another user', async () => {
      prisma.workoutPlan.findUnique.mockResolvedValue({ id: 'plan-1', userId: 'user-B' });

      await expect(service.reorderExercises(userId, 'plan-1', { exercises: [] })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
