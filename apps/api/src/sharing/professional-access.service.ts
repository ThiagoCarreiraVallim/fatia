import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, type ShareScope } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { AccessAuditService } from './access-audit.service';

/**
 * Resposta única de recusa. É a mesma string para "membership não existe",
 * "não há vínculo", "vínculo revogado" e "escopo não consentido" — distinguir
 * qualquer um deles transformaria a porta num oráculo de existência de aluno,
 * que é exatamente o furo que a #92 fechou no resto do produto.
 */
const NOT_FOUND = 'Membership not found';

@Injectable()
export class ProfessionalAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AccessAuditService,
  ) {}

  /**
   * Resolve o titular que este profissional pode ler, neste escopo, agora.
   *
   * Devolve o `userId` do titular — e só depois disso um service de domínio é
   * chamado, com esse `userId`, exatamente como se fosse o dono. Nada abaixo
   * daqui sabe que grupo existe. É a superfície inteira de leitura cruzada do
   * produto (ADR 014).
   *
   * O chamador passa `membershipId`, **nunca** o `userId` do aluno: identidade
   * de usuário não entra por input em lugar nenhum do produto, e essa regra não
   * abre exceção aqui. O `userId` do titular sai da própria linha de
   * `GroupMembership` — o id de input serve para *encontrar* um candidato, e
   * jamais para autorizar. Quem autoriza é o vínculo, procurado pelo trio
   * (profissional do contexto, titular da linha, grupo da linha). Amarrar o id
   * de input ao que já foi verificado é o que faltava no #204.
   *
   * @param professionalId sempre do contexto autenticado, nunca do corpo
   * @param membershipId   id da linha de `GroupMembership` do aluno
   * @param scope          UM escopo. Nunca uma lista: `hasSome` com array vazio
   *                       casaria com tudo e consentir treino abriria a dieta
   * @param action         nome da operação, para a trilha de auditoria
   *
   * @throws NotFoundException sem vínculo, com vínculo revogado, com escopo não
   *         consentido, ou com membership inexistente/inativa — sempre igual
   */
  async assertReadable(
    professionalId: string,
    membershipId: string,
    scope: ShareScope,
    action: string,
  ): Promise<string> {
    // Passo 1 — de quem é esta linha. NÃO autoriza nada: só diz contra quem a
    // tentativa será registrada e de qual titular/grupo o vínculo tem de ser.
    const membership = await this.prisma.groupMembership.findUnique({
      where: { id: membershipId },
      select: { userId: true, groupId: true, status: true },
    });

    // Membership inexistente não tem titular a quem atribuir a tentativa —
    // gravar exigiria inventar um `subjectUserId`, e a linha de auditoria mais
    // enganosa é a que aponta para a pessoa errada.
    if (!membership) throw new NotFoundException(NOT_FOUND);

    // Passo 2 — a autorização. `status: ACTIVE` conferido aqui e não no `where`
    // do vínculo porque é o que faz o aluno que saiu do grupo parar de ser lido
    // no mesmo instante, mesmo que a revogação em massa da #154 falhe.
    const link =
      membership.status === MembershipStatus.ACTIVE
        ? await this.prisma.professionalLink.findFirst({
            where: {
              professionalId,
              subjectUserId: membership.userId,
              groupId: membership.groupId,
              // Revogação é `revokedAt` preenchido, nunca DELETE. Esquecer este
              // filtro transforma revogar em enfeite sem quebrar o caminho feliz.
              revokedAt: null,
              // `has`, nunca `hasSome`: um escopo por chamada.
              scopes: { has: scope },
            },
            select: { id: true },
          })
        : null;

    // Antes do retorno e antes do throw: "tentou ver o que não podia" é o
    // registro que denuncia profissional malicioso, e some se o record só
    // rodar no caminho feliz.
    await this.audit.record({
      linkId: link?.id ?? null,
      professionalId,
      subjectUserId: membership.userId,
      scope,
      action,
      denied: link === null,
    });

    if (!link) throw new NotFoundException(NOT_FOUND);

    return membership.userId;
  }
}
