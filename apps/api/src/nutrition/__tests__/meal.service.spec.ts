import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
      prisma.meal.findMany.mockResolvedValue([]);
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

    // Idempotência (issue #94): logar a mesma refeição 2× não deve duplicar em silêncio.
    describe('deduplicação por chave natural', () => {
      const lunchAtNoon = {
        mealType: MealType.LUNCH,
        eatenAt: '2026-01-15T12:00:00Z',
        items: [{ foodId: 1, grams: 100 }],
      };

      const existingMeal = (items: Array<Record<string, unknown>>) => ({
        id: 'meal-existente',
        userId,
        mealType: MealType.LUNCH,
        eatenAt: new Date('2026-01-15T12:00:00Z'),
        items,
      });

      it('rejeita com CONFLICT quando tipo, horário e itens são idênticos', async () => {
        prisma.food.findFirst.mockResolvedValue(makeFood());
        prisma.meal.findMany.mockResolvedValue([
          existingMeal([{ foodId: 1, foodName: 'Rice', grams: 100 }]),
        ]);

        await expect(service.create(userId, lunchAtNoon)).rejects.toThrow(ConflictException);
        expect(prisma.meal.create).not.toHaveBeenCalled();
      });

      it('cita o id da refeição existente para o cliente poder decidir', async () => {
        prisma.food.findFirst.mockResolvedValue(makeFood());
        prisma.meal.findMany.mockResolvedValue([
          existingMeal([{ foodId: 1, foodName: 'Rice', grams: 100 }]),
        ]);

        await expect(service.create(userId, lunchAtNoon)).rejects.toThrow(/meal-existente/);
      });

      it('escopa a busca de duplicata ao próprio usuário', async () => {
        prisma.food.findFirst.mockResolvedValue(makeFood());
        prisma.meal.findMany.mockResolvedValue([]);
        prisma.meal.create.mockResolvedValue({ id: 'meal-nova' });

        await service.create(userId, lunchAtNoon);

        expect(prisma.meal.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ userId, mealType: MealType.LUNCH }),
          }),
        );
      });

      it('permite quando as gramas diferem', async () => {
        prisma.food.findFirst.mockResolvedValue(makeFood());
        prisma.meal.findMany.mockResolvedValue([
          existingMeal([{ foodId: 1, foodName: 'Rice', grams: 250 }]),
        ]);
        prisma.meal.create.mockResolvedValue({ id: 'meal-nova' });

        await expect(service.create(userId, lunchAtNoon)).resolves.toBeDefined();
      });

      it('permite quando a refeição existente tem itens a mais', async () => {
        prisma.food.findFirst.mockResolvedValue(makeFood());
        prisma.meal.findMany.mockResolvedValue([
          existingMeal([
            { foodId: 1, foodName: 'Rice', grams: 100 },
            { foodId: 2, foodName: 'Beans', grams: 80 },
          ]),
        ]);
        prisma.meal.create.mockResolvedValue({ id: 'meal-nova' });

        await expect(service.create(userId, lunchAtNoon)).resolves.toBeDefined();
      });

      it('detecta duplicata mesmo com os itens em ordem diferente', async () => {
        prisma.food.findFirst
          .mockResolvedValueOnce(makeFood())
          .mockResolvedValueOnce(makeFood({ id: 2, name: 'Beans' }));
        prisma.meal.findMany.mockResolvedValue([
          existingMeal([
            { foodId: 2, foodName: 'Beans', grams: 80 },
            { foodId: 1, foodName: 'Rice', grams: 100 },
          ]),
        ]);

        await expect(
          service.create(userId, {
            mealType: MealType.LUNCH,
            eatenAt: '2026-01-15T12:00:00Z',
            items: [
              { foodId: 1, grams: 100 },
              { foodId: 2, grams: 80 },
            ],
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('ignora notes na chave natural — só a observação mudar não cria refeição nova', async () => {
        prisma.food.findFirst.mockResolvedValue(makeFood());
        prisma.meal.findMany.mockResolvedValue([
          existingMeal([{ foodId: 1, foodName: 'Rice', grams: 100 }]),
        ]);

        await expect(
          service.create(userId, { ...lunchAtNoon, notes: 'comi com pressa' }),
        ).rejects.toThrow(ConflictException);
      });

      it('permite itens livres com nomes diferentes no mesmo horário', async () => {
        prisma.meal.findMany.mockResolvedValue([
          existingMeal([{ foodId: null, foodName: 'Pão de queijo', grams: 80 }]),
        ]);
        prisma.meal.create.mockResolvedValue({ id: 'meal-nova' });

        await expect(
          service.create(userId, {
            mealType: MealType.LUNCH,
            eatenAt: '2026-01-15T12:00:00Z',
            items: [{ foodName: 'Coxinha', grams: 80, kcal: 300 }],
          }),
        ).resolves.toBeDefined();
      });

      it('trata item livre como duplicata ignorando caixa e espaços do nome', async () => {
        prisma.meal.findMany.mockResolvedValue([
          existingMeal([{ foodId: null, foodName: 'Pão de queijo', grams: 80 }]),
        ]);

        await expect(
          service.create(userId, {
            mealType: MealType.LUNCH,
            eatenAt: '2026-01-15T12:00:00Z',
            items: [{ foodName: '  PÃO DE QUEIJO ', grams: 80, kcal: 300 }],
          }),
        ).rejects.toThrow(ConflictException);
      });
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

      await service.list(userId, {}, 'UTC');

      expect(prisma.meal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId }) }),
      );
    });

    it('applies a UTC day window when date is provided', async () => {
      prisma.meal.findMany.mockResolvedValue([]);

      await service.list(userId, { date: '2026-01-15' }, 'UTC');

      const where = prisma.meal.findMany.mock.calls[0][0].where;
      expect(where.eatenAt.gte).toEqual(new Date('2026-01-15T00:00:00.000Z'));
      expect(where.eatenAt.lt).toEqual(new Date('2026-01-16T00:00:00.000Z'));
    });

    it('caps limit at 50', async () => {
      prisma.meal.findMany.mockResolvedValue([]);

      await service.list(userId, { limit: 9999 }, 'UTC');

      expect(prisma.meal.findMany.mock.calls[0][0].take).toBe(50);
    });

    it('forwards cursor pagination and skips the cursor row', async () => {
      prisma.meal.findMany.mockResolvedValue([]);

      await service.list(userId, { cursor: 'meal-50' }, 'UTC');

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
