import { NotFoundException } from '@nestjs/common';
import { NutrientTargetService } from '../nutrient-target.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  nutrientTarget: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
  };
  mealItem: { findMany: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  nutrientTarget: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  mealItem: { findMany: jest.fn() },
});

describe('NutrientTargetService', () => {
  let prisma: MockPrisma;
  let service: NutrientTargetService;
  const userId = 'user-A';
  const tz = 'America/Sao_Paulo';

  beforeEach(() => {
    prisma = makePrisma();
    service = new NutrientTargetService(prisma as unknown as PrismaService);
  });

  describe('upsert', () => {
    it('upserts by (userId, nutrientKey) with min/max defaulted to null', async () => {
      prisma.nutrientTarget.upsert.mockResolvedValue({});

      await service.upsert(userId, {
        nutrientKey: 'sodium_mg',
        label: 'Sódio',
        unit: 'mg',
        max: 2000,
      });

      const arg = prisma.nutrientTarget.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ userId_nutrientKey: { userId, nutrientKey: 'sodium_mg' } });
      expect(arg.create).toMatchObject({
        userId,
        nutrientKey: 'sodium_mg',
        max: 2000,
        min: null,
        period: 'daily',
      });
      expect(arg.update).toMatchObject({ max: 2000, min: null });
    });
  });

  describe('delete', () => {
    it('throws NotFound when the target does not exist', async () => {
      prisma.nutrientTarget.findUnique.mockResolvedValue(null);
      await expect(service.delete(userId, 'sodium_mg')).rejects.toThrow(NotFoundException);
      expect(prisma.nutrientTarget.delete).not.toHaveBeenCalled();
    });

    it('deletes when it exists', async () => {
      prisma.nutrientTarget.findUnique.mockResolvedValue({ id: 't1' });
      prisma.nutrientTarget.delete.mockResolvedValue({});
      await expect(service.delete(userId, 'sodium_mg')).resolves.toEqual({ deleted: true });
    });
  });

  describe('getNutrientSummary', () => {
    it('sums item nutrients for the day and classifies vs min/max', async () => {
      prisma.nutrientTarget.findMany.mockResolvedValue([
        { nutrientKey: 'sodium_mg', label: 'Sódio', unit: 'mg', min: null, max: 2000 },
        { nutrientKey: 'fiber_g', label: 'Fibra', unit: 'g', min: 25, max: null },
        { nutrientKey: 'sugar_g', label: 'Açúcar', unit: 'g', min: null, max: 50 },
      ]);
      prisma.mealItem.findMany.mockResolvedValue([
        { nutrients: { sodium_mg: 1500, fiber_g: 10, sugar_g: 20 } },
        { nutrients: { sodium_mg: 900, fiber_g: 5 } },
        { nutrients: null }, // ignorado
        { nutrients: { sodium_mg: 'x' } }, // valor inválido ignorado
      ]);

      const { nutrients } = await service.getNutrientSummary(userId, '2026-05-30', tz);

      const sodium = nutrients.find((n) => n.nutrientKey === 'sodium_mg')!;
      expect(sodium.total).toBe(2400);
      expect(sodium.status).toBe('over'); // > max 2000

      const fiber = nutrients.find((n) => n.nutrientKey === 'fiber_g')!;
      expect(fiber.total).toBe(15);
      expect(fiber.status).toBe('under'); // < min 25

      const sugar = nutrients.find((n) => n.nutrientKey === 'sugar_g')!;
      expect(sugar.total).toBe(20);
      expect(sugar.status).toBe('ok'); // <= max 50
    });

    it('scopes the meal-item query to the user (isolation)', async () => {
      prisma.nutrientTarget.findMany.mockResolvedValue([]);
      prisma.mealItem.findMany.mockResolvedValue([]);

      await service.getNutrientSummary(userId, '2026-05-30', tz);

      const where = prisma.mealItem.findMany.mock.calls[0][0].where;
      expect(where.meal.userId).toBe(userId);
    });
  });
});
