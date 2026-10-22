import { BadRequestException } from '@nestjs/common';
import { OnboardingService } from '../onboarding.service';
import type { PrismaService } from '../../common/prisma.service';
import type { CompleteOnboardingDto } from '../dto/onboarding.dto';

const TZ = 'America/Sao_Paulo';

const makePrisma = () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'u1', onboardedAt: new Date() }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    weightLog: { findFirst: jest.fn(), create: jest.fn() },
    userGoals: { upsert: jest.fn().mockResolvedValue({ userId: 'u1' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return prisma;
};

const GOALS = {
  kcalMin: 1650,
  kcalMax: 1800,
  proteinMinG: 117,
  proteinMaxG: 143,
  carbsMinG: 119,
  carbsMaxG: 225,
  fatMinG: 48,
  fatMaxG: 67,
};

const DTO: CompleteOnboardingDto = {
  sex: 'FEMALE',
  birthDate: '1996-03-12',
  heightCm: 168,
  weightKg: 65,
  activityLevel: 'MODERATE',
  objective: 'LOSE',
  goals: GOALS,
};

describe('OnboardingService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: OnboardingService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OnboardingService(prisma as unknown as PrismaService);
  });

  describe('suggest', () => {
    it('completa o que falta com o perfil e a última pesagem', async () => {
      prisma.user.findUnique.mockResolvedValue({
        sex: 'FEMALE',
        birthDate: new Date('1996-03-12T00:00:00Z'),
        heightCm: 168,
        activityLevel: 'MODERATE',
        objective: null,
      });
      prisma.weightLog.findFirst.mockResolvedValue({ weightKg: 65 });

      const s = await service.suggest('u1', { objective: 'LOSE' }, TZ);

      expect(s.bmr).toBe(1389);
      expect(prisma.weightLog.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { loggedAt: 'desc' },
      });
    });

    it('o peso informado dispensa a consulta da última pesagem', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.suggest('u1', { ...DTO, goals: undefined } as never, TZ);
      expect(prisma.weightLog.findFirst).not.toHaveBeenCalled();
    });

    it('diz o que falta para calcular', async () => {
      prisma.user.findUnique.mockResolvedValue({
        sex: null,
        birthDate: null,
        heightCm: 168,
        activityLevel: null,
        objective: null,
      });
      prisma.weightLog.findFirst.mockResolvedValue(null);

      await expect(service.suggest('u1', {}, TZ)).rejects.toThrow(
        'Faltam dados para calcular: sexo, data de nascimento, peso, nível de atividade, objetivo.',
      );
    });

    it('recusa dado fora da faixa', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.suggest('u1', { ...DTO, heightCm: 300, goals: undefined } as never, TZ),
      ).rejects.toThrow(/altura/);
    });
  });

  describe('complete', () => {
    it('grava perfil, pesagem, metas e a data da primeira vez numa transação', async () => {
      prisma.weightLog.findFirst.mockResolvedValue(null);

      await service.complete('u1', DTO, TZ);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          sex: 'FEMALE',
          birthDate: new Date('1996-03-12T00:00:00Z'),
          heightCm: 168,
          activityLevel: 'MODERATE',
          objective: 'LOSE',
          onboardedAt: expect.any(Date),
        },
        select: { id: true, onboardedAt: true },
      });
      expect(prisma.weightLog.create).toHaveBeenCalledWith({
        data: { userId: 'u1', weightKg: 65, loggedAt: expect.any(Date) },
      });
      expect(prisma.userGoals.upsert).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        create: { userId: 'u1', ...GOALS },
        update: GOALS,
      });
    });

    it('a mesma pesagem de hoje não vira uma segunda', async () => {
      prisma.weightLog.findFirst.mockResolvedValue({ id: 'w1', weightKg: 65 });
      await service.complete('u1', DTO, TZ);
      expect(prisma.weightLog.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          weightKg: 65,
          loggedAt: { gte: expect.any(Date), lt: expect.any(Date) },
        },
      });
      expect(prisma.weightLog.create).not.toHaveBeenCalled();
    });

    it('recusa metas inválidas antes de gravar qualquer coisa', async () => {
      await expect(
        service.complete('u1', { ...DTO, goals: { ...GOALS, kcalMin: 2000 } }, TZ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('recusa perfil fora da faixa antes de gravar qualquer coisa', async () => {
      await expect(service.complete('u1', { ...DTO, birthDate: '2015-01-01' }, TZ)).rejects.toThrow(
        /16 a 100 anos/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it('skip só marca a data quando ainda não há uma', async () => {
    prisma.user.findUnique.mockResolvedValue({ onboardedAt: new Date() });
    await service.skip('u1');
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', onboardedAt: null },
      data: { onboardedAt: expect.any(Date) },
    });
  });
});
