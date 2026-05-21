import { NutritionSummaryService } from '../nutrition-summary.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  meal: { findMany: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  meal: { findMany: jest.fn() },
});

const makeMeal = (
  isoDate: string,
  items: Array<{ kcal: number; proteinG: number; carbsG: number; fatG: number }>,
) => ({
  id: `meal-${isoDate}`,
  userId: 'user-A',
  eatenAt: new Date(`${isoDate}T12:00:00Z`),
  items,
});

describe('NutritionSummaryService', () => {
  let prisma: MockPrisma;
  let service: NutritionSummaryService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new NutritionSummaryService(prisma as unknown as PrismaService);
  });

  describe('getDay', () => {
    it('queries meals within the day window [00:00, next-day-00:00) in the given timezone', async () => {
      prisma.meal.findMany.mockResolvedValue([]);

      await service.getDay(userId, '2026-01-15', 'UTC');

      const where = prisma.meal.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe(userId);
      expect(where.eatenAt.gte).toEqual(new Date('2026-01-15T00:00:00.000Z'));
      expect(where.eatenAt.lt).toEqual(new Date('2026-01-16T00:00:00.000Z'));
    });

    it('returns aggregated macros, meal count, and the raw meals', async () => {
      prisma.meal.findMany.mockResolvedValue([
        makeMeal('2026-01-15', [
          { kcal: 500, proteinG: 30, carbsG: 60, fatG: 15 },
          { kcal: 200, proteinG: 10, carbsG: 25, fatG: 5 },
        ]),
        makeMeal('2026-01-15', [{ kcal: 300, proteinG: 20, carbsG: 40, fatG: 10 }]),
      ]);

      const result = await service.getDay(userId, '2026-01-15', 'UTC');

      expect(result.date).toBe('2026-01-15');
      expect(result.mealsCount).toBe(2);
      expect(result.totals).toEqual({ kcal: 1000, proteinG: 60, carbsG: 125, fatG: 30 });
    });

    it('returns zeroed totals when there are no meals for the day', async () => {
      prisma.meal.findMany.mockResolvedValue([]);

      const result = await service.getDay(userId, '2026-01-15', 'UTC');

      expect(result.totals).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
      expect(result.mealsCount).toBe(0);
    });
  });

  describe('getHistory', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-15T10:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns a series of N days even when there are no meals (zero-fill)', async () => {
      prisma.meal.findMany.mockResolvedValue([]);

      const result = await service.getHistory(userId, 7, 'UTC');

      expect(result.days).toBe(7);
      expect(result.series).toHaveLength(7);
      expect(result.series.every((d) => d.kcal === 0 && d.meals === 0)).toBe(true);
      expect(result.series[0].date).toBe('2026-01-09');
      expect(result.series[6].date).toBe('2026-01-15');
    });

    it('aggregates macros per day and counts meals correctly', async () => {
      prisma.meal.findMany.mockResolvedValue([
        makeMeal('2026-01-13', [{ kcal: 500, proteinG: 30, carbsG: 60, fatG: 15 }]),
        makeMeal('2026-01-13', [{ kcal: 200, proteinG: 10, carbsG: 25, fatG: 5 }]),
        makeMeal('2026-01-15', [{ kcal: 800, proteinG: 50, carbsG: 100, fatG: 20 }]),
      ]);

      const result = await service.getHistory(userId, 7, 'UTC');

      const jan13 = result.series.find((d) => d.date === '2026-01-13');
      const jan15 = result.series.find((d) => d.date === '2026-01-15');
      expect(jan13).toMatchObject({ kcal: 700, proteinG: 40, carbsG: 85, fatG: 20, meals: 2 });
      expect(jan15).toMatchObject({ kcal: 800, meals: 1 });
    });

    it('computes daily averages over the full N-day window (including zero days)', async () => {
      prisma.meal.findMany.mockResolvedValue([
        makeMeal('2026-01-13', [{ kcal: 1400, proteinG: 70, carbsG: 175, fatG: 50 }]),
      ]);

      const result = await service.getHistory(userId, 7, 'UTC');

      expect(result.averages.kcal).toBeCloseTo(200);
      expect(result.averages.proteinG).toBeCloseTo(10);
    });

    it('ignores meals that fall outside the window', async () => {
      prisma.meal.findMany.mockResolvedValue([
        makeMeal('2025-12-01', [{ kcal: 9999, proteinG: 0, carbsG: 0, fatG: 0 }]),
      ]);

      const result = await service.getHistory(userId, 7, 'UTC');

      expect(result.series.every((d) => d.kcal === 0)).toBe(true);
    });
  });
});
