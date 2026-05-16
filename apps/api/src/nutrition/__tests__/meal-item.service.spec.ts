import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MealItemService } from '../meal-item.service';
import type { PrismaService } from '../../common/prisma.service';
import type { MealService } from '../meal.service';

type MockPrisma = {
  meal: { findUnique: jest.Mock };
  mealItem: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
};

type MockMealService = {
  resolveItems: jest.Mock;
};

const makePrisma = (): MockPrisma => ({
  meal: { findUnique: jest.fn() },
  mealItem: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

const makeMealService = (): MockMealService => ({ resolveItems: jest.fn() });

const makeFood = () => ({
  id: 1,
  name: 'Rice',
  groupId: 5,
  kcalPer100g: 130,
  proteinPer100g: 2.5,
  carbsPer100g: 28,
  fatPer100g: 0.2,
});

describe('MealItemService', () => {
  let prisma: MockPrisma;
  let mealService: MockMealService;
  let service: MealItemService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    mealService = makeMealService();
    service = new MealItemService(
      prisma as unknown as PrismaService,
      mealService as unknown as MealService,
    );
  });

  describe('add', () => {
    it('asserts meal ownership, resolves item via MealService, then creates it linked to the meal', async () => {
      prisma.meal.findUnique.mockResolvedValue({ userId });
      mealService.resolveItems.mockResolvedValue([
        {
          foodId: 1,
          foodName: 'Rice',
          groupId: 5,
          grams: 100,
          kcal: 130,
          proteinG: 2.5,
          carbsG: 28,
          fatG: 0.2,
        },
      ]);
      prisma.mealItem.create.mockResolvedValue({ id: 'item-1' });

      await service.add(userId, 'meal-1', { foodId: 1, grams: 100 });

      expect(mealService.resolveItems).toHaveBeenCalledWith(userId, [{ foodId: 1, grams: 100 }]);
      expect(prisma.mealItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ mealId: 'meal-1', foodId: 1, kcal: 130 }),
      });
    });

    it('throws NotFoundException when the meal does not exist', async () => {
      prisma.meal.findUnique.mockResolvedValue(null);

      await expect(service.add(userId, 'meal-x', { foodId: 1, grams: 100 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the meal belongs to another user', async () => {
      prisma.meal.findUnique.mockResolvedValue({ userId: 'user-B' });

      await expect(service.add(userId, 'meal-1', { foodId: 1, grams: 100 })).rejects.toThrow(
        ForbiddenException,
      );
      expect(mealService.resolveItems).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const baseItem = {
      id: 'item-1',
      grams: 100,
      kcal: 130,
      proteinG: 2.5,
      carbsG: 28,
      fatG: 0.2,
      meal: { userId },
      food: makeFood(),
    };

    it('recomputes macros via rule of three when grams changes and the item is linked to a Food', async () => {
      prisma.mealItem.findUnique.mockResolvedValue(baseItem);
      prisma.mealItem.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'item-1', ...data }),
      );

      await service.update(userId, 'item-1', { grams: 200 });

      expect(prisma.mealItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { grams: 200, kcal: 260, proteinG: 5, carbsG: 56, fatG: 0.4 },
      });
    });

    it('keeps existing macros when grams is unchanged but other fields are updated', async () => {
      prisma.mealItem.findUnique.mockResolvedValue(baseItem);
      prisma.mealItem.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'item-1', ...data }),
      );

      await service.update(userId, 'item-1', {});

      const data = prisma.mealItem.update.mock.calls[0][0].data;
      expect(data).toEqual({ grams: 100, kcal: 130, proteinG: 2.5, carbsG: 28, fatG: 0.2 });
    });

    it('lets explicit macro overrides win over the recomputed values', async () => {
      prisma.mealItem.findUnique.mockResolvedValue(baseItem);
      prisma.mealItem.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'item-1', ...data }),
      );

      await service.update(userId, 'item-1', { grams: 200, kcal: 999, proteinG: 50 });

      const data = prisma.mealItem.update.mock.calls[0][0].data;
      expect(data.grams).toBe(200);
      expect(data.kcal).toBe(999);
      expect(data.proteinG).toBe(50);
      expect(data.carbsG).toBe(56);
      expect(data.fatG).toBe(0.4);
    });

    it('does not recompute when the item has no linked Food (free-form item)', async () => {
      prisma.mealItem.findUnique.mockResolvedValue({ ...baseItem, food: null });
      prisma.mealItem.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'item-1', ...data }),
      );

      await service.update(userId, 'item-1', { grams: 200 });

      const data = prisma.mealItem.update.mock.calls[0][0].data;
      expect(data).toEqual({ grams: 200, kcal: 130, proteinG: 2.5, carbsG: 28, fatG: 0.2 });
    });

    it('throws NotFoundException when the item does not exist', async () => {
      prisma.mealItem.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, 'item-x', { grams: 100 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the item belongs to another user (via meal)', async () => {
      prisma.mealItem.findUnique.mockResolvedValue({ ...baseItem, meal: { userId: 'user-B' } });

      await expect(service.update(userId, 'item-1', { grams: 100 })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.mealItem.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the item when the user owns the parent meal', async () => {
      prisma.mealItem.findUnique.mockResolvedValue({ id: 'item-1', meal: { userId } });
      prisma.mealItem.delete.mockResolvedValue({});

      await service.delete(userId, 'item-1');

      expect(prisma.mealItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
    });

    it('throws ForbiddenException when the parent meal belongs to another user', async () => {
      prisma.mealItem.findUnique.mockResolvedValue({
        id: 'item-1',
        meal: { userId: 'user-B' },
      });

      await expect(service.delete(userId, 'item-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.mealItem.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the item does not exist', async () => {
      prisma.mealItem.findUnique.mockResolvedValue(null);

      await expect(service.delete(userId, 'item-x')).rejects.toThrow(NotFoundException);
    });
  });
});
