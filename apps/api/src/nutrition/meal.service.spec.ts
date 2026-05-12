import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MealType } from '@prisma/client';
import { MealService } from './meal.service';
import type { PrismaService } from '../common/prisma.service';

type MockPrisma = {
  food: { findFirst: jest.Mock };
  meal: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  food: { findFirst: jest.fn() },
  meal: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
});

describe('MealService.resolveItems', () => {
  let prisma: MockPrisma;
  let service: MealService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new MealService(prisma as unknown as PrismaService);
  });

  it('calcula macros via regra de 3 quando tem foodId', async () => {
    prisma.food.findFirst.mockResolvedValue({
      id: 1,
      name: 'Arroz',
      groupId: 5,
      kcalPer100g: 130,
      proteinPer100g: 2.5,
      carbsPer100g: 28,
      fatPer100g: 0.2,
    });
    const result = await service.resolveItems(userId, [{ foodId: 1, grams: 150 }]);
    expect(result).toEqual([
      {
        foodId: 1,
        foodName: 'Arroz',
        groupId: 5,
        grams: 150,
        kcal: 195,
        proteinG: 3.75,
        carbsG: 42,
        fatG: 0.3,
      },
    ]);
  });

  it('respeita foodName custom mesmo com foodId (snapshot)', async () => {
    prisma.food.findFirst.mockResolvedValue({
      id: 1,
      name: 'Arroz',
      groupId: 5,
      kcalPer100g: 130,
      proteinPer100g: 2.5,
      carbsPer100g: 28,
      fatPer100g: 0.2,
    });
    const [item] = await service.resolveItems(userId, [
      { foodId: 1, foodName: 'Arroz da vó', grams: 100 },
    ]);
    expect(item.foodName).toBe('Arroz da vó');
    expect(item.foodId).toBe(1);
  });

  it('item livre: usa macros explícitos sem chamar food.findFirst', async () => {
    const [item] = await service.resolveItems(userId, [
      {
        foodName: 'Pão de queijo estimado',
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
      foodName: 'Pão de queijo estimado',
      grams: 80,
      kcal: 280,
    });
  });

  it('item livre sem foodName lança ForbiddenException', async () => {
    await expect(service.resolveItems(userId, [{ grams: 50 }])).rejects.toThrow(ForbiddenException);
  });

  it('foodId inexistente lança NotFoundException', async () => {
    prisma.food.findFirst.mockResolvedValue(null);
    await expect(service.resolveItems(userId, [{ foodId: 999, grams: 100 }])).rejects.toThrow(
      NotFoundException,
    );
  });

  it('isolamento: filtra Food por userId (TACO público + custom do user)', async () => {
    prisma.food.findFirst.mockResolvedValue({
      id: 1,
      name: 'X',
      groupId: null,
      kcalPer100g: 0,
      proteinPer100g: 0,
      carbsPer100g: 0,
      fatPer100g: 0,
    });
    await service.resolveItems(userId, [{ foodId: 1, grams: 100 }]);
    expect(prisma.food.findFirst).toHaveBeenCalledWith({
      where: { id: 1, OR: [{ createdByUserId: null }, { createdByUserId: userId }] },
    });
  });
});

describe('MealService.assertOwner (via update/delete)', () => {
  let prisma: MockPrisma;
  let service: MealService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new MealService(prisma as unknown as PrismaService);
  });

  it('user A não pode editar refeição de user B', async () => {
    prisma.meal.findUnique.mockResolvedValue({ userId: 'user-B' });
    await expect(service.update('user-A', 'meal-1', { mealType: MealType.LUNCH })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refeição inexistente lança NotFoundException', async () => {
    prisma.meal.findUnique.mockResolvedValue(null);
    await expect(service.delete('user-A', 'meal-x')).rejects.toThrow(NotFoundException);
  });
});

describe('MealService.findById', () => {
  it('filtra por userId no SELECT (isolamento)', async () => {
    const prisma = makePrisma();
    prisma.meal.findFirst.mockResolvedValue(null);
    const service = new MealService(prisma as unknown as PrismaService);
    await expect(service.findById('user-A', 'meal-x')).rejects.toThrow(NotFoundException);
    expect(prisma.meal.findFirst).toHaveBeenCalledWith({
      where: { id: 'meal-x', userId: 'user-A' },
      include: { items: true },
    });
  });
});

describe('MealService.list', () => {
  it('list does not return meals from other users', async () => {
    const prisma = makePrisma();
    prisma.meal.findMany.mockResolvedValue([]);
    const service = new MealService(prisma as unknown as PrismaService);
    await service.list('user-A', {});
    expect(prisma.meal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-A' }) }),
    );
  });
});
