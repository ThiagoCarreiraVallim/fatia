import { MembershipStatus } from '@fatia/db';
import type { PrismaService } from '../common/prisma.service';
import { seesOnlyAccompanied } from './permissions';

/**
 * "Profissionais veem só quem acompanham" (#404), para as listas: com a opção
 * ligada e quem olha sendo profissional, devolve os ids das associações que
 * ele acompanha nesta comunidade; senão, `null` (sem recorte). A porta de
 * leitura (`assertReadable`) faz a mesma conta, pessoa por pessoa.
 */
export async function accompaniedOnly(
  prisma: PrismaService,
  viewerId: string,
  groupId: string,
): Promise<Set<string> | null> {
  const eu = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: viewerId } },
    select: { id: true, role: true, group: { select: { proSeeOnlyAssigned: true } } },
  });
  if (!eu || !seesOnlyAccompanied(eu.role, eu.group.proSeeOnlyAssigned)) return null;
  const meus = await prisma.groupMembership.findMany({
    where: { groupId, accompaniedById: eu.id, status: MembershipStatus.ACTIVE },
    select: { id: true },
  });
  return new Set(meus.map((m) => m.id));
}
