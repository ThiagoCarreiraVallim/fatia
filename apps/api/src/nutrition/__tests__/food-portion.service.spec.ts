import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FoodPortionService } from '../food-portion.service';
import type { FoodService } from '../food.service';
import type { PrismaService } from '../../common/prisma.service';

const row = (id: string, label: string, grams: number, createdByUserId: string | null) => ({
  id,
  label,
  grams,
  createdByUserId,
});

describe('FoodPortionService', () => {
  const userId = 'user-A';
  let prisma: {
    foodPortion: {
      findMany: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let foods: { get: jest.Mock };
  let service: FoodPortionService;

  beforeEach(() => {
    prisma = {
      foodPortion: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    foods = { get: jest.fn().mockResolvedValue({ id: 3 }) };
    service = new FoodPortionService(
      prisma as unknown as PrismaService,
      foods as unknown as FoodService,
    );
  });

  describe('list', () => {
    it('devolve catálogo e as da pessoa, marcando quais são dela', async () => {
      prisma.foodPortion.findMany.mockResolvedValue([
        row('p1', 'colher de sopa', 25, null),
        row('p2', 'minha concha', 140, userId),
      ]);

      const portions = await service.list(userId, 3);

      expect(foods.get).toHaveBeenCalledWith(userId, 3);
      expect(prisma.foodPortion.findMany.mock.calls[0][0].where).toEqual({
        foodId: 3,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      });
      expect(portions).toEqual([
        { id: 'p1', label: 'colher de sopa', grams: 25, mine: false },
        { id: 'p2', label: 'minha concha', grams: 140, mine: true },
      ]);
    });

    it('alimento que a pessoa não enxerga responde 404 sem ler medidas', async () => {
      foods.get.mockRejectedValue(new NotFoundException('Food not found'));

      await expect(service.list(userId, 99)).rejects.toThrow(NotFoundException);
      expect(prisma.foodPortion.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('cria a medida com dono, rótulo aparado', async () => {
      prisma.foodPortion.create.mockResolvedValue(row('p9', 'minha concha', 140, userId));

      const portion = await service.create(userId, 3, { label: '  minha concha ', grams: 140 });

      expect(prisma.foodPortion.create).toHaveBeenCalledWith({
        data: { foodId: 3, label: 'minha concha', grams: 140, createdByUserId: userId },
        select: expect.any(Object),
      });
      expect(portion).toEqual({ id: 'p9', label: 'minha concha', grams: 140, mine: true });
    });

    it('não cria medida em alimento que a pessoa não enxerga', async () => {
      foods.get.mockRejectedValue(new NotFoundException('Food not found'));

      await expect(service.create(userId, 99, { label: 'x', grams: 10 })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.foodPortion.create).not.toHaveBeenCalled();
    });

    it('rótulo repetido no mesmo alimento vira 409, não 500', async () => {
      prisma.foodPortion.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );

      await expect(service.create(userId, 3, { label: 'concha', grams: 100 })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('apaga só a medida da própria pessoa', async () => {
      await service.remove(userId, 'p2');

      expect(prisma.foodPortion.deleteMany).toHaveBeenCalledWith({
        where: { id: 'p2', createdByUserId: userId },
      });
    });

    it('medida alheia ou do catálogo responde 404', async () => {
      prisma.foodPortion.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(userId, 'p1')).rejects.toThrow(NotFoundException);
    });
  });
});
