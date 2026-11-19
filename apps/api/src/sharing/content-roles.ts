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

/**
 * O papel de hoje de cada autor nesta comunidade, para o "Bruno (dono)" da
 * vitrine (#396). Quem saiu ou apagou a conta não tem papel: a tela mostra só
 * o nome (ou "Equipe").
 */
export async function authorRoles(
  prisma: PrismaService,
  groupId: string,
  authorIds: (string | null)[],
): Promise<Map<string, GroupRole>> {
  const ids = [...new Set(authorIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.groupMembership.findMany({
    where: { groupId, userId: { in: ids }, status: MembershipStatus.ACTIVE },
    select: { userId: true, role: true },
  });
  return new Map(rows.map((r) => [r.userId, r.role]));
}
