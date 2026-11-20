import { GroupRole, type Prisma } from '@fatia/db';
import type { PrismaService } from '../common/prisma.service';
import { rolesGrantableBy } from './permissions';

/**
 * Convite de equipe é poder emprestado de quem o criou (#404): quem perde o
 * papel, ou sai, leva junto os convites e links de papel de equipe que ainda
 * estavam valendo. O de membro fica: entrar como membro não dá nada a ninguém.
 *
 * `role` = o papel novo de quem criou (`null` = saiu da comunidade). Fica o
 * convite cujo papel ele ainda pode dar. Sem executar, para o mesmo
 * `$transaction` da troca de papel ou da saída. Só os pendentes: aceito,
 * recusado, vencido ou esgotado já não abre porta e fica como está.
 */
export function revokeCreatedTeamInvitesOp(
  prisma: PrismaService,
  groupId: string,
  creatorId: string,
  role: GroupRole | null,
  at: Date,
): Prisma.PrismaPromise<number> {
  const ficam: string[] = [GroupRole.MEMBER, ...(role ? rolesGrantableBy(role) : [])];
  return prisma.$executeRaw`
    UPDATE "GroupInvite" SET "revokedAt" = ${at}
    WHERE "groupId" = ${groupId}
      AND "createdById" = ${creatorId}
      AND "revokedAt" IS NULL
      AND "acceptedAt" IS NULL
      AND "declinedAt" IS NULL
      AND ("expiresAt" IS NULL OR "expiresAt" > ${at})
      AND ("maxUses" IS NULL OR "uses" < "maxUses")
      AND NOT ("role"::text = ANY(${ficam}::text[]))`;
}

/**
 * A especialidade que some junto com o papel (sair, deixar de ser
 * profissional, virar dono) também vai para a trilha da equipe (#404).
 */
export function specialtyClearedAuditOp(
  prisma: PrismaService,
  params: { groupId: string; actorId: string; membershipId: string; from: string },
): Prisma.PrismaPromise<unknown> {
  return prisma.groupAuditLog.create({
    data: {
      groupId: params.groupId,
      actorId: params.actorId,
      action: 'members.specialty',
      targetCount: 1,
      payload: { membershipIds: [params.membershipId], from: params.from, to: null },
    },
  });
}
