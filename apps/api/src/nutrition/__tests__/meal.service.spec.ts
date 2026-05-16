import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MealType } from '@prisma/client';
import { MealService } from '../meal.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  food: { findFirst: jest.Mock };
  meal: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

const makePrisma = (): MockPrisma => ({
  food: { findFirst: jest.fn() },
  meal: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

const makeFood = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  name: 'Rice',
  groupId: 5,
  kcalPer100g: 130,
  proteinPer100g: 2.5,
  carbsPer100g: 28,
  fatPer100g: 0.2,
  createdByUserId: null,
  ...overrides,
});

describe('MealService', () => {
  let prisma: MockPrisma;
  let service: MealService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new MealService(prisma as unknown as PrismaService);
  });

  describe('resolveItems', () => {
    it('computes macros via rule of three when foodId is provided', async () => {
      prisma.food.findFirst.mockResolvedValue(makeFood());

      const result = await service.resolveItems(userId, [{ foodId: 1, grams: 150 }]);

      expect(result).toEqual([
        {
          foodId: 1,
          foodName: 'Rice',
          groupId: 5,
          grams: 150,
          kcal: 195,
          proteinG: 3.75,
          carbsG: 42,
          fatG: 0.3,
        },
      ]);
    });

    it('honors a custom foodName even when foodId is set (snapshot semantics)', async () => {
      prisma.food.findFirst.mockResolvedValue(makeFood());

      const [item] = await service.resolveItems(userId, [
        { foodId: 1, foodName: "Grandma's Rice", grams: 100 },
      ]);

      expect(item.foodName).toBe("Grandma's Rice");
      expect(item.foodId).toBe(1);
    });

    it('accepts free-form items: explicit macros without calling food.findFirst', async () => {
      const [item] = await service.resolveItems(userId, [
        {
          foodName: 'Estimated Pão de Queijo',
          grams: 80,
          kcal: 280,
          proteinG: 6,
          carbsG: 30,
          fatG: 15,
        },
      ]);

      expect(prisma.food.findFirst).not.toHaveBeenCalled();
      expect(item).toMatchObject({
        foodId: null,
        foodName: 'Estimated Pão de Queijo',
        grams: 80,
        kcal: 280,
      });
    });

    it('defaults free-form macros to 0 when not provided', async () => {
      const [item] = await service.resolveItems(userId, [{ foodName: 'Water', grams: 200 }]);

      expect(item).toMatchObject({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    });

    it('throws ForbiddenException when a free-form item is missing foodName', async () => {
      await expect(service.resolveItems(userId, [{ grams: 50 }])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when foodId does not exist (or is not accessible)', async () => {
      prisma.food.findFirst.mockResolvedValue(null);

      await expect(service.resolveItems(userId, [{ foodId: 999, grams: 100 }])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('filters Food by ownership (public TACO + user-owned only)', async () => {
      prisma.food.findFirst.mockResolvedValue(makeFood());

      await service.resolveItems(userId, [{ foodId: 1, grams: 100 }]);

      expect(prisma.food.findFirst).toHaveBeenCalledWith({
        where: { id: 1, OR: [{ createdByUserId: null }, { createdByUserId: userId }] },
      });
    });
  });

  describe('create', () => {
    it('resolves items, then creates the meal with nested items', async () => {
      prisma.food.findFirst.mockResolvedValue(makeFood());
      const createdMeal = {
        id: 'meal-1',
        userId,
        mealType: MealType.LUNCH,
        eatenAt: new Date('2026-01-15T12:00:00Z'),
        items: [],
      };
      prisma.meal.create.mockResolvedValue(createdMeal);

      await service.create(userId, {
        mealType: MealType.LUNCH,
        eatenAt: '2026-01-15T12:00:00Z',
        items: [{ foodId: 1, grams: 100 }],
      });

      expect(prisma.meal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            mealType: MealType.LUNCH,
            eatenAt: new Date('2026-01-15T12:00:00Z'),
            items: { create: expect.any(Array) },
          }),
        }),
      );
      const createdItems = prisma.meal.create.mock.calls[0][0].data.items.create;
      expect(createdItems[0].kcal).toBe(130);
    });
  });

  describe('findById', () => {
    it('filters by userId in the SELECT (isolation boundary)', async () => {
      prisma.meal.findFirst.mockResolvedValue(null);

      await expect(service.findById(userId, 'meal-x')).rejects.toThrow(NotFoundException);
      expect(prisma.meal.findFirst).toHaveBeenCalledWith({
        where: { id: 'meal-x', userId },
        include: { items: true },
      });
    });

    it('returns the meal when it belongs to the user', async () => {
      const meal = { id: 'meal-1', userId, items: [] };
      prisma.meal.findFirst.mockResolvedValue(meal);

      const result = await service.findById(userId, 'meal-1');

      expect(result).toBe(meal);
    });
  });

  describe('list', () => {
    it('always filters by userId (isolation boundary)', async () => {
      prisma.meal.findMany.mockResolvedValue([]);

      await service.list(userId, {});

      expect(prisma.meal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId }) }),
      );
    });

    it('applies a UTC day window when date is provided', async () => {
      prisma.meal.findMany.mockResolvedValue([]);

      await service.list(userId, { date: '2026-01-15' });

      const where = prisma.meal.findMany.mock.calls[0][0].where;
      expect(where.eatenAt.gte).toEqual(new Date('2026-01-15T00:00:00.000Z'));
      expect(where.eatenAt.lt).toEqual(new Date('2026-01-16T00:00:00.000Z'));
    });

    it('caps limit at 50', async () => {
      prisma.meal.findMany.mockResolvedValue([]);

      await service.list(userId, { limit: 9999 });

      expect(prisma.meal.findMany.mock.calls[0][0].take).toBe(50);
    });

    it('forwards cursor pagination and skips the cursor row', async () => {
      prisma.meal.findMany.mockResolvedValue([]);

      await service.list(userId, { cursor: 'meal-50' });

      const callArg = prisma.meal.findMany.mock.calls[0][0];
      expect(callArg.cursor).toEqual({ id: 'meal-50' });
      expect(callArg.skip).toBe(1);
    });
  });

  describe('update', () => {
    it('updates the meal when the user owns it', async () => {
      prisma.meal.findUnique.mockResolvedValue({ userId });
      prisma.meal.update.mockResolvedValue({ id: 'meal-1', mealType: MealType.LUNCH });

      await service.update(userId, 'meal-1', { mealType: MealType.LUNCH });

      expect(prisma.meal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'meal-1' },
          data: expect.objectContaining({ mealType: MealType.LUNCH }),
        }),
      );
    });

    it('throws ForbiddenException when user A tries to edit user B meal', async () => {
      prisma.meal.findUnique.mockResolvedValue({ userId: 'user-B' });

      await expect(service.update(userId, 'meal-1', { mealType: MealType.LUNCH })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.meal.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the meal does not exist', async () => {
      prisma.meal.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, 'meal-x', { mealType: MealType.LUNCH })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('deletes the meal when the user owns it', async () => {
      prisma.meal.findUnique.mockResolvedValue({ userId });
      prisma.meal.delete.mockResolvedValue({});

      await service.delete(userId, 'meal-1');

      expect(prisma.meal.delete).toHaveBeenCalledWith({ where: { id: 'meal-1' } });
    });

    it('throws ForbiddenException when the meal belongs to another user', async () => {
      prisma.meal.findUnique.mockResolvedValue({ userId: 'user-B' });

      await expect(service.delete(userId, 'meal-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.meal.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the meal does not exist', async () => {
      prisma.meal.findUnique.mockResolvedValue(null);

      await expect(service.delete(userId, 'meal-x')).rejects.toThrow(NotFoundException);
    });
  });
});
