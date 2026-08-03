import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, ShareScope } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { ProfessionalLinkService } from './professional-link.service';
import { canReceiveLink } from './permissions';

/** Mesma resposta para membership inexistente, de outro grupo e de grupo alheio (#92, #204). */
const NOT_FOUND = 'Membership not found';

/** Quantas linhas da trilha a leitura devolve por vez. */
const LOG_PAGE_SIZE = 50;
const LOG_MAX_PAGE_SIZE = 200;

/**
 * Um consentimento vivo, do ponto de vista do titular.
 *
 * O profissional é referenciado pela **associação dele no grupo**, nunca pelo
 * `userId`: identidade de usuário não entra nem sai por input/output em lugar
 * nenhum do produto, e o painel de consentimento não abre exceção. É pelo mesmo
 * `professionalMembershipId` que se concede de novo.
 */
export interface ConsentView {
  /**
   * `null` só na resposta de uma concessão vazia: `[]` revoga, e depois dela não
   * existe vínculo vivo a que se referir. Em `listMine` nunca é nulo — ali toda
   * linha é um consentimento vigente.
   */
  linkId: string | null;
  groupId: string;
  groupName: string;
  professionalMembershipId: string;
  professionalName: string;
  scopes: ShareScope[];
  /** `null` pelo mesmo motivo de `linkId`: não há concessão em vigor. */
  grantedAt: Date | null;
}

/** Uma linha de "quem olhou meu dado". Inclui as tentativas negadas. */
export interface AccessLogView {
  at: Date;
  /** Operação do produto: "list_workout_sessions", "get_student_progress". */
  action: string;
  scope: ShareScope;
  /** `true` = tentou e foi barrado. É o registro que denuncia mau uso. */
  denied: boolean;
  /** Nome de quem tentou. `null` se a conta do profissional já não existe. */
  professionalName: string | null;
}

/**
 * Consentimento operável (#155): conceder, ver, revogar e ler a trilha.
 *
 * Separado do `ProfessionalAccessService` de propósito — ali é a porta de
 * **leitura**, e misturar as duas coisas faria a leitura carregar métodos que
 * mudam permissão. E separado do `ProfessionalLinkService` porque este é a
 * persistência do vínculo; aqui ficam as regras de quem pode conceder a quem.
 *
 * Duas invariantes governam o arquivo:
 *
 * 1. **Só o titular consente.** `subjectUserId` vem sempre do contexto
 *    autenticado. Não existe caminho que crie `ProfessionalLink` para outra
 *    pessoa — nem o dono da academia consente pelo aluno.
 * 2. **Não existe consentimento "para o grupo".** O destinatário é sempre uma
 *    pessoa, dentro de um grupo. Quem tem nutricionista e personal na mesma
 *    academia consente alimentação a um sem consentir ao outro (ADR 014).
 */
@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: ProfessionalLinkService,
  ) {}

  /**
   * Concede (ou substitui) o consentimento do titular a um profissional.
   *
   * O destinatário entra como `professionalMembershipId` — o id da associação
   * **dele** no grupo. Grupo e identidade do profissional saem dessa linha, e
   * não do input: é o mesmo desenho da porta de leitura, pelo mesmo motivo
   * (#204). O que o input escolhe é um candidato; quem autoriza é a conferência
   * de que o titular está naquele mesmo grupo.
   *
   * Lista vazia é entrada válida e significa "nada": ela **revoga** o vínculo
   * vigente e não cria linha nenhuma. Recusá-la faria a UI ter de tratar
   * "desmarquei o último toggle" como caso especial; gravá-la como concessão de
   * zero escopos faria o profissional ficar no painel de quem tem acesso sem
   * ter acesso. Escopos repetidos são normalizados.
   */
  async grant(
    subjectUserId: string,
    professionalMembershipId: string,
    scopes: ShareScope[],
  ): Promise<ConsentView> {
    const alvo = await this.prisma.groupMembership.findUnique({
      where: { id: professionalMembershipId },
      select: { id: true, userId: true, groupId: true, role: true, status: true },
    });
    if (!alvo) throw new NotFoundException(NOT_FOUND);

    // Antes de qualquer coisa sobre o alvo: quem chamou está neste grupo? Sem
    // esta checagem, um autenticado qualquer descobriria papel e existência de
    // associações de grupos de que não faz parte, uma sondagem por vez.
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: alvo.groupId, userId: subjectUserId } },
      select: { status: true },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);

    // Daqui para baixo o erro pode ser específico: quem chama já está dentro do
    // grupo, então não há existência a esconder dele.
    if (alvo.userId === subjectUserId) {
      throw new ConflictException('Não faz sentido consentir acesso aos próprios dados');
    }
    if (alvo.status !== MembershipStatus.ACTIVE || !canReceiveLink(alvo.role)) {
      throw new ConflictException(
        'Só um profissional ativo do grupo pode receber acesso aos seus dados',
      );
    }

    const escopos = normalizarEscopos(scopes);
    const vinculo = {
      subjectUserId,
      professionalId: alvo.userId,
      groupId: alvo.groupId,
    };

    // Lista vazia **revoga**, e não grava concessão de nada: é o que
    // `grant_data_sharing` promete ("enviar [] equivale a revogar") e o que
    // `list_data_sharing` promete do outro lado ("lista vazia significa que
    // ninguém tem acesso"). Uma linha viva com zero escopos deixaria o
    // profissional para sempre no painel de "quem tem acesso" sem acesso a
    // nada — as duas promessas se contradizendo na cara do titular, que teria
    // de revogar o que já zerou.
    const link =
      escopos.length === 0
        ? await this.links.revokeLiveGrant(vinculo)
        : await this.links.grant({ ...vinculo, scopes: escopos });

    const [grupo, profissional] = await Promise.all([
      this.prisma.group.findUnique({ where: { id: alvo.groupId }, select: { name: true } }),
      this.prisma.user.findUnique({ where: { id: alvo.userId }, select: { name: true } }),
    ]);

    // O vínculo devolvido por `revokeLiveGrant` é o que **acabou de morrer**:
    // ele não entra na resposta como se estivesse valendo.
    const vigente = escopos.length === 0 ? null : link;

    return {
      linkId: vigente?.id ?? null,
      groupId: alvo.groupId,
      groupName: grupo?.name ?? '',
      professionalMembershipId: alvo.id,
      professionalName: profissional?.name ?? '',
      scopes: escopos,
      grantedAt: vigente?.grantedAt ?? null,
    };
  }

  /**
   * Revoga um consentimento do próprio titular. Vale a partir da requisição
   * seguinte — a janela é de **uma** requisição, e é o que `/privacy` promete,
   * em vez de "instantâneo".
   *
   * A linha **não** é apagada: `revokedAt` é o que responde "quem teve acesso a
   * quê, quando".
   */
  async revoke(
    subjectUserId: string,
    linkId: string,
  ): Promise<{ linkId: string; revokedAt: Date }> {
    const link = await this.links.revokeAsSubject(subjectUserId, linkId);
    // `revokedAt` acabou de ser preenchido pelo service; o `??` existe só para
    // o tipo, e um `new Date()` aqui seria uma data inventada.
    return { linkId: link.id, revokedAt: link.revokedAt ?? new Date() };
  }

  /** Consentimentos vivos do titular. É a resposta a "quem consegue ver o quê de mim". */
  async listMine(subjectUserId: string): Promise<ConsentView[]> {
    const links = await this.links.listActiveGrantedBy(subjectUserId);
    if (links.length === 0) return [];

    // Uma consulta para todas as associações dos profissionais envolvidos, e não
    // uma por vínculo. O par (grupo, profissional) é único, então o índice
    // `groupId_userId` resolve cada linha.
    const [memberships, grupos] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: {
          groupId: { in: [...new Set(links.map((l) => l.groupId))] },
          userId: { in: [...new Set(links.map((l) => l.professionalId))] },
        },
        select: { id: true, groupId: true, userId: true, user: { select: { name: true } } },
      }),
      this.prisma.group.findMany({
        where: { id: { in: [...new Set(links.map((l) => l.groupId))] } },
        select: { id: true, name: true },
      }),
    ]);

    const porGrupoEUsuario = new Map(memberships.map((m) => [`${m.groupId}:${m.userId}`, m]));
    const nomeDoGrupo = new Map(grupos.map((g) => [g.id, g.name]));

    return links.map((link) => {
      const membership = porGrupoEUsuario.get(`${link.groupId}:${link.professionalId}`);
      return {
        linkId: link.id,
        groupId: link.groupId,
        groupName: nomeDoGrupo.get(link.groupId) ?? '',
        // Vazio quando o profissional já saiu do grupo: o vínculo continua
        // listado porque ele ainda é do titular, e a porta de leitura já barra.
        professionalMembershipId: membership?.id ?? '',
        professionalName: membership?.user.name ?? '',
        scopes: link.scopes,
        grantedAt: link.grantedAt,
      };
    });
  }

  /**
   * "Quem olhou meu dado" — a trilha do titular, negativas incluídas.
   *
   * Escopada por `subjectUserId` e nunca por `linkId` de input: a trilha é do
   * titular, e um id de vínculo vindo de fora daria a qualquer autenticado a
   * leitura da trilha alheia.
   */
  async listAccessLog(subjectUserId: string, limit = LOG_PAGE_SIZE): Promise<AccessLogView[]> {
    const linhas = await this.prisma.professionalAccessLog.findMany({
      where: { subjectUserId },
      orderBy: { at: 'desc' },
      take: Math.min(Math.max(limit, 1), LOG_MAX_PAGE_SIZE),
      select: { at: true, action: true, scope: true, denied: true, professionalId: true },
    });
    if (linhas.length === 0) return [];

    // `ProfessionalAccessLog.professionalId` é string pura, sem FK: se o
    // profissional apagar a conta, o titular continua conseguindo responder
    // "quem olhou meu dado". O preço é resolver o nome à parte, e aceitar que
    // ele pode não existir mais.
    const nomes = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...new Set(linhas.map((l) => l.professionalId))] } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name]),
    );

    return linhas.map((linha) => ({
      at: linha.at,
      action: linha.action,
      scope: linha.scope,
      denied: linha.denied,
      professionalName: nomes.get(linha.professionalId) ?? null,
    }));
  }
}

/**
 * Remove repetições mantendo a ordem do enum. Ordem estável importa porque o
 * array vai para o banco e volta para a UI — duas concessões idênticas
 * produzirem arrays diferentes faria "mudou alguma coisa?" virar chute.
 */
function normalizarEscopos(scopes: ShareScope[]): ShareScope[] {
  const pedidos = new Set(scopes);
  return Object.values(ShareScope).filter((scope) => pedidos.has(scope));
}
