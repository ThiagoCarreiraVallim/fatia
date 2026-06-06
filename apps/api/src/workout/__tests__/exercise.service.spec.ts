import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExerciseService } from '../exercise.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  exercise: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  sessionSet: { count: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  exercise: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  sessionSet: { count: jest.fn() },
});

const makeExercise = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  name: 'Bench Press',
  muscleGroup: 'chest',
  createdByUserId: null,
  ...overrides,
});

describe('ExerciseService', () => {
  let prisma: MockPrisma;
  let service: ExerciseService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new ExerciseService(prisma as unknown as PrismaService);
  });

  describe('search', () => {
    it('applies the OR(createdByUserId) filter so a user only sees public + own exercises', async () => {
      prisma.exercise.findMany.mockResolvedValue([]);

      await service.search(userId, { q: 'bench' });

      expect(prisma.exercise.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ createdByUserId: null }, { createdByUserId: userId }],
          }),
        }),
      );
    });

    it('searches by name with case-insensitive contains when q is provided', async () => {
      prisma.exercise.findMany.mockResolvedValue([]);

      await service.search(userId, { q: 'Squat' });

      const where = prisma.exercise.findMany.mock.calls[0][0].where;
      expect(where.name).toEqual({ contains: 'Squat', mode: 'insensitive' });
    });

    it('filters by muscleGroup when provided', async () => {
      prisma.exercise.findMany.mockResolvedValue([]);

      await service.search(userId, { muscleGroup: 'cardio' });

      const where = prisma.exercise.findMany.mock.calls[0][0].where;
      expect(where.muscleGroup).toBe('cardio');
    });

    it('caps limit at 50 even when a higher value is requested', async () => {
      prisma.exercise.findMany.mockResolvedValue([]);

      await service.search(userId, { limit: 9999 });

      expect(prisma.exercise.findMany.mock.calls[0][0].take).toBe(50);
    });

    it('defaults limit to 20 when not provided', async () => {
      prisma.exercise.findMany.mockResolvedValue([]);

      await service.search(userId, {});

      expect(prisma.exercise.findMany.mock.calls[0][0].take).toBe(20);
    });
  });

  describe('get', () => {
    it('returns the exercise when accessible (public or owned)', async () => {
      prisma.exercise.findFirst.mockResolvedValue(makeExercise());

      const result = await service.get(userId, 1);

      expect(result.id).toBe(1);
    });

    it('throws NotFoundException when exercise does not exist or is not accessible', async () => {
      prisma.exercise.findFirst.mockResolvedValue(null);

      await expect(service.get(userId, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCustom', () => {
    it('creates an exercise tagged with the user id', async () => {
      prisma.exercise.create.mockResolvedValue(makeExercise({ createdByUserId: userId }));

      await service.createCustom(userId, { name: 'Hex Bar DL', muscleGroup: 'back' });

      expect(prisma.exercise.create).toHaveBeenCalledWith({
        data: { name: 'Hex Bar DL', muscleGroup: 'back', createdByUserId: userId },
      });
    });

    it('translates Prisma P2002 (unique violation) into ConflictException', async () => {
      prisma.exercise.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.createCustom(userId, { name: 'Bench Press', muscleGroup: 'chest' }),
      ).rejects.toThrow(ConflictException);
    });

    it('re-throws unexpected errors unchanged', async () => {
      const boom = new Error('DB exploded');
      prisma.exercise.create.mockRejectedValue(boom);

      await expect(service.createCustom(userId, { name: 'X', muscleGroup: 'back' })).rejects.toBe(
        boom,
      );
    });
  });

  describe('updateCustom', () => {
    it('updates a custom exercise the user owns', async () => {
      prisma.exercise.findUnique.mockResolvedValue(makeExercise({ createdByUserId: userId }));
      prisma.exercise.update.mockResolvedValue(makeExercise({ name: 'New Name' }));

      await service.updateCustom(userId, 1, { name: 'New Name' });

      expect(prisma.exercise.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'New Name' },
      });
    });

    it('throws NotFoundException when exercise does not exist', async () => {
      prisma.exercise.findUnique.mockResolvedValue(null);

      await expect(service.updateCustom(userId, 999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the exercise belongs to another user', async () => {
      prisma.exercise.findUnique.mockResolvedValue(makeExercise({ createdByUserId: 'user-B' }));

      await expect(service.updateCustom(userId, 1, { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException for a base (public) exercise — base é só-leitura', async () => {
      prisma.exercise.findUnique.mockResolvedValue(makeExercise({ createdByUserId: null }));

      await expect(service.updateCustom(userId, 1, { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.exercise.update).not.toHaveBeenCalled();
    });

    it('fully edits the own custom exercise (enrichment fields)', async () => {
      prisma.exercise.findUnique.mockResolvedValue(makeExercise({ createdByUserId: userId }));
      prisma.exercise.update.mockResolvedValue(makeExercise({ createdByUserId: userId }));

      await service.updateCustom(userId, 1, {
        name: 'Supino reto',
        primaryMuscles: ['chest'],
        instructions: ['Deite no banco', 'Empurre a barra'],
      });

      expect(prisma.exercise.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: 'Supino reto',
          primaryMuscles: ['chest'],
          instructions: ['Deite no banco', 'Empurre a barra'],
        },
      });
    });

    it('throws ConflictException when renaming to a name already in use', async () => {
      prisma.exercise.findUnique.mockResolvedValue(makeExercise({ createdByUserId: userId }));
      prisma.exercise.update.mockRejectedValue({ code: 'P2002' });

      await expect(service.updateCustom(userId, 1, { name: 'Dup' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('cloneForEdit', () => {
    it('creates an editable copy of a base exercise (owned by user, clonedFromId set)', async () => {
      prisma.exercise.findFirst
        .mockResolvedValueOnce(
          makeExercise({ id: 5, createdByUserId: null, primaryMuscles: ['chest'] }),
        ) // base
        .mockResolvedValueOnce(null); // sem cópia ainda
      prisma.exercise.create.mockResolvedValue(
        makeExercise({ id: 9, createdByUserId: userId, clonedFromId: 5 }),
      );

      await service.cloneForEdit(userId, 5, { name: 'Meu supino' });

      const arg = prisma.exercise.create.mock.calls[0][0];
      expect(arg.data).toMatchObject({
        createdByUserId: userId,
        clonedFromId: 5,
        name: 'Meu supino',
        primaryMuscles: ['chest'],
      });
      expect(arg.data.id).toBeUndefined();
    });

    it('returns the existing copy if the user already cloned that base', async () => {
      prisma.exercise.findFirst
        .mockResolvedValueOnce(makeExercise({ id: 5, createdByUserId: null })) // base
        .mockResolvedValueOnce(makeExercise({ id: 9, createdByUserId: userId, clonedFromId: 5 })); // cópia

      const result = await service.cloneForEdit(userId, 5);

      expect(result).toMatchObject({ id: 9 });
      expect(prisma.exercise.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the base does not exist / not visible', async () => {
      prisma.exercise.findFirst.mockResolvedValueOnce(null);

      await expect(service.cloneForEdit(userId, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('search shadowing', () => {
    it('hides base exercises the user has already cloned (relation filter)', async () => {
      prisma.exercise.findMany.mockResolvedValue([]);

      await service.search(userId, {});

      expect(prisma.exercise.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            NOT: { clones: { some: { createdByUserId: userId } } },
          }),
        }),
      );
    });
  });

  describe('deleteCustom', () => {
    it('deletes the exercise when the user owns it and no session sets reference it', async () => {
      prisma.exercise.findUnique.mockResolvedValue(makeExercise({ createdByUserId: userId }));
      prisma.sessionSet.count.mockResolvedValue(0);
      prisma.exercise.delete.mockResolvedValue({});

      await service.deleteCustom(userId, 1);

      expect(prisma.exercise.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('throws NotFoundException when exercise does not exist', async () => {
      prisma.exercise.findUnique.mockResolvedValue(null);

      await expect(service.deleteCustom(userId, 999)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the exercise belongs to another user', async () => {
      prisma.exercise.findUnique.mockResolvedValue(makeExercise({ createdByUserId: 'user-B' }));

      await expect(service.deleteCustom(userId, 1)).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when session sets reference the exercise', async () => {
      prisma.exercise.findUnique.mockResolvedValue(makeExercise({ createdByUserId: userId }));
      prisma.sessionSet.count.mockResolvedValue(3);

      await expect(service.deleteCustom(userId, 1)).rejects.toThrow(ConflictException);
      expect(prisma.exercise.delete).not.toHaveBeenCalled();
    });
  });
});
