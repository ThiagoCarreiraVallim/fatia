import { NotFoundException } from '@nestjs/common';
import { ShareScope } from '@fatia/db';
import { ProfessionalLinkService } from '../professional-link.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  professionalLink: { updateMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const makePrisma = (): MockPrisma => {
  const prisma: MockPrisma = {
    professionalLink: { updateMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    // O service passa um ARRAY de promises; devolver `Promise.all` reproduz o
    // comportamento do batch sem precisar de banco.
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  return prisma;
};

const SUBJECT = 'aluno-1';
const PRO = 'pro-1';
const GROUP = 'grupo-1';

describe('ProfessionalLinkService', () => {
  let prisma: MockPrisma;
  let service: ProfessionalLinkService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ProfessionalLinkService(prisma as unknown as PrismaService);
  });

  describe('grant', () => {
    it('revoga o vínculo ativo anterior e cria uma linha NOVA (a trilha sobrevive)', async () => {
      prisma.professionalLink.updateMany.mockResolvedValue({ count: 1 });
      prisma.professionalLink.create.mockResolvedValue({ id: 'link-2' });

      const link = await service.grant({
        subjectUserId: SUBJECT,
        professionalId: PRO,
        groupId: GROUP,
        scopes: [ShareScope.WORKOUT],
      });

      expect(link).toEqual({ id: 'link-2' });
      const revoke = prisma.professionalLink.updateMany.mock.calls[0][0];
      expect(revoke.where).toMatchObject({
        subjectUserId: SUBJECT,
        professionalId: PRO,
        groupId: GROUP,
        revokedAt: null,
      });
      expect(revoke.data.revokedReason).toBe('superseded');
      // Se isto virar `update` em cima da linha existente, a janela de vigência
      // antiga desaparece e "quem teve acesso a quê, quando" deixa de ter resposta.
      expect(prisma.professionalLink.create).toHaveBeenCalled();
    });

    it('usa o formato de array do $transaction (pgbouncer, ADR 010)', async () => {
      prisma.professionalLink.updateMany.mockResolvedValue({ count: 0 });
      prisma.professionalLink.create.mockResolvedValue({ id: 'link-1' });

      await service.grant({
        subjectUserId: SUBJECT,
        professionalId: PRO,
        groupId: GROUP,
        scopes: [],
      });

      expect(Array.isArray(prisma.$transaction.mock.calls[0][0])).toBe(true);
    });
  });

  describe('revokeAsSubject', () => {
    it('amarra o linkId de input ao titular autenticado', async () => {
      // `linkId` vem por input. Sem `subjectUserId` no `where`, qualquer
      // autenticado revogaria o consentimento de qualquer outro (#204).
      prisma.professionalLink.updateMany.mockResolvedValue({ count: 1 });
      prisma.professionalLink.findFirst.mockResolvedValue({ id: 'link-1' });

      await service.revokeAsSubject(SUBJECT, 'link-1');

      expect(prisma.professionalLink.updateMany.mock.calls[0][0].where).toEqual({
        id: 'link-1',
        subjectUserId: SUBJECT,
        revokedAt: null,
      });
    });

    it('vínculo de outra pessoa responde como inexistente', async () => {
      prisma.professionalLink.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.revokeAsSubject(SUBJECT, 'link-de-outro')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('revokeAllForMemberOp', () => {
    it('alcança as duas pontas do vínculo dentro do grupo', async () => {
      prisma.professionalLink.updateMany.mockResolvedValue({ count: 3 });

      service.revokeAllForMemberOp(GROUP, PRO, 'left_group', new Date());

      const where = prisma.professionalLink.updateMany.mock.calls[0][0].where;
      expect(where.groupId).toBe(GROUP);
      expect(where.revokedAt).toBeNull();
      expect(where.OR).toEqual([{ subjectUserId: PRO }, { professionalId: PRO }]);
    });

    it('grava o instante recebido, e não um novo', async () => {
      prisma.professionalLink.updateMany.mockResolvedValue({ count: 1 });
      const at = new Date('2026-01-02T03:04:05.000Z');

      service.revokeAllForMemberOp(GROUP, PRO, 'membership_removed', at);

      // Mesmo `at` da mudança de status da membership: datas diferentes na mesma
      // saída tornariam a trilha mais difícil de ler do que precisa.
      expect(prisma.professionalLink.updateMany.mock.calls[0][0].data).toEqual({
        revokedAt: at,
        revokedReason: 'membership_removed',
      });
    });
  });
});
