import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FoodSource, Prisma } from '@prisma/client';
import { FoodService } from '../food.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  food: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  foodGroup: { findMany: jest.Mock; findUnique: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  food: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  foodGroup: { findMany: jest.fn(), findUnique: jest.fn().mockResolvedValue({ id: 9 }) },
});

const makeFood = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  name: 'Rice',
  groupId: 5,
  source: FoodSource.TACO,
  createdByUserId: null,
  kcalPer100g: 130,
  proteinPer100g: 2.5,
  carbsPer100g: 28,
  fatPer100g: 0.2,
  ...overrides,
});

const p2002 = new Prisma.PrismaClientKnownRequestError('dup', {
  code: 'P2002',
  clientVersion: 'x',
});

describe('FoodService', () => {
  let prisma: MockPrisma;
  let service: FoodService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new FoodService(prisma as unknown as PrismaService);
  });

  describe('search', () => {
    it('always combines public (createdByUserId=null) with user-owned foods', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search(userId, {});

      const where = prisma.food.findMany.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      });
    });

    it('busca sobre searchName normalizado, não sobre o nome cru', async () => {
      // Antes era `name: { contains, mode: insensitive }`, e quem digitava
      // "feijao" não achava "Feijão". Ver common/search-text.ts.
      prisma.food.findMany.mockResolvedValue([]);

      await service.search(userId, { q: 'Feijão' });

      const where = prisma.food.findMany.mock.calls[0][0].where;
      expect(where.AND[1]).toEqual({ searchName: { contains: 'feijao' } });
    });

    it('não corta no banco quando há termo — o corte é depois do ranqueamento', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search(userId, { q: 'arroz', limit: 5 });

      expect(prisma.food.findMany.mock.calls[0][0].take).toBeUndefined();
    });

    it('ordena por relevância: prefixo antes de contido', async () => {
      prisma.food.findMany.mockResolvedValue([
        { id: 1, name: 'Baião de dois, arroz e feijão-de-corda' },
        { id: 2, name: 'Arroz, tipo 1, cozido' },
      ]);

      const result = await service.search(userId, { q: 'arroz' });

      expect(result.map((f: { name: string }) => f.name)).toEqual([
        'Arroz, tipo 1, cozido',
        'Baião de dois, arroz e feijão-de-corda',
      ]);
    });

    it('adds a groupId filter when provided', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search(userId, { groupId: 5 });

      const where = prisma.food.findMany.mock.calls[0][0].where;
      expect(where.AND[2]).toEqual({ groupId: 5 });
    });

    it('traz as medidas visíveis de cada alimento, marcando as da pessoa', async () => {
      prisma.food.findMany.mockResolvedValue([
        makeFood({
          portions: [
            { id: 'p1', label: 'colher de sopa', grams: 25, createdByUserId: null },
            { id: 'p2', label: 'minha concha', grams: 140, createdByUserId: userId },
          ],
        }),
      ]);

      const [food] = await service.search(userId, {});

      expect(prisma.food.findMany.mock.calls[0][0].include.portions.where).toEqual({
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      });
      expect(food.portions).toEqual([
        { id: 'p1', label: 'colher de sopa', grams: 25, mine: false },
        { id: 'p2', label: 'minha concha', grams: 140, mine: true },
      ]);
      expect(food).not.toHaveProperty('portions.0.createdByUserId');
    });

    it('caps limit at 50 (default 20)', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await service.search(userId, { limit: 9999 });
      expect(prisma.food.findMany.mock.calls[0][0].take).toBe(50);

      await service.search(userId, {});
      expect(prisma.food.findMany.mock.calls[1][0].take).toBe(20);
    });
  });

  describe('get', () => {
    it('returns the food when accessible', async () => {
      prisma.food.findFirst.mockResolvedValue(makeFood());

      const result = await service.get(userId, 1);

      expect(result.id).toBe(1);
    });

    it('traz as medidas visíveis do alimento', async () => {
      prisma.food.findFirst.mockResolvedValue(
        makeFood({
          portions: [{ id: 'p1', label: 'escumadeira', grams: 90, createdByUserId: null }],
        }),
      );

      const result = await service.get(userId, 1);

      expect(prisma.food.findFirst.mock.calls[0][0].include.portions.where).toEqual({
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      });
      expect(result.portions).toEqual([{ id: 'p1', label: 'escumadeira', grams: 90, mine: false }]);
    });

    it('throws NotFoundException when no row matches the ownership filter', async () => {
      prisma.food.findFirst.mockResolvedValue(null);

      await expect(service.get(userId, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCustom', () => {
    it('tags the new food as CUSTOM and owned by the user', async () => {
      prisma.food.create.mockResolvedValue(makeFood({ source: FoodSource.CUSTOM }));

      await service.createCustom(userId, {
        name: 'Grandma cake',
        groupId: 9,
        kcalPer100g: 320,
        proteinPer100g: 5,
        carbsPer100g: 50,
        fatPer100g: 12,
      });

      expect(prisma.food.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Grandma cake',
            source: FoodSource.CUSTOM,
            createdByUserId: userId,
          }),
        }),
      );
    });

    it('cria junto as medidas do rótulo, como da própria pessoa', async () => {
      prisma.food.create.mockResolvedValue(
        makeFood({
          source: FoodSource.CUSTOM,
          createdByUserId: userId,
          portions: [{ id: 'p1', label: '1 barra (30 g)', grams: 30, createdByUserId: userId }],
        }),
      );

      const food = await service.createCustom(userId, {
        name: 'Barra de cereal',
        kcalPer100g: 380,
        proteinPer100g: 6,
        carbsPer100g: 70,
        fatPer100g: 8,
        portions: [{ label: ' 1 barra (30 g) ', grams: 30 }],
      });

      expect(prisma.food.create.mock.calls[0][0].data.portions).toEqual({
        create: [{ label: '1 barra (30 g)', grams: 30, createdByUserId: userId }],
      });
      expect(food.portions).toEqual([{ id: 'p1', label: '1 barra (30 g)', grams: 30, mine: true }]);
    });
  });

  describe('createCustom: validação', () => {
    const valido = {
      name: 'Granola da casa',
      kcalPer100g: 450,
      proteinPer100g: 10,
      carbsPer100g: 60,
      fatPer100g: 18,
    };

    beforeEach(() => {
      prisma.food.create.mockResolvedValue(makeFood({ source: FoodSource.CUSTOM }));
    });

    it('apara o nome antes de gravar e de normalizar', async () => {
      await service.createCustom(userId, { ...valido, name: '  Granola da casa ' });

      expect(prisma.food.create.mock.calls[0][0].data).toMatchObject({
        name: 'Granola da casa',
        searchName: 'granola da casa',
      });
    });

    it('nome em branco: 400', async () => {
      await expect(service.createCustom(userId, { ...valido, name: '   ' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.food.create).not.toHaveBeenCalled();
    });

    it.each([
      ['kcal acima de 900', { kcalPer100g: 901 }],
      ['proteína acima de 100 g', { proteinPer100g: 101, carbsPer100g: 0, fatPer100g: 0 }],
      ['carboidrato acima de 100 g', { carbsPer100g: 100.5, proteinPer100g: 0, fatPer100g: 0 }],
      ['gordura acima de 100 g', { fatPer100g: 120, proteinPer100g: 0, carbsPer100g: 0 }],
      ['macros somando mais de 100 g', { proteinPer100g: 40, carbsPer100g: 50, fatPer100g: 20 }],
    ])('%s: 400', async (_caso, valores) => {
      await expect(service.createCustom(userId, { ...valido, ...valores })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.food.create).not.toHaveBeenCalled();
    });

    it('óleo puro (100 g de gordura, 900 kcal) passa', async () => {
      await service.createCustom(userId, {
        name: 'Óleo',
        kcalPer100g: 900,
        proteinPer100g: 0,
        carbsPer100g: 0,
        fatPer100g: 100,
      });
      expect(prisma.food.create).toHaveBeenCalled();
    });

    it('grupo inexistente: 400, não erro de chave estrangeira', async () => {
      prisma.foodGroup.findUnique.mockResolvedValue(null);

      await expect(service.createCustom(userId, { ...valido, groupId: 999 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.food.create).not.toHaveBeenCalled();
    });

    it('nome repetido: 409 com o nome, não 500', async () => {
      prisma.food.create.mockRejectedValue(p2002);

      await expect(service.createCustom(userId, valido)).rejects.toThrow(
        new ConflictException('Você já tem um alimento chamado "Granola da casa".'),
      );
    });
  });

  describe('listCustom', () => {
    it('só os alimentos próprios da pessoa, em ordem de nome, com as medidas', async () => {
      prisma.food.findMany.mockResolvedValue([
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: userId, portions: [] }),
      ]);

      const foods = await service.listCustom(userId);

      const args = prisma.food.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ source: FoodSource.CUSTOM, createdByUserId: userId });
      expect(args.orderBy).toEqual({ name: 'asc' });
      expect(foods[0].portions).toEqual([]);
    });
  });

  describe('updateCustom', () => {
    it('updates a CUSTOM food the user owns', async () => {
      prisma.food.findUnique.mockResolvedValue(
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: userId }),
      );
      prisma.food.update.mockResolvedValue(makeFood({ name: 'Renamed' }));

      await service.updateCustom(userId, 1, { name: 'Renamed' });

      expect(prisma.food.update).toHaveBeenCalledWith({
        where: { id: 1 },
        // `searchName` acompanha o nome, senão a busca continua achando o
        // alimento pelo nome antigo.
        data: { name: 'Renamed', searchName: 'renamed' },
        include: expect.anything(),
      });
    });

    it('devolve o alimento com as medidas, no mesmo formato da criação', async () => {
      prisma.food.findUnique.mockResolvedValue(
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: userId }),
      );
      prisma.food.update.mockResolvedValue(
        makeFood({
          source: FoodSource.CUSTOM,
          createdByUserId: userId,
          portions: [{ id: 'p1', label: 'porção', grams: 40, createdByUserId: userId }],
        }),
      );

      const food = await service.updateCustom(userId, 1, { kcalPer100g: 200 });

      expect(food.portions).toEqual([{ id: 'p1', label: 'porção', grams: 40, mine: true }]);
    });

    it('nome repetido: 409, não 500', async () => {
      prisma.food.findUnique.mockResolvedValue(
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: userId }),
      );
      prisma.food.update.mockRejectedValue(p2002);

      await expect(service.updateCustom(userId, 1, { name: 'Granola' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('nome em branco: 400', async () => {
      prisma.food.findUnique.mockResolvedValue(
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: userId }),
      );

      await expect(service.updateCustom(userId, 1, { name: '   ' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.food.update).not.toHaveBeenCalled();
    });

    it('confere a soma dos macros com os valores que já estão salvos', async () => {
      // 28 g de carboidrato + 0,2 g de gordura já salvos: 80 g de proteína passa de 100 g.
      prisma.food.findUnique.mockResolvedValue(
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: userId }),
      );

      await expect(service.updateCustom(userId, 1, { proteinPer100g: 80 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.food.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the food does not exist', async () => {
      prisma.food.findUnique.mockResolvedValue(null);

      await expect(service.updateCustom(userId, 999, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to edit public catalog foods (TACO/USDA)', async () => {
      prisma.food.findUnique.mockResolvedValue(makeFood({ source: FoodSource.TACO }));

      await expect(service.updateCustom(userId, 1, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to edit a CUSTOM food owned by another user', async () => {
      prisma.food.findUnique.mockResolvedValue(
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: 'user-B' }),
      );

      await expect(service.updateCustom(userId, 1, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteCustom', () => {
    it('deletes a CUSTOM food the user owns', async () => {
      prisma.food.findUnique.mockResolvedValue(
        makeFood({ source: FoodSource.CUSTOM, createdByUserId: userId }),
      );
      prisma.food.delete.mockResolvedValue({});

      await service.deleteCustom(userId, 1);

      expect(prisma.food.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('refuses to delete public catalog foods', async () => {
      prisma.food.findUnique.mockResolvedValue(makeFood({ source: FoodSource.TACO }));

      await expect(service.deleteCustom(userId, 1)).rejects.toThrow(NotFoundException);
      expect(prisma.food.delete).not.toHaveBeenCalled();
    });
  });

  describe('listGroups', () => {
    it('returns all groups ordered alphabetically', async () => {
      prisma.foodGroup.findMany.mockResolvedValue([]);

      await service.listGroups();

      expect(prisma.foodGroup.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    });
  });
});
