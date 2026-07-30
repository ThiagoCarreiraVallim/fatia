import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma.service';
import type { LogtoManagementService } from '../../auth/logto-management.service';
import { AccountService, DELETE_CONFIRMATION } from '../account.service';

const makePrisma = () => ({
  user: { findUnique: jest.fn(), delete: jest.fn() },
  userGoals: { findUnique: jest.fn().mockResolvedValue(null) },
  nutrientTarget: { findMany: jest.fn().mockResolvedValue([]) },
  goal: { findMany: jest.fn().mockResolvedValue([]) },
  meal: { findMany: jest.fn().mockResolvedValue([]) },
  food: { findMany: jest.fn().mockResolvedValue([]) },
  exercise: { findMany: jest.fn().mockResolvedValue([]) },
  workoutPlan: { findMany: jest.fn().mockResolvedValue([]) },
  workoutSession: { findMany: jest.fn().mockResolvedValue([]) },
  weightLog: { findMany: jest.fn().mockResolvedValue([]) },
  stepLog: { findMany: jest.fn().mockResolvedValue([]) },
  waterLog: { findMany: jest.fn().mockResolvedValue([]) },
});

const makeLogto = () => ({
  isConfigured: jest.fn().mockReturnValue(true),
  deleteUser: jest.fn().mockResolvedValue(true),
});

const USER = {
  id: 'user-A',
  email: 'a@test.local',
  name: 'A',
  logtoSub: 'logto|abc',
  role: 'USER',
  timezone: 'America/Sao_Paulo',
  heightCm: 180,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

describe('AccountService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let logto: ReturnType<typeof makeLogto>;
  let service: AccountService;

  beforeEach(() => {
    prisma = makePrisma();
    logto = makeLogto();
    service = new AccountService(
      prisma as unknown as PrismaService,
      logto as unknown as LogtoManagementService,
    );
  });

  describe('exportData', () => {
    it('escopa toda consulta ao usuário do contexto', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      await service.exportData('user-A');

      // A garantia que importa: nenhuma das 11 consultas pode escapar do userId.
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-A' } }),
      );
      for (const model of [
        'nutrientTarget',
        'goal',
        'meal',
        'workoutPlan',
        'workoutSession',
        'weightLog',
        'stepLog',
        'waterLog',
      ] as const) {
        expect(prisma[model].findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ userId: 'user-A' }) }),
        );
      }
      // Catálogo custom é escopado por createdByUserId, não userId.
      for (const model of ['food', 'exercise'] as const) {
        expect(prisma[model].findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { createdByUserId: 'user-A' } }),
        );
      }
    });

    it('não seleciona logtoSub no export', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      await service.exportData('user-A');

      // A garantia está no `select`, não no shape do retorno: logtoSub é
      // identificador de infraestrutura de auth, não dado do usuário. Asseverar
      // sobre o select testa o código; asseverar sobre o retorno testaria o mock,
      // que ignora `select`.
      const { select } = prisma.user.findUnique.mock.calls[0][0];
      expect(select).not.toHaveProperty('logtoSub');
      expect(select).toMatchObject({ id: true, email: true, name: true });
    });

    it('inclui contagens para o cliente resumir sem varrer o payload', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.meal.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
      prisma.weightLog.findMany.mockResolvedValue([{ id: 'w1' }]);

      const result = await service.exportData('user-A');

      expect(result.counts.meals).toBe(2);
      expect(result.counts.weightLogs).toBe(1);
      expect(result.format).toBe('fatia-export-v1');
      expect(result.exportedAt).toBeTruthy();
    });

    it('falha quando o usuário não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.exportData('fantasma')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAccount', () => {
    it('recusa sem a confirmação exata e não toca no banco', async () => {
      await expect(service.deleteAccount('user-A', 'sim')).rejects.toThrow(BadRequestException);
      await expect(service.deleteAccount('user-A', '')).rejects.toThrow(BadRequestException);
      // Caixa e espaços importam — a trava não deve ser frouxa.
      await expect(service.deleteAccount('user-A', 'deletar minha conta')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.deleteAccount('user-A', ` ${DELETE_CONFIRMATION} `)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(logto.deleteUser).not.toHaveBeenCalled();
    });

    it('apaga o usuário local e a identidade no Logto', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      const result = await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      expect(logto.deleteUser).toHaveBeenCalledWith('logto|abc');
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-A' } });
      expect(result).toMatchObject({ deleted: true, logtoIdentityDeleted: true });
    });

    it('apaga o Logto ANTES do banco — identidade órfã reprovisionaria conta vazia', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      const order: string[] = [];
      logto.deleteUser.mockImplementation(async () => {
        order.push('logto');
        return true;
      });
      prisma.user.delete.mockImplementation(async () => {
        order.push('prisma');
        return USER;
      });

      await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      expect(order).toEqual(['logto', 'prisma']);
    });

    it('não desfaz nada se o Logto falhar — apaga local e avisa', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      logto.deleteUser.mockResolvedValue(false);

      const result = await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      // O dado pessoal tem de ir embora mesmo sem a Management API configurada.
      expect(prisma.user.delete).toHaveBeenCalled();
      expect(result.logtoIdentityDeleted).toBe(false);
      expect(result.message).toContain('não pôde ser removida');
    });

    it('falha quando o usuário não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccount('fantasma', DELETE_CONFIRMATION)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });
});
