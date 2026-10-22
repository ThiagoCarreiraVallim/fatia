import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipStatus, type GroupRole } from '@fatia/db';
import type { PrismaService } from '../common/prisma.service';
import { can, type GroupAction } from './permissions';

/**
 * O papel de quem mexe no conteúdo da comunidade, conferido de novo no
 * service: o guarda da rota já olhou, mas as tools MCP chamam os services sem
 * passar por ele. Não membro, pendente e comunidade inexistente respondem igual
 * (#92).
 */
export async function requireContentRole(
  prisma: PrismaService,
  userId: string,
  groupId: string,
  action: GroupAction,
  forbidden = 'Seu papel não publica conteúdo nesta comunidade',
): Promise<GroupRole> {
  const m = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true, status: true },
  });
  if (!m || m.status !== MembershipStatus.ACTIVE) throw new NotFoundException('Group not found');
  if (!can(m.role, action)) throw new ForbiddenException(forbidden);
  return m.role;
}

/** O autor edita o que é dele; quem modera edita o de todo mundo. */
export function canEditContent(
  role: GroupRole | null,
  userId: string,
  authorId: string | null,
): boolean {
  if (!role) return false;
  return authorId === userId || can(role, 'content.moderate');
}

export function assertCanEditContent(role: GroupRole, userId: string, authorId: string | null) {
  if (!canEditContent(role, userId, authorId)) {
    throw new ForbiddenException('Só quem publicou, ou o dono, muda este conteúdo');
  }
}
