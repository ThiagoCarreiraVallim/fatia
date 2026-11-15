import { Injectable } from '@nestjs/common';
import { MembershipStatus, type ShareScope } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { canReceiveLink } from './permissions';

/**
 * "Quem da equipe vê esta categoria minha?" — a pergunta que o próprio
 * titular faz sobre o próprio consentimento, para a tela dizer a verdade (o
 * aviso da troca do plano alimentar, #376).
 *
 * Mesma regra da porta única (`ProfessionalAccessService.assertReadable`):
 * vínculo vivo com a categoria, o titular ativo na comunidade do vínculo e o
 * profissional ativo nela com papel de equipe. Errar para menos aqui seria
 * dizer "fica só no seu diário" a quem está sendo lido.
 *
 * Mora em `sharing/` porque os services de domínio não conhecem
 * `ProfessionalLink` (ADR 014, guarda em `consent.service.spec.ts`). Depende só
 * do Prisma, então um módulo de domínio pode prover a classe sem importar o
 * `SharingModule` (que importa os domínios).
 */
@Injectable()
export class SharedWithService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ids dos profissionais que hoje leem `scope` do titular. */
  async viewersOf(subjectUserId: string, scope: ShareScope): Promise<string[]> {
    const links = await this.prisma.professionalLink.findMany({
      where: { subjectUserId, revokedAt: null, scopes: { has: scope } },
      select: { professionalId: true, groupId: true },
    });
    if (links.length === 0) return [];
    const memberships = await this.prisma.groupMembership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        OR: links.flatMap((l) => [
          { groupId: l.groupId, userId: subjectUserId },
          { groupId: l.groupId, userId: l.professionalId },
        ]),
      },
      select: { groupId: true, userId: true, role: true },
    });
    const active = new Map(memberships.map((m) => [`${m.groupId}:${m.userId}`, m.role]));
    const viewers = links.filter((l) => {
      const professionalRole = active.get(`${l.groupId}:${l.professionalId}`);
      return (
        active.has(`${l.groupId}:${subjectUserId}`) &&
        professionalRole !== undefined &&
        canReceiveLink(professionalRole)
      );
    });
    return [...new Set(viewers.map((l) => l.professionalId))];
  }
}
