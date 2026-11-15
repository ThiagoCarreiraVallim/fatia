import { Injectable } from '@nestjs/common';
import { MembershipStatus, type ShareScope } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

/**
 * "Esse profissional vê esta categoria minha?" — a pergunta que o próprio
 * titular faz sobre o próprio consentimento, para a tela dizer a verdade (o
 * aviso da troca do plano alimentar, #376: "Helena vê no seu diário" ou "fica
 * só no seu diário").
 *
 * Mora em `sharing/` porque os services de domínio não conhecem
 * `ProfessionalLink` (ADR 014, guarda em `consent.service.spec.ts`). Não lê
 * dado de ninguém: responde só sim ou não, sempre a partir do `subjectUserId`.
 * Depende só do Prisma, então um módulo de domínio pode prover a classe sem
 * importar o `SharingModule` (que importa os domínios).
 */
@Injectable()
export class SharedWithService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vínculo vivo com a categoria, na comunidade, e o profissional ainda ativo nela. */
  async sharesWith(params: {
    subjectUserId: string;
    professionalId: string;
    groupId: string;
    scope: ShareScope;
  }): Promise<boolean> {
    const [link, membership] = await Promise.all([
      this.prisma.professionalLink.findFirst({
        where: {
          subjectUserId: params.subjectUserId,
          professionalId: params.professionalId,
          groupId: params.groupId,
          revokedAt: null,
          scopes: { has: params.scope },
        },
        select: { id: true },
      }),
      this.prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId: params.groupId, userId: params.professionalId } },
        select: { status: true },
      }),
    ]);
    return link !== null && membership?.status === MembershipStatus.ACTIVE;
  }
}
