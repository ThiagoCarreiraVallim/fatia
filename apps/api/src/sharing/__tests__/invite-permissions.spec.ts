import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GroupRole, MembershipStatus } from '@prisma/client';
import type { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../../notifications/email.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { InviteService } from '../invite.service';
import type { MembershipService } from '../membership.service';
import * as permissions from '../permissions';

/**
 * Quem convida é a matriz (`sharing/permissions.ts`), e não uma lista no service.
 *
 * O `InviteService` fixava "OWNER ou PROFESSIONAL". Mudar `invite.create` na
 * matriz mudava a rota (o `GroupRoleGuard` lê a matriz) e não o service — que é a
 * porta que vale quando chamado de outro lugar. Os dois tinham de concordar por
 * coincidência.
 */
describe('InviteService — papel pela matriz de permissões', () => {
  function build(role: GroupRole, status: MembershipStatus = MembershipStatus.ACTIVE) {
    const prisma = {
      groupMembership: { findUnique: jest.fn().mockResolvedValue({ role, status }) },
      groupInvite: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new InviteService(
      prisma as unknown as PrismaService,
      {} as MembershipService,
      {} as EmailService,
      { get: () => 'https://fatia.test/' } as unknown as ConfigService,
      silentNotifications,
    );
    return { service, prisma };
  }

  afterEach(() => jest.restoreAllMocks());

  it('segue a matriz: se ela der invite.create a um papel, o service deixa', async () => {
    const can = jest
      .spyOn(permissions, 'can')
      .mockImplementation((role, action) => role === GroupRole.CREATOR || action === 'group.read');
    const { service } = build(GroupRole.CREATOR);

    await expect(service.list('criadora', 'g1')).resolves.toEqual([]);
    expect(can).toHaveBeenCalledWith(GroupRole.CREATOR, 'invite.create');
  });

  it('com a matriz de hoje, criador e membro recebem 403', async () => {
    for (const role of [GroupRole.CREATOR, GroupRole.MEMBER]) {
      await expect(build(role).service.list('x', 'g1')).rejects.toBeInstanceOf(ForbiddenException);
    }
    await expect(build(GroupRole.PROFESSIONAL).service.list('x', 'g1')).resolves.toEqual([]);
  });

  it('revogar confere invite.revoke, e associação que não está ativa é 404', async () => {
    const can = jest.spyOn(permissions, 'can').mockReturnValue(false);
    await expect(build(GroupRole.OWNER).service.revoke('x', 'g1', 'i1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(can).toHaveBeenCalledWith(GroupRole.OWNER, 'invite.revoke');

    can.mockRestore();
    await expect(
      build(GroupRole.OWNER, MembershipStatus.LEFT).service.list('x', 'g1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
