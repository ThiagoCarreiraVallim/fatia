import { UserGoalsService } from '../user-goals.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  userGoals: { findUnique: jest.Mock; upsert: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  userGoals: { findUnique: jest.fn(), upsert: jest.fn() },
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
  });
});
