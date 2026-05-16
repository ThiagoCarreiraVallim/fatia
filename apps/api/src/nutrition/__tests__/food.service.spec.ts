import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FoodSource } from '@prisma/client';
import { FoodService } from '../food.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  food: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  foodGroup: { findMany: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  food: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  foodGroup: { findMany: jest.fn() },
});

const makeFood = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  name: 'Rice',
  groupId: 5,
  source: FoodSource.TACO,
  createdByUserId: null,
  kcalPer100g: 130,
  proteinPer100g: 2.5,
  carbsPer100g: 28,
  fatPer100g: 0.2,
  ...overrides,
});

describe('FoodService', () => {
  let prisma: MockPrisma;
  let service: FoodService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new FoodService(prisma as unknown as PrismaService);
  });

  describe('search', () => {
    it('always combines public (createdByUserId=null) with user-owned foods', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search(userId, {});

      const where = prisma.food.findMany.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      });
    });

    it('adds case-insensitive name search when q is provided', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search(userId, { q: 'Arroz' });

      const where = prisma.food.findMany.mock.calls[0][0].where;
      expect(where.AND[1]).toEqual({ name: { contains: 'Arroz', mode: 'insensitive' } });
    });

    it('adds a groupId filter when provided', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search(userId, { groupId: 5 });

      const where = prisma.food.findMany.mock.calls[0][0].where;
      expect(where.AND[2]).toEqual({ groupId: 5 });
    });

    it('caps limit at 50 (default 20)', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search(userId, { limit: 9999 });
      expect(prisma.food.findMany.mock.calls[0][0].take).toBe(50);

      await service.search(userId, {});
      expect(prisma.food.findMany.mock.calls[1][0].take).toBe(20);
    });
  });

  describe('get', () => {
    it('returns the food when accessible', async () => {
      prisma.food.findFirst.mockResolvedValue(makeFood());

      const result = await service.get(userId, 1);

      expect(result.id).toBe(1);
    });

    it('throws NotFoundException when no row matches the ownership filter', async () => {
      prisma.food.findFirst.mockResolvedValue(null);

      await expect(service.get(userId, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCustom', () => {
    it('tags the new food as CUSTOM and owned by the user', async () => {
      prisma.food.create.mockResolvedValue(makeFood({ source: FoodSource.CUSTOM }));

      await service.createCustom(userId, {
        name: 'Grandma cake',
        groupId: 9,
        kcalPer100g: 320,
        proteinPer100g: 5,
        carbsPer100g: 50,
        fatPer100g: 12,
      });

      expect(prisma.food.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Grandma cake',
          source: FoodSource.CUSTOM,
          createdByUserId: userId,
        }),
      });
    });
  });

  describe('updateCustom', () => {
    it('updates a CUSTOM food the user owns', async () => {
      prisma.food.findUnique.mockResolvedValue(
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: userId }),
      );
      prisma.food.update.mockResolvedValue(makeFood({ name: 'Renamed' }));

      await service.updateCustom(userId, 1, { name: 'Renamed' });

      expect(prisma.food.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'Renamed' },
      });
    });

    it('throws NotFoundException when the food does not exist', async () => {
      prisma.food.findUnique.mockResolvedValue(null);

      await expect(service.updateCustom(userId, 999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to edit public catalog foods (TACO/USDA)', async () => {
      prisma.food.findUnique.mockResolvedValue(makeFood({ source: FoodSource.TACO }));

      await expect(service.updateCustom(userId, 1, { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses to edit a CUSTOM food owned by another user', async () => {
      prisma.food.findUnique.mockResolvedValue(
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: 'user-B' }),
      );

      await expect(service.updateCustom(userId, 1, { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('deleteCustom', () => {
    it('deletes a CUSTOM food the user owns', async () => {
      prisma.food.findUnique.mockResolvedValue(
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: userId }),
      );
      prisma.food.delete.mockResolvedValue({});

      await service.deleteCustom(userId, 1);

      expect(prisma.food.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('refuses to delete public catalog foods', async () => {
      prisma.food.findUnique.mockResolvedValue(makeFood({ source: FoodSource.TACO }));

      await expect(service.deleteCustom(userId, 1)).rejects.toThrow(ForbiddenException);
      expect(prisma.food.delete).not.toHaveBeenCalled();
    });
  });

  describe('listGroups', () => {
    it('returns all groups ordered alphabetically', async () => {
      prisma.foodGroup.findMany.mockResolvedValue([]);

      await service.listGroups();

      expect(prisma.foodGroup.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    });
  });
});
