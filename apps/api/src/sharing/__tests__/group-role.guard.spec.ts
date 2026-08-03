import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { GroupRole, GroupType, MembershipStatus } from '@fatia/db';
import { GroupRoleGuard } from '../guards/group-role.guard';
import { GroupService } from '../group.service';
import type { PrismaService } from '../../common/prisma.service';

const GROUP = 'grupo-1';
const USER = 'user-1';

const makeContext = (request: Record<string, unknown>): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('GroupRoleGuard', () => {
  const prisma = { groupMembership: { findUnique: jest.fn() } };
  const reflector = { get: jest.fn() };
  const guard = new GroupRoleGuard(
    reflector as unknown as Reflector,
    prisma as unknown as PrismaService,
  );

  const requisicao = { user: { id: USER }, params: { groupId: GROUP } };

  beforeEach(() => {
    prisma.groupMembership.findUnique.mockReset();
    reflector.get.mockReset();
  });

  it('deixa passar rota sem ação declarada, sem tocar no banco', async () => {
    reflector.get.mockReturnValue(undefined);

    await expect(guard.canActivate(makeContext(requisicao))).resolves.toBe(true);
    // Rota `@SelfOnly` não tem grupo a conferir; uma consulta aqui seria uma ida
    // ao banco por requisição para não decidir nada.
    expect(prisma.groupMembership.findUnique).not.toHaveBeenCalled();
  });

  it('autoriza o papel que a matriz permite', async () => {
    reflector.get.mockReturnValue('member.remove');
    prisma.groupMembership.findUnique.mockResolvedValue({
      role: GroupRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });

    await expect(guard.canActivate(makeContext(requisicao))).resolves.toBe(true);
    expect(prisma.groupMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId_userId: { groupId: GROUP, userId: USER } } }),
    );
  });

  it.each([GroupRole.PROFESSIONAL, GroupRole.CREATOR, GroupRole.MEMBER])(
    'recusa %s numa ação de dono, com FORBIDDEN e não NOT_FOUND',
    async (role) => {
      reflector.get.mockReturnValue('member.remove');
      prisma.groupMembership.findUnique.mockResolvedValue({
        role,
        status: MembershipStatus.ACTIVE,
      });

      // Membro do grupo recebe `FORBIDDEN`: para ele não há existência a
      // esconder, ele já está lá dentro. É a mesma distinção do `assertOwner`.
      await expect(guard.canActivate(makeContext(requisicao))).rejects.toThrow(ForbiddenException);
    },
  );

  it('deixa a associação pendente exercer a ação que a doc dá a ela', async () => {
    reflector.get.mockReturnValue('group.read');
    prisma.groupMembership.findUnique.mockResolvedValue({
      role: GroupRole.MEMBER,
      status: MembershipStatus.INVITED,
    });

    // Quem pediu para entrar já vê o grupo em `GET /groups`; fechar o `GET
    // /groups/:id` faria o mesmo grupo estar na lista e dar 404 ao ser aberto.
    await expect(guard.canActivate(makeContext(requisicao))).resolves.toBe(true);
  });

  it.each([
    ['não é membro', null],
    ['saiu do grupo', { role: GroupRole.OWNER, status: MembershipStatus.LEFT }],
    ['foi removido', { role: GroupRole.OWNER, status: MembershipStatus.REMOVED }],
    ['só foi convidado', { role: GroupRole.OWNER, status: MembershipStatus.INVITED }],
  ])('recusa com NOT_FOUND quem %s', async (_caso, membership) => {
    reflector.get.mockReturnValue('member.list');
    prisma.groupMembership.findUnique.mockResolvedValue(membership);

    // `NOT_FOUND`, e não `FORBIDDEN`: quem está fora não pode descobrir que o
    // grupo existe. E o papel guardado numa associação encerrada não vale nada —
    // conferir só `role` faria o ex-dono continuar administrando.
    await expect(guard.canActivate(makeContext(requisicao))).rejects.toThrow(NotFoundException);
  });

  describe('GET /groups/:groupId — guarda e service decidem a mesma coisa', () => {
    /**
     * A rota tem **duas** checagens de status: o guarda, antes, e o
     * `findByIdForMember`, depois. Enquanto cada uma tinha o seu spec, as duas
     * podiam afirmar o contrário uma da outra e ficar verdes — foi o que
     * aconteceu: "`INVITED` continua enxergando" aqui, "`INVITED` leva
     * `NOT_FOUND`" ali, e na prática 404 num grupo que `GET /groups` lista.
     * Este caso é o único lugar em que as duas respondem à mesma pergunta.
     */
    const passou = (promessa: Promise<unknown>): Promise<boolean> =>
      promessa.then(
        () => true,
        () => false,
      );

    it.each(Object.values(MembershipStatus))('status %s', async (status) => {
      reflector.get.mockReturnValue('group.read');
      prisma.groupMembership.findUnique.mockResolvedValue({
        id: 'm1',
        role: GroupRole.MEMBER,
        status,
        joinedAt: null,
        group: {
          id: GROUP,
          type: GroupType.SPONSORED,
          name: 'X',
          slug: 'x',
          createdAt: new Date(),
        },
      });
      const service = new GroupService(prisma as unknown as PrismaService);

      const noGuarda = await passou(guard.canActivate(makeContext(requisicao)));
      const noService = await passou(service.findByIdForMember(USER, GROUP));

      // O conjunto esperado fica escrito, e não só a igualdade entre os dois:
      // "os dois recusam tudo" satisfaz uma comparação e nenhum usuário.
      const vivo = status === MembershipStatus.ACTIVE || status === MembershipStatus.INVITED;
      expect([status, noGuarda, noService]).toEqual([status, vivo, vivo]);
    });
  });

  it('falha alto quando falta contexto, em vez de abrir a rota', async () => {
    reflector.get.mockReturnValue('member.remove');

    // Sem `:groupId` na URL o guarda não tem onde conferir papel, e sem `user` o
    // `JwtAuthGuard` não rodou. Nos dois casos a falha é de montagem — e "deixa
    // passar quando não sei" é como um guard vira decoração.
    await expect(
      guard.canActivate(makeContext({ user: { id: USER }, params: {} })),
    ).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(makeContext({ params: { groupId: GROUP } }))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.groupMembership.findUnique).not.toHaveBeenCalled();
  });
});
