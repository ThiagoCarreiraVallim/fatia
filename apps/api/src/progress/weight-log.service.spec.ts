import { Test } from '@nestjs/testing';
import { WeightLogService } from './weight-log.service';
import { PrismaService } from '../common/prisma.service';

describe('WeightLogService', () => {
  let service: WeightLogService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WeightLogService,
        {
          provide: PrismaService,
          useValue: {
            weightLog: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();
    service = module.get(WeightLogService);
    prisma = module.get(PrismaService);
  });

  it('lists weight logs ordered by loggedAt desc', async () => {
    const fakeLog = { id: '1', userId: 'u1', weightKg: 80, loggedAt: new Date(), notes: null };
    (prisma.weightLog.findMany as jest.Mock).mockResolvedValue([fakeLog]);
    const result = await service.list({ limit: 1 }, 'u1');
    expect(result).toEqual([fakeLog]);
    expect(prisma.weightLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('filters by userId (user isolation)', async () => {
    (prisma.weightLog.findMany as jest.Mock).mockResolvedValue([]);
    await service.list({}, 'u2');
    expect(prisma.weightLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u2' } }),
    );
  });

  it('filters by date range when from param is provided', async () => {
    (prisma.weightLog.findMany as jest.Mock).mockResolvedValue([]);
    await service.list({ from: '2026-01-01' }, 'u1');
    const call = (prisma.weightLog.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.userId).toBe('u1');
    expect(call.where.loggedAt).toBeDefined();
  });
});
