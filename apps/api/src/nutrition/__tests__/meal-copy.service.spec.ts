import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MealType } from '@prisma/client';
import { MealCopyService } from '../meal-copy.service';
import { MealService } from '../meal.service';
import type { PrismaService } from '../../common/prisma.service';

const SP = 'America/Sao_Paulo';
const userId = 'user-A';

const item = (extra: Record<string, unknown> = {}) => ({
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
  nutrients: { sodium_mg: 1 },
  portionLabel: 'colher de sopa',
  portionQuantity: 2,
  ...extra,
});

const meal = (extra: Record<string, unknown> = {}) => ({
  id: 'm1',
  userId,
  mealType: MealType.LUNCH,
  // 12:30 em São Paulo.
  eatenAt: new Date('2026-10-13T15:30:00Z'),
  notes: 'no trabalho',
  createdAt: new Date(),
  items: [item()],
  ...extra,
});

describe('MealCopyService', () => {
  let prisma: {
    meal: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
  };
  let service: MealCopyService;

  beforeEach(() => {
    prisma = {
      meal: {
        findFirst: jest.fn().mockResolvedValue(meal()),
        // `findMany` serve à guarda de duplicata (vazio = sem duplicata) e à leitura do dia.
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'novo', ...data })),
      },
    };
    const meals = new MealService(prisma as unknown as PrismaService);
    service = new MealCopyService(prisma as unknown as PrismaService, meals);
  });

  describe('dias que não existem', () => {
    it('copiar para 31/02 é 400, e não 3 de março em silêncio', async () => {
      await expect(service.copyMeal(userId, 'm1', { toDate: '2026-02-31' }, SP)).rejects.toThrow(
        /toDate não é um dia válido/,
      );
      await expect(service.copyDay(userId, '2026-02-30', '2026-03-01', SP)).rejects.toThrow(
        /fromDate não é um dia válido/,
      );
      expect(prisma.meal.create).not.toHaveBeenCalled();
    });
  });

  describe('copyMeal', () => {
    it('grava no dia pedido, no mesmo horário local, com o retrato dos itens', async () => {
      await service.copyMeal(userId, 'm1', { toDate: '2026-10-14' }, SP);

      expect(prisma.meal.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm1', userId } }),
      );
      const { data } = prisma.meal.create.mock.calls[0][0];
      expect(data).toMatchObject({
        userId,
        mealType: MealType.LUNCH,
        eatenAt: new Date('2026-10-14T15:30:00Z'),
        notes: 'no trabalho',
      });
      expect(data.items.create).toEqual([
        {
          foodId: 7,
          groupId: 2,
          foodName: 'Arroz, tipo 1, cozido',
          grams: 50,
          kcal: 64,
          proteinG: 1.3,
          carbsG: 14,
          fatG: 0.1,
          nutrients: { sodium_mg: 1 },
          portionLabel: 'colher de sopa',
          portionQuantity: 2,
        },
      ]);
    });

    it('pode trocar o tipo na cópia', async () => {
      await service.copyMeal(userId, 'm1', { toDate: '2026-10-14', mealType: MealType.DINNER }, SP);
      expect(prisma.meal.create.mock.calls[0][0].data.mealType).toBe(MealType.DINNER);
    });

    it('item em gramas não ganha retrato de medida', async () => {
      prisma.meal.findFirst.mockResolvedValue(
        meal({ items: [item({ portionLabel: null, portionQuantity: null, nutrients: null })] }),
      );
      await service.copyMeal(userId, 'm1', { toDate: '2026-10-14' }, SP);
      const [copiado] = prisma.meal.create.mock.calls[0][0].data.items.create;
      expect(copiado).not.toHaveProperty('portionLabel');
      expect(copiado).not.toHaveProperty('nutrients');
    });

    it('refeição alheia ou inexistente: 404', async () => {
      prisma.meal.findFirst.mockResolvedValue(null);
      await expect(service.copyMeal(userId, 'x', { toDate: '2026-10-14' }, SP)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.meal.create).not.toHaveBeenCalled();
    });

    it('para o mesmo dia e mesmo tipo: 400, já está lá', async () => {
      await expect(service.copyMeal(userId, 'm1', { toDate: '2026-10-13' }, SP)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('copiar de novo para o mesmo dia não duplica: 409', async () => {
      prisma.meal.findMany.mockResolvedValue([
        meal({ id: 'copia', eatenAt: new Date('2026-10-14T15:30:00Z') }),
      ]);
      await expect(service.copyMeal(userId, 'm1', { toDate: '2026-10-14' }, SP)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.meal.create).not.toHaveBeenCalled();
    });

    it('refeição sem itens não tem o que copiar: 400', async () => {
      prisma.meal.findFirst.mockResolvedValue(meal({ items: [] }));
      await expect(service.copyMeal(userId, 'm1', { toDate: '2026-10-14' }, SP)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('copyDay', () => {
    const cafe = meal({
      id: 'c',
      mealType: MealType.BREAKFAST,
      eatenAt: new Date('2026-10-13T10:00:00Z'),
      items: [item({ foodName: 'Pão', foodId: 9 })],
    });
    const almoco = meal({ id: 'a' });

    it('lê só as refeições da pessoa naquele dia, no fuso dela', async () => {
      prisma.meal.findMany.mockResolvedValueOnce([cafe, almoco]);
      await service.copyDay(userId, '2026-10-13', '2026-10-14', SP);

      expect(prisma.meal.findMany.mock.calls[0][0].where).toEqual({
        userId,
        eatenAt: {
          gte: new Date('2026-10-13T03:00:00Z'),
          lt: new Date('2026-10-14T03:00:00Z'),
        },
      });
    });

    it('copia todas para o dia de destino', async () => {
      prisma.meal.findMany.mockResolvedValueOnce([cafe, almoco]);
      const result = await service.copyDay(userId, '2026-10-13', '2026-10-14', SP);

      expect(result.skipped).toBe(0);
      expect(result.created).toHaveLength(2);
      expect(prisma.meal.create.mock.calls.map((c) => c[0].data.eatenAt)).toEqual([
        new Date('2026-10-14T10:00:00Z'),
        new Date('2026-10-14T15:30:00Z'),
      ]);
    });

    it('pula o que já está no destino, sem falhar o resto', async () => {
      prisma.meal.findMany
        .mockResolvedValueOnce([cafe, almoco])
        // duplicata do café no destino
        .mockResolvedValueOnce([cafe])
        .mockResolvedValueOnce([]);
      const result = await service.copyDay(userId, '2026-10-13', '2026-10-14', SP);

      expect(result).toMatchObject({ skipped: 1 });
      expect(result.created).toHaveLength(1);
      expect(prisma.meal.create).toHaveBeenCalledTimes(1);
    });

    it('refeição vazia fica para trás', async () => {
      prisma.meal.findMany.mockResolvedValueOnce([meal({ items: [] }), almoco]);
      const result = await service.copyDay(userId, '2026-10-13', '2026-10-14', SP);
      expect(result.created).toHaveLength(1);
    });

    it('dia sem refeições: 404', async () => {
      prisma.meal.findMany.mockResolvedValueOnce([]);
      await expect(service.copyDay(userId, '2026-10-13', '2026-10-14', SP)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('de um dia para ele mesmo: 400', async () => {
      await expect(service.copyDay(userId, '2026-10-13', '2026-10-13', SP)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
