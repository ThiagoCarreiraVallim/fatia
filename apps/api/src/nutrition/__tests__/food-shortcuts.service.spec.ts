import { NotFoundException } from '@nestjs/common';
import { FoodSource, MealType } from '@prisma/client';
import { FoodShortcutsService } from '../food-shortcuts.service';
import type { FoodService } from '../food.service';
import type { PrismaService } from '../../common/prisma.service';

const food = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Alimento ${id}`,
  source: FoodSource.TACO,
  createdByUserId: null,
  kcalPer100g: 100,
  proteinPer100g: 1,
  carbsPer100g: 1,
  fatPer100g: 1,
  ...extra,
});

/** Item de refeição como o `findMany` devolve: mais recente primeiro. */
const eaten = (foodId: number, grams: number, mealType: MealType, day: number) => ({
  foodId,
  grams,
  meal: { mealType, eatenAt: new Date(2026, 9, day, 12) },
});

describe('FoodShortcutsService', () => {
  const userId = 'user-A';
  let prisma: {
    mealItem: { findMany: jest.Mock };
    food: { findMany: jest.Mock };
    favoriteFood: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
  };
  let foods: { get: jest.Mock };
  let service: FoodShortcutsService;

  beforeEach(() => {
    prisma = {
      mealItem: { findMany: jest.fn().mockResolvedValue([]) },
      food: { findMany: jest.fn().mockResolvedValue([]) },
      favoriteFood: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    foods = { get: jest.fn() };
    service = new FoodShortcutsService(
      prisma as unknown as PrismaService,
      foods as unknown as FoodService,
    );
  });

  describe('list', () => {
    it('lê o histórico só do próprio usuário', async () => {
      await service.list(userId, {});

      const where = prisma.mealItem.findMany.mock.calls[0][0].where;
      expect(where.meal.userId).toBe(userId);
      expect(where.foodId).toEqual({ not: null });
      expect(prisma.favoriteFood.findMany.mock.calls[0][0].where).toEqual({ userId });
    });

    it('agrupa por alimento, com a última gramagem e quantas vezes foi comido', async () => {
      prisma.mealItem.findMany.mockResolvedValue([
        eaten(1, 120, MealType.LUNCH, 12),
        eaten(2, 50, MealType.LUNCH, 11),
        eaten(1, 200, MealType.DINNER, 10),
      ]);
      prisma.food.findMany.mockResolvedValue([food(1), food(2)]);

      const { recent } = await service.list(userId, {});

      expect(recent.map((r) => [r.id, r.lastGrams, r.timesEaten])).toEqual([
        [1, 120, 2],
        [2, 50, 1],
      ]);
    });

    it('com mealType, prioriza o que costuma ser comido naquela refeição', async () => {
      prisma.mealItem.findMany.mockResolvedValue([
        eaten(9, 100, MealType.DINNER, 12),
        eaten(3, 40, MealType.BREAKFAST, 11),
        eaten(3, 40, MealType.BREAKFAST, 10),
        eaten(4, 60, MealType.BREAKFAST, 9),
      ]);
      prisma.food.findMany.mockResolvedValue([food(3), food(4), food(9)]);

      const { recent } = await service.list(userId, { mealType: MealType.BREAKFAST });

      // O jantar de ontem, mais recente, vem depois do que é de café da manhã.
      expect(recent.map((r) => r.id)).toEqual([3, 4, 9]);
    });

    it('favoritos saem da lista de recentes, para não repetir o mesmo alimento', async () => {
      prisma.mealItem.findMany.mockResolvedValue([
        eaten(1, 120, MealType.LUNCH, 12),
        eaten(2, 50, MealType.LUNCH, 11),
      ]);
      prisma.favoriteFood.findMany.mockResolvedValue([{ food: food(1) }]);
      prisma.food.findMany.mockResolvedValue([food(2)]);

      const { favorites, recent } = await service.list(userId, {});

      expect(favorites.map((f) => [f.id, f.favorite, f.lastGrams])).toEqual([[1, true, 120]]);
      expect(recent.map((r) => [r.id, r.favorite])).toEqual([[2, false]]);
    });

    it('só devolve alimento visível ao usuário (custom alheio fica de fora)', async () => {
      prisma.mealItem.findMany.mockResolvedValue([eaten(7, 80, MealType.LUNCH, 12)]);

      await service.list(userId, {});

      expect(prisma.food.findMany.mock.calls[0][0].where).toEqual({
        id: { in: [7] },
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      });
    });

    it('respeita o limite de recentes', async () => {
      prisma.mealItem.findMany.mockResolvedValue(
        [1, 2, 3, 4].map((id) => eaten(id, 10, MealType.LUNCH, 12 - id)),
      );
      prisma.food.findMany.mockResolvedValue([1, 2, 3, 4].map((id) => food(id)));

      const { recent } = await service.list(userId, { limit: 2 });

      expect(recent.map((r) => r.id)).toEqual([1, 2]);
    });
  });

  describe('setFavorite', () => {
    it('marca um alimento visível, sem duplicar', async () => {
      foods.get.mockResolvedValue(food(5));

      await service.setFavorite(userId, 5, true);

      expect(foods.get).toHaveBeenCalledWith(userId, 5);
      expect(prisma.favoriteFood.upsert).toHaveBeenCalledWith({
        where: { userId_foodId: { userId, foodId: 5 } },
        create: { userId, foodId: 5 },
        update: {},
      });
    });

    it('alimento que o usuário não enxerga responde como inexistente', async () => {
      foods.get.mockRejectedValue(new NotFoundException('Food not found'));

      await expect(service.setFavorite(userId, 99, true)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.favoriteFood.upsert).not.toHaveBeenCalled();
    });

    it('desmarcar apaga só o favorito do próprio usuário e é idempotente', async () => {
      await service.setFavorite(userId, 5, false);

      expect(prisma.favoriteFood.deleteMany).toHaveBeenCalledWith({
        where: { userId, foodId: 5 },
      });
    });
  });
});
