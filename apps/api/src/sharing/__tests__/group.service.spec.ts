import { ConflictException, NotFoundException } from '@nestjs/common';
import { GroupRole, GroupType, MembershipStatus } from '@fatia/db';
import { GroupService } from '../group.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  group: { create: jest.Mock; findUnique: jest.Mock };
  groupMembership: { findMany: jest.Mock; findUnique: jest.Mock; count: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  group: { create: jest.fn(), findUnique: jest.fn() },
  groupMembership: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
});

const OWNER = 'dono-1';
const OUTRO = 'estranho-1';

describe('GroupService', () => {
  let prisma: MockPrisma;
  let service: GroupService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new GroupService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('cria o grupo já com a membership de OWNER ativa', async () => {
      prisma.group.create.mockResolvedValue({ id: 'g1', slug: 'academia-x' });

      await service.create(OWNER, { type: GroupType.SPONSORED, name: 'Academia X' });

      const data = prisma.group.create.mock.calls[0][0].data;
      expect(data.ownerId).toBe(OWNER);
      // Grupo sem dono fica órfão com cobrança viva: as duas escritas são uma só.
      expect(data.memberships.create).toMatchObject({
        userId: OWNER,
        role: GroupRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });
    });

    it('deriva slug único a partir do nome quando não vem um', async () => {
      prisma.group.create.mockResolvedValue({ id: 'g1' });

      await service.create(OWNER, { type: GroupType.SOCIAL, name: 'Academia Central' });
      await service.create(OWNER, { type: GroupType.SOCIAL, name: 'Academia Central' });

      const [primeiro, segundo] = prisma.group.create.mock.calls.map((c) => c[0].data.slug);
      expect(primeiro).toMatch(/^academia-central-[0-9a-f]{8}$/);
      // Sem sufixo, o segundo dono com o mesmo nome recebe um erro que não sabe
      // resolver — e o nome de academia repete entre cidades o tempo todo.
      expect(segundo).not.toBe(primeiro);
    });

    it('traduz slug duplicado (P2002) em CONFLICT', async () => {
      prisma.group.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create(OWNER, { type: GroupType.SPONSORED, name: 'X', slug: 'ja-existe' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findByIdForMember', () => {
    it('grupo de que não sou membro responde igual a grupo inexistente', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      const semMembership = await service
        .findByIdForMember(OUTRO, 'g1')
        .catch((err: Error) => err.message);

      // Mesma linha de código, mesma mensagem: a rota não pode virar oráculo de
      // existência de academia (#92).
      expect(semMembership).toBe('Group not found');
      await expect(service.findByIdForMember(OUTRO, 'inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('quem foi removido não enxerga mais o grupo', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm1',
        status: MembershipStatus.REMOVED,
        role: GroupRole.MEMBER,
        joinedAt: null,
        group: { id: 'g1', type: GroupType.SPONSORED, name: 'X', slug: 'x', createdAt: new Date() },
      });

      await expect(service.findByIdForMember(OUTRO, 'g1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listMine', () => {
    it('lista só as associações vivas do próprio usuário', async () => {
      prisma.groupMembership.findMany.mockResolvedValue([]);

      await service.listMine(OWNER);

      expect(prisma.groupMembership.findMany.mock.calls[0][0].where).toEqual({
        userId: OWNER,
        status: { in: [MembershipStatus.INVITED, MembershipStatus.ACTIVE] },
      });
    });
  });

  describe('previewBySlug', () => {
    it('devolve metadado do grupo e a contagem, nunca a lista de membros', async () => {
      prisma.group.findUnique.mockResolvedValue({
        id: 'g1',
        type: GroupType.SPONSORED,
        name: 'Academia X',
        slug: 'academia-x',
      });
      prisma.groupMembership.count.mockResolvedValue(12);

      const preview = await service.previewBySlug('academia-x');

      // Quem está numa academia é informação sobre pessoas, não sobre o grupo.
      expect(preview).toEqual({
        id: 'g1',
        type: GroupType.SPONSORED,
        name: 'Academia X',
        slug: 'academia-x',
        memberCount: 12,
      });
      expect(prisma.groupMembership.findMany).not.toHaveBeenCalled();
    });
  });
});
