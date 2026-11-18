import { BadRequestException } from '@nestjs/common';
import { UserGoalsService } from '../user-goals.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  userGoals: { findUnique: jest.Mock; upsert: jest.Mock };
  userGoalsHistory: { create: jest.Mock };
  user: { updateMany: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  userGoals: { findUnique: jest.fn(), upsert: jest.fn() },
  userGoalsHistory: { create: jest.fn().mockResolvedValue({}) },
  user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
});

describe('UserGoalsService', () => {
  let prisma: MockPrisma;
  let service: UserGoalsService;
  const userId = 'user-A';

  beforeEach(() => {
    prisma = makePrisma();
    service = new UserGoalsService(prisma as unknown as PrismaService);
  });

  describe('get', () => {
    it('returns the goals scoped to the user (or null when not set yet)', async () => {
      prisma.userGoals.findUnique.mockResolvedValue(null);

      const result = await service.get(userId);

      expect(prisma.userGoals.findUnique).toHaveBeenCalledWith({ where: { userId } });
      expect(result).toBeNull();
    });

    it('returns the persisted goals row when present', async () => {
      const goals = { userId, kcalMin: 1800, kcalMax: 2200, dailyStepsTarget: 8000 };
      prisma.userGoals.findUnique.mockResolvedValue(goals);

      const result = await service.get(userId);

      expect(result).toBe(goals);
    });
  });

  describe('upsert', () => {
    it('creates a new goals row when none exists (userId in create payload)', async () => {
      const dto = {
        kcalMin: 1800,
        kcalMax: 2200,
        proteinMinG: 120,
        proteinMaxG: 160,
        carbsMinG: 200,
        carbsMaxG: 280,
        fatMinG: 50,
        fatMaxG: 80,
        dailyStepsTarget: 10000,
        weeklyWorkouts: 4,
      };
      prisma.userGoals.upsert.mockImplementation(({ create }) => Promise.resolve(create));

      await service.upsert(userId, dto);

      expect(prisma.userGoals.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, ...dto },
        update: dto,
      });
    });

    it('marca a primeira vez como feita, sem sobrescrever a data de quem já passou', async () => {
      prisma.userGoals.upsert.mockResolvedValue({});
      await service.upsert(userId, {
        kcalMin: 1800,
        kcalMax: 2200,
        proteinMinG: 120,
        proteinMaxG: 160,
        carbsMinG: 200,
        carbsMaxG: 280,
        fatMinG: 50,
        fatMaxG: 80,
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: userId, onboardedAt: null },
        data: { onboardedAt: expect.any(Date) },
      });
    });
  });
  describe('upsert — histórico (#396)', () => {
    const atuais = {
      userId,
      kcalMin: 2500,
      kcalMax: 2800,
      proteinMinG: 120,
      proteinMaxG: 160,
      carbsMinG: 200,
      carbsMaxG: 280,
      fatMinG: 50,
      fatMaxG: 80,
      weeklyWorkouts: 3,
      dailyStepsTarget: 8000,
      dailyWaterTargetMl: 2500,
      updatedAt: new Date(),
    };
    const novas = { ...atuais, kcalMin: 1800, kcalMax: 2100 };
    const dto = {
      kcalMin: 1800,
      kcalMax: 2100,
      proteinMinG: 120,
      proteinMaxG: 160,
      carbsMinG: 200,
      carbsMaxG: 280,
      fatMinG: 50,
      fatMaxG: 80,
      weeklyWorkouts: 3,
      dailyStepsTarget: 8000,
      dailyWaterTargetMl: 2500,
    };

    it('guarda as metas de antes quando alguma muda, com a origem', async () => {
      prisma.userGoals.findUnique.mockResolvedValue(atuais);
      prisma.userGoals.upsert.mockResolvedValue(novas);
      await service.upsert(userId, dto, {
        source: 'group_plan',
        templateId: 'tpl-1',
        templateTitle: 'Cutting',
      });
      expect(prisma.userGoalsHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          kcalMin: 2500,
          kcalMax: 2800,
          dailyWaterTargetMl: 2500,
          source: 'group_plan',
          templateId: 'tpl-1',
          templateTitle: 'Cutting',
        }),
      });
    });

    it('sem metas antes, ou sem mudança, não grava histórico', async () => {
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.userGoals.upsert.mockResolvedValue(novas);
      await service.upsert(userId, dto);
      prisma.userGoals.findUnique.mockResolvedValue(novas);
      await service.upsert(userId, dto);
      expect(prisma.userGoalsHistory.create).not.toHaveBeenCalled();
    });

    it('a troca à mão vira source manual', async () => {
      prisma.userGoals.findUnique.mockResolvedValue(atuais);
      prisma.userGoals.upsert.mockResolvedValue(novas);
      await service.upsert(userId, dto);
      expect(prisma.userGoalsHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: 'manual', templateId: null }),
      });
    });
  });

  describe('upsert — limites', () => {
    const valid = {
      kcalMin: 1800,
      kcalMax: 2200,
      proteinMinG: 120,
      proteinMaxG: 160,
      carbsMinG: 200,
      carbsMaxG: 280,
      fatMinG: 50,
      fatMaxG: 80,
    };

    it.each([
      ['kcal', { kcalMin: 2500, kcalMax: 2000 }, /calorias/],
      ['proteína', { proteinMinG: 200, proteinMaxG: 100 }, /proteína/],
      ['carboidrato', { carbsMinG: 300, carbsMaxG: 100 }, /carboidrato/],
      ['gordura', { fatMinG: 90, fatMaxG: 50 }, /gordura/],
    ])('recusa piso de %s acima do teto', async (_nome, campos, mensagem) => {
      await expect(service.upsert(userId, { ...valid, ...campos })).rejects.toThrow(mensagem);
      expect(prisma.userGoals.upsert).not.toHaveBeenCalled();
    });

    it.each([
      ['kcalMax', { kcalMax: 10_001 }],
      ['proteinMaxG', { proteinMaxG: 1_001 }],
      ['carbsMaxG', { carbsMaxG: 1_001 }],
      ['fatMaxG', { fatMaxG: 1_001 }],
      ['dailyWaterTargetMl', { dailyWaterTargetMl: 10_001 }],
      ['dailyStepsTarget', { dailyStepsTarget: 100_001 }],
      ['weeklyWorkouts', { weeklyWorkouts: 15 }],
    ])('recusa %s acima do limite', async (_campo, campos) => {
      await expect(service.upsert(userId, { ...valid, ...campos })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.userGoals.upsert).not.toHaveBeenCalled();
    });

    it('aceita piso igual ao teto e os limites exatos', async () => {
      prisma.userGoals.upsert.mockResolvedValue({});
      await service.upsert(userId, {
        ...valid,
        kcalMin: 10_000,
        kcalMax: 10_000,
        dailyWaterTargetMl: 10_000,
        dailyStepsTarget: 100_000,
        weeklyWorkouts: 14,
      });
      expect(prisma.userGoals.upsert).toHaveBeenCalled();
    });
  });
});
