import { ConflictException } from '@nestjs/common';
import { ExerciseService } from './exercise.service';
import type { PrismaService } from '../common/prisma.service';

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

describe('ExerciseService.search', () => {
  it('applies OR createdByUserId filter for user isolation', async () => {
    const prisma = makePrisma();
    const service = new ExerciseService(prisma as unknown as PrismaService);
    prisma.exercise.findMany.mockResolvedValue([]);

    await service.search('user-A', { q: 'supino' });

    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ createdByUserId: null }, { createdByUserId: 'user-A' }],
        }),
      }),
    );
  });
});

describe('ExerciseService.deleteCustom', () => {
  it('rejects deletion when exercise has session sets', async () => {
    const prisma = makePrisma();
    const service = new ExerciseService(prisma as unknown as PrismaService);
    prisma.exercise.findUnique.mockResolvedValue({ id: 1, createdByUserId: 'user-A' });
    prisma.sessionSet.count.mockResolvedValue(3);

    await expect(service.deleteCustom('user-A', 1)).rejects.toThrow(ConflictException);
  });

  it('allows deletion when exercise has no session sets', async () => {
    const prisma = makePrisma();
    const service = new ExerciseService(prisma as unknown as PrismaService);
    prisma.exercise.findUnique.mockResolvedValue({ id: 1, createdByUserId: 'user-A' });
    prisma.sessionSet.count.mockResolvedValue(0);
    prisma.exercise.delete.mockResolvedValue({});

    await service.deleteCustom('user-A', 1);

    expect(prisma.exercise.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});
