import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupRole, MembershipStatus, ShareScope } from '@fatia/db';
import { MembershipService } from '../membership.service';
import type { ProfessionalLinkService } from '../professional-link.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  group: { findUnique: jest.Mock };
  groupMembership: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  professionalLink: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

const makePrisma = (): MockPrisma => ({
  group: { findUnique: jest.fn() },
  groupMembership: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  professionalLink: { findMany: jest.fn() },
  // O service passa um ARRAY de operações; `Promise.all` reproduz o batch sem banco.
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
});

const GROUP = 'grupo-1';
const ALUNO = 'aluno-1';
const DONO = 'dono-1';
const PRO = 'pro-1';

describe('MembershipService', () => {
  let prisma: MockPrisma;
  let links: { revokeAllForMemberOp: jest.Mock };
  let service: MembershipService;

  beforeEach(() => {
    prisma = makePrisma();
    links = { revokeAllForMemberOp: jest.fn(() => ({ count: 0 })) };
    service = new MembershipService(
      prisma as unknown as PrismaService,
      links as unknown as ProfessionalLinkService,
    );
  });

  describe('requestJoin', () => {
    it('entra sempre como MEMBER e aguardando aprovação', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: GROUP });
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      prisma.groupMembership.create.mockResolvedValue({
        id: 'm1',
        status: MembershipStatus.INVITED,
        role: GroupRole.MEMBER,
      });

      await service.requestJoin(ALUNO, 'academia-x');

      // PROFESSIONAL é papel que pode receber consentimento de leitura de dado
      // de saúde: autoatribuir seria conceder-se a antessala do acesso.
      expect(prisma.groupMembership.create.mock.calls[0][0].data).toMatchObject({
        groupId: GROUP,
        userId: ALUNO,
        role: GroupRole.MEMBER,
        status: MembershipStatus.INVITED,
      });
    });

    it('não cria nenhum ProfessionalLink ao entrar', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: GROUP });
      prisma.groupMembership.findUnique.mockResolvedValue(null);
      prisma.groupMembership.create.mockResolvedValue({
        id: 'm1',
        status: MembershipStatus.INVITED,
        role: GroupRole.MEMBER,
      });

      const resultado = await service.requestJoin(ALUNO, 'academia-x');

      // Entrar concede zero (ADR 014). Nem com escopo vazio.
      expect(resultado.revokedLinks).toBe(0);
      expect(links.revokeAllForMemberOp).not.toHaveBeenCalled();
    });

    it('slug inexistente responde NOT_FOUND', async () => {
      prisma.group.findUnique.mockResolvedValue(null);

      await expect(service.requestJoin(ALUNO, 'nao-existe')).rejects.toThrow(NotFoundException);
    });

    it('pedido repetido responde CONFLICT', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: GROUP });
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm1',
        status: MembershipStatus.ACTIVE,
      });

      await expect(service.requestJoin(ALUNO, 'academia-x')).rejects.toThrow(ConflictException);
    });
  });

  describe('approve', () => {
    const donoAtivo = { id: 'm-dono', role: GroupRole.OWNER, status: MembershipStatus.ACTIVE };

    it('recusa membership de OUTRO grupo, mesmo sendo dono deste (#204)', async () => {
      prisma.groupMembership.findUnique
        .mockResolvedValueOnce(donoAtivo)
        .mockResolvedValueOnce({ id: 'm-outra', groupId: 'grupo-2', status: 'INVITED' });

      await expect(service.approve(DONO, GROUP, 'm-outra')).rejects.toThrow(NotFoundException);
      expect(prisma.groupMembership.update).not.toHaveBeenCalled();
    });

    it('membro comum recebe FORBIDDEN e não-membro recebe NOT_FOUND', async () => {
      prisma.groupMembership.findUnique.mockResolvedValueOnce({
        id: 'm-membro',
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      });
      await expect(service.approve(ALUNO, GROUP, 'm2')).rejects.toThrow(ForbiddenException);

      prisma.groupMembership.findUnique.mockResolvedValueOnce(null);
      await expect(service.approve('estranho', GROUP, 'm2')).rejects.toThrow(NotFoundException);
    });

    it('aprova com o papel escolhido pelo dono', async () => {
      prisma.groupMembership.findUnique.mockResolvedValueOnce(donoAtivo).mockResolvedValueOnce({
        id: 'm2',
        groupId: GROUP,
        status: MembershipStatus.INVITED,
      });
      prisma.groupMembership.update.mockResolvedValue({
        id: 'm2',
        status: MembershipStatus.ACTIVE,
        role: GroupRole.PROFESSIONAL,
      });

      await service.approve(DONO, GROUP, 'm2', GroupRole.PROFESSIONAL);

      expect(prisma.groupMembership.update.mock.calls[0][0].data).toMatchObject({
        status: MembershipStatus.ACTIVE,
        role: GroupRole.PROFESSIONAL,
      });
    });

    // O alvo é um pedido VÁLIDO e o papel é OWNER: o único motivo de recusa
    // possível é o status do dono. Com um alvo inválido o caso passaria mesmo
    // sem a checagem, porque a recusa viria da linha de baixo.
    it.each([MembershipStatus.LEFT, MembershipStatus.REMOVED])(
      'dono com associação %s não administra mais',
      async (status) => {
        prisma.groupMembership.findUnique
          .mockResolvedValueOnce({ id: 'm-dono', role: GroupRole.OWNER, status })
          .mockResolvedValueOnce({
            id: 'm2',
            groupId: GROUP,
            status: MembershipStatus.INVITED,
          });

        await expect(service.approve(DONO, GROUP, 'm2')).rejects.toThrow(NotFoundException);
        expect(prisma.groupMembership.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('leave', () => {
    it('encerra a associação e revoga os vínculos do grupo na MESMA transação', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm1',
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      });
      prisma.groupMembership.update.mockReturnValue({
        id: 'm1',
        status: MembershipStatus.LEFT,
        role: GroupRole.MEMBER,
      });
      links.revokeAllForMemberOp.mockReturnValue({ count: 2 });

      const resultado = await service.leave(ALUNO, GROUP);

      // Duas escritas separadas abririam uma janela em que a associação já
      // acabou e o vínculo ainda autoriza leitura de dado de saúde.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
      expect(resultado.revokedLinks).toBe(2);

      const [groupId, userId, reason, at] = links.revokeAllForMemberOp.mock.calls[0];
      expect([groupId, userId, reason]).toEqual([GROUP, ALUNO, 'left_group']);
      // Mesmo instante nos dois lados — datas diferentes na mesma saída tornam a
      // trilha mais difícil de ler do que precisa.
      expect(prisma.groupMembership.update.mock.calls[0][0].data.leftAt).toBe(at);
    });

    it('revoga por groupId, sem filtrar profissional — senão a saída é parcial', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm1',
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      });
      prisma.groupMembership.update.mockReturnValue({ id: 'm1', status: MembershipStatus.LEFT });

      await service.leave(ALUNO, GROUP);

      // A assinatura não tem onde encaixar um profissional específico: quem sai
      // deixa de ser lido por TODOS os profissionais daquele grupo.
      expect(links.revokeAllForMemberOp.mock.calls[0]).toHaveLength(4);
    });

    it('o dono não sai: recebe CONFLICT com o caminho', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm-dono',
        role: GroupRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });

      await expect(service.leave(DONO, GROUP)).rejects.toThrow(
        /Transfira a propriedade ou apague o grupo/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('não consulta papel de ninguém para autorizar a saída', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm1',
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      });
      prisma.groupMembership.update.mockReturnValue({ id: 'm1', status: MembershipStatus.LEFT });

      await service.leave(ALUNO, GROUP);

      // Uma leitura só, a da própria associação: nenhum caminho consulta o dono,
      // e por isso nenhum papel pode impedir a saída.
      expect(prisma.groupMembership.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.groupMembership.findUnique.mock.calls[0][0].where).toEqual({
        groupId_userId: { groupId: GROUP, userId: ALUNO },
      });
    });
  });

  describe('removeMember', () => {
    const donoAtivo = { id: 'm-dono', role: GroupRole.OWNER, status: MembershipStatus.ACTIVE };

    it('remove com o mesmo efeito de leave, mudando só o motivo da revogação', async () => {
      prisma.groupMembership.findUnique.mockResolvedValueOnce(donoAtivo).mockResolvedValueOnce({
        id: 'm1',
        groupId: GROUP,
        userId: ALUNO,
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      });
      prisma.groupMembership.update.mockReturnValue({
        id: 'm1',
        status: MembershipStatus.REMOVED,
        role: GroupRole.MEMBER,
      });

      await service.removeMember(DONO, GROUP, 'm1');

      expect(links.revokeAllForMemberOp.mock.calls[0].slice(0, 3)).toEqual([
        GROUP,
        ALUNO,
        'membership_removed',
      ]);
    });

    it('recusa membership de outro grupo (#204)', async () => {
      prisma.groupMembership.findUnique
        .mockResolvedValueOnce(donoAtivo)
        .mockResolvedValueOnce({ id: 'm-outra', groupId: 'grupo-2', status: 'ACTIVE' });

      await expect(service.removeMember(DONO, GROUP, 'm-outra')).rejects.toThrow(NotFoundException);
      expect(links.revokeAllForMemberOp).not.toHaveBeenCalled();
    });

    it('o dono não pode ser removido do próprio grupo', async () => {
      prisma.groupMembership.findUnique.mockResolvedValueOnce(donoAtivo).mockResolvedValueOnce({
        id: 'm-dono',
        groupId: GROUP,
        userId: DONO,
        role: GroupRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });

      await expect(service.removeMember(DONO, GROUP, 'm-dono')).rejects.toThrow(ConflictException);
    });
  });

  describe('listMembers', () => {
    it('aluno não recebe a lista dos outros alunos', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm1',
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      });
      prisma.groupMembership.findMany.mockResolvedValue([]);

      await service.listMembers(ALUNO, GROUP);

      const where = prisma.groupMembership.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { role: { in: [GroupRole.OWNER, GroupRole.PROFESSIONAL, GroupRole.CREATOR] } },
        { userId: ALUNO },
      ]);
    });

    it('profissional vê só os escopos que consentiram A ELE', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm-pro',
        role: GroupRole.PROFESSIONAL,
        status: MembershipStatus.ACTIVE,
      });
      prisma.groupMembership.findMany.mockResolvedValue([
        {
          id: 'm1',
          userId: ALUNO,
          role: GroupRole.MEMBER,
          status: MembershipStatus.ACTIVE,
          joinedAt: null,
          user: { name: 'Aluno' },
        },
        {
          id: 'm2',
          userId: 'aluno-2',
          role: GroupRole.MEMBER,
          status: MembershipStatus.ACTIVE,
          joinedAt: null,
          user: { name: 'Aluno 2' },
        },
      ]);
      prisma.professionalLink.findMany.mockResolvedValue([
        { subjectUserId: ALUNO, scopes: [ShareScope.WORKOUT] },
      ]);

      const membros = await service.listMembers(PRO, GROUP);

      expect(prisma.professionalLink.findMany.mock.calls[0][0].where).toEqual({
        groupId: GROUP,
        professionalId: PRO,
        revokedAt: null,
      });
      // Quem não consentiu a ELE aparece com lista vazia — e nunca com o que
      // consentiu a outro profissional.
      expect(membros.map((m) => m.scopesGrantedToMe)).toEqual([[ShareScope.WORKOUT], []]);
    });

    it('quem não é membro ativo recebe NOT_FOUND', async () => {
      prisma.groupMembership.findUnique.mockResolvedValue(null);

      await expect(service.listMembers('estranho', GROUP)).rejects.toThrow(NotFoundException);
    });

    // O filtro de status é o que impede ex-membro de continuar aparecendo na
    // listagem — inclusive para o PROFESSIONAL, com nome. Vale para os dois
    // papéis porque o `veTodos` monta dois `where` diferentes, e só um deles
    // seria coberto por um caso só.
    it.each([
      ['dono', DONO, GroupRole.OWNER],
      ['aluno', ALUNO, GroupRole.MEMBER],
    ])('a listagem pedida pelo %s só busca associação viva', async (_papel, quem, role) => {
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm1',
        role,
        status: MembershipStatus.ACTIVE,
      });
      prisma.groupMembership.findMany.mockResolvedValue([]);

      await service.listMembers(quem, GROUP);

      expect(prisma.groupMembership.findMany.mock.calls[0][0].where.status).toEqual({
        in: [MembershipStatus.INVITED, MembershipStatus.ACTIVE],
      });
    });
  });
});
