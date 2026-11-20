import { NotFoundException } from '@nestjs/common';
import { GroupRole, MembershipStatus } from '@fatia/db';
import type { PrismaService } from '../common/prisma.service';
import { requireContentRole } from './content-roles';
import { accompaniedOnly } from './team-reach';
import type { GroupAction } from './permissions';

/** A mesma recusa da porta de leitura (#92): não diz se a pessoa existe. */
export const MEMBER_NOT_FOUND = 'Membership not found';

export interface MemberFileTarget {
  viewerRole: GroupRole;
  subjectUserId: string;
  subjectRole: GroupRole;
  membershipId: string;
  joinedAt: Date | null;
}

/**
 * A pessoa da ficha, amarrada à comunidade da URL (#402).
 *
 * Quem olha precisa ter a ação no papel (conferido de novo aqui, além do
 * guarda), e a associação do `:membershipId` precisa ser DESTE `:groupId` e
 * estar ativa. Associação de outra comunidade responde igual a inexistente: o
 * id da URL só encontra, nunca autoriza.
 */
export async function resolveMemberTarget(
  prisma: PrismaService,
  viewerId: string,
  groupId: string,
  membershipId: string,
  action: GroupAction,
): Promise<MemberFileTarget> {
  const viewerRole = await requireContentRole(
    prisma,
    viewerId,
    groupId,
    action,
    'Seu papel não abre a ficha das pessoas',
  );
  const m = await prisma.groupMembership.findUnique({
    where: { id: membershipId },
    select: { groupId: true, userId: true, role: true, status: true, joinedAt: true },
  });
  if (!m || m.groupId !== groupId || m.status !== MembershipStatus.ACTIVE) {
    throw new NotFoundException(MEMBER_NOT_FOUND);
  }
  // "Profissionais veem só quem acompanham" (#404): a ficha de quem não é dele
  // responde como inexistente, igual à porta de leitura.
  const meus = await accompaniedOnly(prisma, viewerId, groupId);
  if (meus && m.role === GroupRole.MEMBER && !meus.has(membershipId)) {
    throw new NotFoundException(MEMBER_NOT_FOUND);
  }
  return {
    viewerRole,
    subjectUserId: m.userId,
    subjectRole: m.role,
    membershipId,
    joinedAt: m.joinedAt,
  };
}
