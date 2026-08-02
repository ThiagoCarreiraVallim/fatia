import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProfessionalLink, ShareScope } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';

/** Motivos possíveis de revogação. Gravados em `ProfessionalLink.revokedReason`. */
export type RevokeReason =
  'subject' | 'group_owner' | 'left_group' | 'membership_removed' | 'superseded';

/**
 * Escrita do consentimento. Separado do `ProfessionalAccessService` de
 * propósito: ali é a porta de leitura, e misturar as duas coisas faria a leitura
 * carregar métodos que mudam permissão.
 *
 * As rotas e tools que chamam isto são #154 (convite) e #155 (consentimento
 * operável). Esta issue entrega só o modelo e as invariantes.
 */
@Injectable()
export class ProfessionalLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Concede (ou substitui) o consentimento do titular para um profissional
   * dentro de um grupo.
   *
   * `subjectUserId` é sempre o usuário autenticado — **só o titular consente**.
   * Nenhum papel de grupo consente em nome de outra pessoa.
   */
  async grant(params: {
    subjectUserId: string;
    professionalId: string;
    groupId: string;
    scopes: ShareScope[];
  }): Promise<ProfessionalLink> {
    const { subjectUserId, professionalId, groupId, scopes } = params;

    // Array e não `$transaction(async (tx) => ...)`: a ADR 010 registra que
    // transação interativa "falha de forma consistente" atrás do pgbouncer em
    // transaction pooling, e `workout-session.service.ts` já carrega a cicatriz.
    const [, link] = await this.prisma.$transaction([
      // Substituir em vez de atualizar mantém a trilha: cada concessão é uma
      // linha nova, e o que valia antes continua legível com sua janela de
      // vigência. É por isso que não existe @@unique no trio.
      this.prisma.professionalLink.updateMany({
        where: { subjectUserId, professionalId, groupId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'superseded' satisfies RevokeReason },
      }),
      this.prisma.professionalLink.create({
        data: { subjectUserId, professionalId, groupId, scopes },
      }),
    ]);

    return link;
  }

  /**
   * Revoga um vínculo do próprio titular.
   *
   * O `where` inclui `subjectUserId` porque `linkId` chega por input: sem isso,
   * qualquer autenticado revogaria o vínculo de qualquer outro. Vínculo de
   * terceiro responde como inexistente, pelo mesmo motivo de sempre (#92).
   */
  async revokeAsSubject(subjectUserId: string, linkId: string): Promise<ProfessionalLink> {
    const revoked = await this.prisma.professionalLink.updateMany({
      where: { id: linkId, subjectUserId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'subject' satisfies RevokeReason },
    });
    if (revoked.count === 0) throw new NotFoundException('Link not found');

    // `updateMany` não devolve a linha; a releitura é escopada pelo titular.
    const link = await this.prisma.professionalLink.findFirst({
      where: { id: linkId, subjectUserId },
    });
    if (!link) throw new NotFoundException('Link not found');
    return link;
  }

  /**
   * Revoga em massa os vínculos de um grupo que envolvem um usuário — em
   * qualquer das duas pontas. Chamado quando alguém sai ou é removido do grupo:
   * o vínculo é sempre contextual a um `groupId`, então perder o contexto
   * encerra a permissão.
   */
  async revokeAllForMember(
    groupId: string,
    userId: string,
    reason: Extract<RevokeReason, 'left_group' | 'membership_removed'>,
  ): Promise<number> {
    const { count } = await this.prisma.professionalLink.updateMany({
      where: {
        groupId,
        revokedAt: null,
        OR: [{ subjectUserId: userId }, { professionalId: userId }],
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count;
  }

  /** Vínculos ativos que o titular concedeu. Base do painel de consentimento (#155). */
  async listActiveGrantedBy(subjectUserId: string): Promise<ProfessionalLink[]> {
    return this.prisma.professionalLink.findMany({
      where: { subjectUserId, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
    });
  }
}
