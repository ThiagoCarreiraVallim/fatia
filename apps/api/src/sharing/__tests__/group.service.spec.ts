import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupRole, GroupType, MembershipStatus } from '@fatia/db';
import { ProfessionalLinkService } from '../professional-link.service';
import { GroupService } from '../group.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  group: { create: jest.Mock; findUnique: jest.Mock };
  groupMembership: { findMany: jest.Mock; findUnique: jest.Mock; count: jest.Mock };
  groupSeatAssignment: { findMany: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  group: { create: jest.fn(), findUnique: jest.fn() },
  groupMembership: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  groupSeatAssignment: { findMany: jest.fn().mockResolvedValue([]) },
});

const OWNER = 'dono-1';
const OUTRO = 'estranho-1';

describe('GroupService', () => {
  let prisma: MockPrisma;
  let service: GroupService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new GroupService(
      prisma as unknown as PrismaService,
      new ProfessionalLinkService(prisma as unknown as PrismaService),
    );
  });

  describe('ações do dono: membro recebe 403, não-membro 404 (como o GroupRoleGuard)', () => {
    const acoes: Array<[string, (s: GroupService) => Promise<unknown>]> = [
      ['update', (s) => s.update(OUTRO, 'g1', { name: 'Outra' })],
      ['setAvatar', (s) => s.setAvatar(OUTRO, 'g1', null)],
      ['remove', (s) => s.remove(OUTRO, 'g1')],
      ['transferOwnership', (s) => s.transferOwnership(OUTRO, 'g1', 'm-x')],
    ];

    it.each(acoes)('%s por membro comum é FORBIDDEN', async (_nome, acao) => {
      // Para quem já está dentro não há existência a esconder (docs/PERMISSIONS.md):
      // o MembershipService e o guard respondem 403, e este service respondia 404.
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm-outro',
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      });
      await expect(acao(service)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(acoes)('%s por quem não é membro é NOT_FOUND', async (_nome, acao) => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      await expect(acao(service)).rejects.toBeInstanceOf(NotFoundException);
    });
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

    // Os DOIS status de associação encerrada, e não só `REMOVED`: barrar um e
    // deixar o outro passar é o que fazia quem saiu (`LEFT`) continuar lendo
    // nome, slug e papel por id, enquanto `listMine` já escondia o grupo.
    it.each([MembershipStatus.LEFT, MembershipStatus.REMOVED])(
      'associação %s não enxerga mais o grupo por id',
      async (status) => {
        prisma.groupMembership.findUnique.mockResolvedValue({
          id: 'm1',
          status,
          role: GroupRole.MEMBER,
          joinedAt: null,
          group: {
            id: 'g1',
            type: GroupType.SPONSORED,
            name: 'X',
            slug: 'x',
            createdAt: new Date(),
          },
          consentScopes: [],
          statsOptIn: false,
        });

        await expect(service.findByIdForMember(OUTRO, 'g1')).rejects.toThrow(NotFoundException);
      },
    );

    it.each([MembershipStatus.INVITED, MembershipStatus.ACTIVE])(
      'associação %s continua enxergando',
      async (status) => {
        // Guarda do guarda: um `if` que recusasse todo mundo passaria nos casos
        // acima. O conjunto vivo é o mesmo de `listMine`, nos dois sentidos.
        prisma.groupMembership.findUnique.mockResolvedValue({
          id: 'm1',
          status,
          role: GroupRole.MEMBER,
          joinedAt: null,
          group: {
            id: 'g1',
            type: GroupType.SPONSORED,
            name: 'X',
            slug: 'x',
            createdAt: new Date(),
          },
          consentScopes: [],
          statsOptIn: false,
        });

        await expect(service.findByIdForMember(OUTRO, 'g1')).resolves.toMatchObject({
          id: 'g1',
          status,
        });
      },
    );
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
    it('devolve metadado, a contagem e a equipe — nunca a lista de membros', async () => {
      prisma.group.findUnique.mockResolvedValue({
        id: 'g1',
        type: GroupType.SPONSORED,
        name: 'Academia X',
        slug: 'academia-x',
        description: null,
        joinPolicy: 'APPROVAL',
      });
      prisma.groupMembership.count.mockResolvedValue(12);
      prisma.groupMembership.findMany.mockResolvedValue([
        { role: GroupRole.OWNER, user: { name: 'Dona' } },
      ]);

      const preview = await service.previewBySlug('academia-x');

      // A equipe aparece porque é ela quem vai receber o que a pessoa escolher
      // compartilhar (ADR 026). Os outros alunos, nunca: quem está numa academia
      // é informação sobre pessoas, não sobre o grupo.
      expect(preview).toEqual({
        id: 'g1',
        type: GroupType.SPONSORED,
        name: 'Academia X',
        slug: 'academia-x',
        description: null,
        joinPolicy: 'APPROVAL',
        memberCount: 12,
        team: [{ name: 'Dona', role: GroupRole.OWNER }],
      });
      expect(prisma.groupMembership.findMany.mock.calls[0][0].where.role).toEqual({
        in: [GroupRole.OWNER, GroupRole.PROFESSIONAL, GroupRole.CREATOR],
      });
    });

    it('comunidade só por convite não aparece pelo código', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 'g1', joinPolicy: 'INVITE_ONLY' });
      await expect(service.previewBySlug('academia-x')).rejects.toThrow(NotFoundException);
    });
  });
});
