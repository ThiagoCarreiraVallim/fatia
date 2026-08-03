import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { GroupRole, MembershipStatus } from '@fatia/db';
import { GroupRoleGuard } from '../guards/group-role.guard';
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
