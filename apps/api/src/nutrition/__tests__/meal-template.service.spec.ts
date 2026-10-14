import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MealType, Prisma } from '@prisma/client';
import { MealTemplateService } from '../meal-template.service';
import { MealService } from '../meal.service';
import { MAX_TEMPLATES_PER_USER } from '../dto/meal-template.dto';
import type { PrismaService } from '../../common/prisma.service';

const userId = 'user-A';

const mealItem = (extra: Record<string, unknown> = {}) => ({
  id: 'i1',
  mealId: 'm1',
  foodId: 7,
  groupId: 2,
  foodName: 'Arroz, tipo 1, cozido',
  grams: 50,
  kcal: 64,
  proteinG: 1.3,
  carbsG: 14,
  fatG: 0.1,
  nutrients: null,
  portionLabel: 'colher de sopa',
  portionQuantity: 2,
  ...extra,
});

const template = (extra: Record<string, unknown> = {}) => ({
  id: 't1',
  userId,
  name: 'Café de sempre',
  mealType: MealType.BREAKFAST,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [{ ...mealItem(), id: 'ti1', templateId: 't1', position: 0 }],
  ...extra,
});

describe('MealTemplateService', () => {
  let prisma: {
    food: { findFirst: jest.Mock };
    foodPortion: { findFirst: jest.Mock };
    meal: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    mealTemplate: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let service: MealTemplateService;

  beforeEach(() => {
    prisma = {
      food: { findFirst: jest.fn() },
      foodPortion: { findFirst: jest.fn() },
      meal: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'nova', ...data })),
      },
      mealTemplate: {
        findFirst: jest.fn().mockResolvedValue(template()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 't9', ...data })),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const meals = new MealService(prisma as unknown as PrismaService);
    service = new MealTemplateService(prisma as unknown as PrismaService, meals);
  });

  describe('create', () => {
    it('de uma refeição dela: nome aparado, tipo da refeição, itens na ordem', async () => {
      prisma.meal.findFirst.mockResolvedValue({
        id: 'm1',
        userId,
        mealType: MealType.LUNCH,
        eatenAt: new Date(),
        notes: null,
        items: [mealItem(), mealItem({ id: 'i2', foodId: null, foodName: 'Suco', grams: 200 })],
      });

      await service.create(userId, { name: '  Almoço da firma ', mealId: 'm1' });

      expect(prisma.meal.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm1', userId } }),
      );
      const { data } = prisma.mealTemplate.create.mock.calls[0][0];
      expect(data).toMatchObject({ userId, name: 'Almoço da firma', mealType: MealType.LUNCH });
      expect(data.items.create).toEqual([
        expect.objectContaining({
          position: 0,
          foodId: 7,
          portionLabel: 'colher de sopa',
          portionQuantity: 2,
        }),
        expect.objectContaining({ position: 1, foodId: null, foodName: 'Suco', grams: 200 }),
      ]);
    });

    it('de itens soltos (o caminho do MCP): resolve como no registro', async () => {
      prisma.food.findFirst.mockResolvedValue({
        id: 7,
        name: 'Arroz',
        groupId: 2,
        kcalPer100g: 128,
        proteinPer100g: 2.5,
        carbsPer100g: 28,
        fatPer100g: 0.2,
        nutrients: null,
      });

      await service.create(userId, {
        name: 'Arroz',
        items: [{ foodId: 7, grams: 100 }],
      });

      const { data } = prisma.mealTemplate.create.mock.calls[0][0];
      expect(data.mealType).toBeNull();
      expect(data.items.create[0]).toMatchObject({ position: 0, foodId: 7, grams: 100, kcal: 128 });
    });

    it('refeição alheia: 404, nada gravado', async () => {
      prisma.meal.findFirst.mockResolvedValue(null);
      await expect(service.create(userId, { name: 'x', mealId: 'm9' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.mealTemplate.create).not.toHaveBeenCalled();
    });

    it('refeição e itens juntos, ou nenhum dos dois: 400', async () => {
      await expect(
        service.create(userId, { name: 'x', mealId: 'm1', items: [{ foodId: 7, grams: 1 }] }),
      ).rejects.toThrow(BadRequestException);
      await expect(service.create(userId, { name: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('nome em branco: 400', async () => {
      await expect(service.create(userId, { name: '   ', mealId: 'm1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('nome repetido: 409, não 500', async () => {
      prisma.meal.findFirst.mockResolvedValue({ id: 'm1', mealType: 'LUNCH', items: [mealItem()] });
      prisma.mealTemplate.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.create(userId, { name: 'Café', mealId: 'm1' })).rejects.toThrow(
        ConflictException,
      );
    });

    it(`passou de ${MAX_TEMPLATES_PER_USER} refeições salvas: 400`, async () => {
      prisma.mealTemplate.count.mockResolvedValue(MAX_TEMPLATES_PER_USER);
      await expect(service.create(userId, { name: 'x', mealId: 'm1' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.mealTemplate.count).toHaveBeenCalledWith({ where: { userId } });
    });

    it('refeição vazia: 400', async () => {
      prisma.meal.findFirst.mockResolvedValue({ id: 'm1', mealType: 'LUNCH', items: [] });
      await expect(service.create(userId, { name: 'x', mealId: 'm1' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('get e remove', () => {
    it('get filtra pela dona', async () => {
      await service.get(userId, 't1');
      expect(prisma.mealTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1', userId } }),
      );
    });

    it('get de modelo alheio: 404', async () => {
      prisma.mealTemplate.findFirst.mockResolvedValue(null);
      await expect(service.get(userId, 't9')).rejects.toThrow(NotFoundException);
    });

    it('remove só apaga o da própria pessoa; alheio responde 404', async () => {
      await service.remove(userId, 't1');
      expect(prisma.mealTemplate.deleteMany).toHaveBeenCalledWith({ where: { id: 't1', userId } });

      prisma.mealTemplate.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove(userId, 't9')).rejects.toThrow(NotFoundException);
    });
  });

  describe('log', () => {
    it('registra o retrato na hora pedida, com o tipo do modelo', async () => {
      await service.log(userId, 't1', { eatenAt: '2026-10-14T10:00:00Z' });

      const { data } = prisma.meal.create.mock.calls[0][0];
      expect(data).toMatchObject({
        userId,
        mealType: MealType.BREAKFAST,
        eatenAt: new Date('2026-10-14T10:00:00Z'),
      });
      expect(data.items.create).toEqual([
        expect.objectContaining({ foodId: 7, grams: 50, kcal: 64, portionQuantity: 2 }),
      ]);
      expect(data.items.create[0]).not.toHaveProperty('position');
      expect(data.items.create[0]).not.toHaveProperty('templateId');
    });

    it('tipo pedido vence o do modelo; modelo sem tipo vira lanche', async () => {
      await service.log(userId, 't1', { eatenAt: '2026-10-14T10:00:00Z', mealType: 'DINNER' });
      expect(prisma.meal.create.mock.calls[0][0].data.mealType).toBe('DINNER');

      prisma.mealTemplate.findFirst.mockResolvedValue(template({ mealType: null }));
      await service.log(userId, 't1', { eatenAt: '2026-10-15T10:00:00Z' });
      expect(prisma.meal.create.mock.calls[1][0].data.mealType).toBe('SNACK');
    });

    it('modelo alheio: 404, nenhuma refeição', async () => {
      prisma.mealTemplate.findFirst.mockResolvedValue(null);
      await expect(service.log(userId, 't9', { eatenAt: '2026-10-14T10:00:00Z' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.meal.create).not.toHaveBeenCalled();
    });
  });
});
