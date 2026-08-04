import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { GroupRole, MembershipStatus } from '@fatia/db';
import { GroupRoleGuard } from '../../sharing/guards/group-role.guard';
import { InsightsAddonGuard } from '../guards/insights-addon.guard';
import { StaticEntitlementsService } from '../../billing/static-entitlements.service';
import type { PrismaService } from '../../common/prisma.service';

const GROUP = 'grupo-1';
const OUTRO = 'grupo-2';
const USER = 'user-1';

const makeContext = (request: Record<string, unknown>): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('insights.read é OWNER e só', () => {
  const prisma = { groupMembership: { findUnique: jest.fn() } };
  const reflector = { get: jest.fn().mockReturnValue('insights.read') };
  const guard = new GroupRoleGuard(
    reflector as unknown as Reflector,
    prisma as unknown as PrismaService,
  );
  const requisicao = { user: { id: USER }, params: { groupId: GROUP } };

  it('deixa o dono passar', async () => {
    prisma.groupMembership.findUnique.mockResolvedValue({
      role: GroupRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });

    await expect(guard.canActivate(makeContext(requisicao))).resolves.toBe(true);
  });

  it.each([GroupRole.PROFESSIONAL, GroupRole.CREATOR, GroupRole.MEMBER])(
    'recusa %s no painel agregado',
    async (role) => {
      // O profissional já tem o caminho individual, com consentimento do aluno.
      // Dar-lhe também o agregado seria dois caminhos para a mesma informação,
      // com regras diferentes — e o agregado não pede consentimento a ninguém.
      prisma.groupMembership.findUnique.mockResolvedValue({
        role,
        status: MembershipStatus.ACTIVE,
      });

      await expect(guard.canActivate(makeContext(requisicao))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );

  it('responde NOT_FOUND a quem não é do grupo', async () => {
    prisma.groupMembership.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext(requisicao))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('confere o papel no grupo DA URL', async () => {
    // Ser dono de uma academia não abre o painel da academia do vizinho: a
    // consulta é pelo par (grupo da URL, quem chamou).
    prisma.groupMembership.findUnique.mockResolvedValue({
      role: GroupRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });

    await guard.canActivate(makeContext({ user: { id: USER }, params: { groupId: OUTRO } }));

    expect(prisma.groupMembership.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { groupId_userId: { groupId: OUTRO, userId: USER } } }),
    );
  });
});

describe('InsightsAddonGuard — o add-on é conferido na rota, não na tela', () => {
  const guardCom = (habilitados: string) => {
    const config = { get: jest.fn().mockReturnValue(habilitados) };
    return new InsightsAddonGuard(
      new StaticEntitlementsService(config as unknown as ConfigService),
    );
  };

  it('deixa passar grupo com o add-on', async () => {
    const guard = guardCom(`outro-grupo,${GROUP}`);

    await expect(guard.canActivate(makeContext({ params: { groupId: GROUP } }))).resolves.toBe(
      true,
    );
  });

  it('responde NOT_FOUND a grupo sem o add-on, e não 402', async () => {
    // Não vale confirmar que o painel existe para quem não contratou — e a UI
    // já sabe o que oferecer sem precisar de um código de status para descobrir.
    const guard = guardCom(OUTRO);

    await expect(
      guard.canActivate(makeContext({ params: { groupId: GROUP } })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lista vazia não libera todo mundo', async () => {
    // `''.split(',')` devolve `['']`. Um `includes` frouxo sobre isso, com um
    // `groupId` vazio, liberaria o painel pago para o mundo.
    const guard = guardCom('');

    await expect(
      guard.canActivate(makeContext({ params: { groupId: GROUP } })),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      guard.canActivate(makeContext({ params: { groupId: '' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('falha alto quando a rota não tem grupo para conferir', async () => {
    const guard = guardCom(GROUP);

    await expect(guard.canActivate(makeContext({ params: {} }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('ignora espaço em volta dos ids do env', async () => {
    const guard = guardCom(` ${OUTRO} , ${GROUP} `);

    await expect(guard.canActivate(makeContext({ params: { groupId: GROUP } }))).resolves.toBe(
      true,
    );
  });
});
