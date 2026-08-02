import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GroupRole, MembershipStatus, type ShareScope } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { ProfessionalLinkService } from './professional-link.service';

/** Mesma resposta para "grupo não existe" e "não sou membro dele" (#92). */
const NOT_FOUND = 'Group not found';
/** Mesma resposta para membership inexistente e de outro grupo (#204). */
const MEMBERSHIP_NOT_FOUND = 'Membership not found';

/** Papéis que um convite pode conceder. `OWNER` nunca entra por aqui. */
export type GrantableRole = Exclude<GroupRole, 'OWNER'>;

export interface MemberView {
  membershipId: string;
  name: string;
  role: GroupRole;
  status: MembershipStatus;
  joinedAt: Date | null;
  /**
   * Escopos que este aluno consentiu **a quem está perguntando**. Só aparece
   * para o `PROFESSIONAL`, e só sobre o vínculo dele: ninguém vê o que o aluno
   * consentiu a outro profissional.
   */
  scopesGrantedToMe?: ShareScope[];
}

export interface MembershipResult {
  membershipId: string;
  groupId: string;
  status: MembershipStatus;
  role: GroupRole;
  /** Vínculos que a operação revogou. Zero é resultado normal e esperado. */
  revokedLinks: number;
}

/**
 * Entrada, saída e composição do grupo.
 *
 * Duas invariantes governam este arquivo, e as duas vêm da ADR 014:
 *
 * 1. **Entrar concede zero.** Nenhum caminho daqui cria `ProfessionalLink`.
 *    Quem lê dado de saúde é quem tem vínculo consentido pelo titular (#155).
 * 2. **Sair revoga.** Perder o contexto do grupo encerra todo vínculo daquele
 *    `groupId`, na mesma transação da mudança de status — senão existe uma
 *    janela em que a membership já acabou e a permissão ainda vale.
 */
@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: ProfessionalLinkService,
  ) {}

  /**
   * Pedido de entrada do próprio usuário, pelo slug do grupo.
   *
   * O aceite é do aluno **e** do dono: a pessoa pede (ato explícito dela, nunca
   * efeito de abrir um link) e o dono aprova. Ninguém entra em grupo sem saber,
   * e ninguém coloca outra pessoa dentro de um grupo — a identidade de quem
   * entra sai sempre do contexto autenticado, jamais do input.
   *
   * O papel é sempre `MEMBER`. Quem vira `PROFESSIONAL` ou `CREATOR` é definido
   * pelo dono no momento da aprovação: um papel que pode receber consentimento
   * de leitura não pode ser autoatribuído.
   */
  async requestJoin(userId: string, slug: string): Promise<MembershipResult> {
    const group = await this.prisma.group.findUnique({ where: { slug } });
    if (!group) throw new NotFoundException(NOT_FOUND);

    const existente = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
    });

    if (
      existente?.status === MembershipStatus.ACTIVE ||
      existente?.status === MembershipStatus.INVITED
    ) {
      throw new ConflictException(
        existente.status === MembershipStatus.ACTIVE
          ? 'Você já faz parte deste grupo'
          : 'Seu pedido para entrar neste grupo já está aguardando aprovação',
      );
    }

    // Reentrada é UPDATE, por causa do `@@unique([groupId, userId])`. O
    // `leftAt` da saída anterior fica de pé até a aprovação e some no `joinedAt`
    // novo: a trilha que importa é a do `ProfessionalLink`, que é imutável.
    const membership = existente
      ? await this.prisma.groupMembership.update({
          where: { id: existente.id },
          data: { status: MembershipStatus.INVITED, role: GroupRole.MEMBER },
        })
      : await this.prisma.groupMembership.create({
          data: {
            groupId: group.id,
            userId,
            role: GroupRole.MEMBER,
            status: MembershipStatus.INVITED,
          },
        });

    return {
      membershipId: membership.id,
      groupId: group.id,
      status: membership.status,
      role: membership.role,
      revokedLinks: 0,
    };
  }

  /**
   * O dono aprova um pedido de entrada e define o papel.
   *
   * `membershipId` vem do corpo/URL, e por isso é conferido contra o `groupId`
   * já verificado — ser dono de um grupo não autoriza mexer na membership de
   * outro (#204).
   */
  async approve(
    ownerId: string,
    groupId: string,
    membershipId: string,
    role: GrantableRole = GroupRole.MEMBER,
  ): Promise<MembershipResult> {
    await this.assertOwner(ownerId, groupId);

    const alvo = await this.prisma.groupMembership.findUnique({ where: { id: membershipId } });
    if (!alvo || alvo.groupId !== groupId || alvo.status !== MembershipStatus.INVITED) {
      throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
    }

    const membership = await this.prisma.groupMembership.update({
      where: { id: membershipId },
      data: { status: MembershipStatus.ACTIVE, role, joinedAt: new Date(), leftAt: null },
    });

    return {
      membershipId: membership.id,
      groupId,
      status: membership.status,
      role: membership.role,
      revokedLinks: 0,
    };
  }

  /**
   * Membros do grupo, conforme o papel de quem olha — e sempre metadado de
   * associação, nunca dado de saúde.
   *
   * - `OWNER` e `PROFESSIONAL` veem o grupo inteiro (o dono administra; o
   *   profissional precisa saber a quem oferecer plano e quem o autorizou).
   * - `MEMBER` e `CREATOR` veem só quem administra ou atende — a lista de
   *   alunos de uma academia é informação sobre pessoas, e não é do interesse
   *   de outro aluno.
   */
  async listMembers(userId: string, groupId: string): Promise<MemberView[]> {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);

    const veTodos = eu.role === GroupRole.OWNER || eu.role === GroupRole.PROFESSIONAL;

    const membros = await this.prisma.groupMembership.findMany({
      where: {
        groupId,
        status: { in: [MembershipStatus.INVITED, MembershipStatus.ACTIVE] },
        ...(veTodos
          ? {}
          : {
              OR: [
                { role: { in: [GroupRole.OWNER, GroupRole.PROFESSIONAL, GroupRole.CREATOR] } },
                { userId },
              ],
            }),
      },
      include: { user: { select: { name: true } } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    // Uma consulta só para todos os vínculos ativos concedidos a este
    // profissional neste grupo — e não uma por membro.
    const vinculos =
      eu.role === GroupRole.PROFESSIONAL
        ? await this.prisma.professionalLink.findMany({
            where: { groupId, professionalId: userId, revokedAt: null },
            select: { subjectUserId: true, scopes: true },
          })
        : [];
    const porTitular = new Map(vinculos.map((v) => [v.subjectUserId, v.scopes]));

    return membros.map((m) => ({
      membershipId: m.id,
      name: m.user.name,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
      ...(eu.role === GroupRole.PROFESSIONAL
        ? { scopesGrantedToMe: porTitular.get(m.userId) ?? [] }
        : {}),
    }));
  }

  /**
   * Sair do grupo. **Não passa pelo dono e o dono não pode impedir**: a
   * autorização é a posse da própria membership, e nenhuma linha aqui consulta
   * papel para decidir se a saída pode acontecer.
   *
   * O dono é a única exceção, e ela não é sobre permissão: grupo sem dono fica
   * órfão com cobrança viva (#158). Ele transfere ou apaga o grupo.
   */
  async leave(userId: string, groupId: string): Promise<MembershipResult> {
    const membership = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (
      !membership ||
      (membership.status !== MembershipStatus.ACTIVE &&
        membership.status !== MembershipStatus.INVITED)
    ) {
      throw new NotFoundException(NOT_FOUND);
    }

    if (membership.role === GroupRole.OWNER) {
      throw new ConflictException(
        'O dono não pode sair do próprio grupo. Transfira a propriedade ou apague o grupo.',
      );
    }

    return this.encerrar(membership.id, groupId, userId, MembershipStatus.LEFT, 'left_group');
  }

  /**
   * O dono remove um membro. Mesmo efeito de `leave()` sobre os vínculos — só
   * muda o `revokedReason`, porque quem saiu e quem foi removido precisam ser
   * distinguíveis na trilha.
   */
  async removeMember(
    ownerId: string,
    groupId: string,
    membershipId: string,
  ): Promise<MembershipResult> {
    await this.assertOwner(ownerId, groupId);

    const alvo = await this.prisma.groupMembership.findUnique({ where: { id: membershipId } });
    // `alvo.groupId !== groupId`: o id vem por input e precisa ser amarrado ao
    // grupo já verificado, senão ser dono de um grupo vira poder de remover
    // gente de qualquer outro (#204).
    if (
      !alvo ||
      alvo.groupId !== groupId ||
      (alvo.status !== MembershipStatus.ACTIVE && alvo.status !== MembershipStatus.INVITED)
    ) {
      throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
    }

    if (alvo.role === GroupRole.OWNER) {
      throw new ConflictException('O dono não pode ser removido do próprio grupo');
    }

    return this.encerrar(
      alvo.id,
      groupId,
      alvo.userId,
      MembershipStatus.REMOVED,
      'membership_removed',
    );
  }

  /**
   * Fim da associação e revogação em massa, **na mesma transação**.
   *
   * Duas escritas separadas deixariam uma janela — curta, mas real — em que a
   * membership já acabou e o `ProfessionalLink` ainda autoriza leitura de dado
   * de saúde. A revogação é a primeira linha de defesa; a checagem dos dois
   * lados no `assertReadable` é a segunda, e as duas precisam existir: se o
   * `updateMany` errar o filtro, é a segunda que segura.
   *
   * Array e não transação interativa (pgbouncer, ADR 010).
   */
  private async encerrar(
    membershipId: string,
    groupId: string,
    userId: string,
    status: Extract<MembershipStatus, 'LEFT' | 'REMOVED'>,
    reason: 'left_group' | 'membership_removed',
  ): Promise<MembershipResult> {
    const agora = new Date();

    const [membership, revogados] = await this.prisma.$transaction([
      this.prisma.groupMembership.update({
        where: { id: membershipId },
        data: { status, leftAt: agora },
      }),
      // Sem `professionalId` no filtro de propósito: o vínculo é contextual ao
      // grupo, então sair encerra TODOS os daquele grupo. Filtrar por um
      // profissional específico deixaria os outros lendo depois da saída.
      this.links.revokeAllForMemberOp(groupId, userId, reason, agora),
    ]);

    return {
      membershipId: membership.id,
      groupId,
      status: membership.status,
      role: membership.role,
      revokedLinks: revogados.count,
    };
  }

  /**
   * Só o dono administra. Não-membro recebe `NOT_FOUND` (não pode descobrir que
   * o grupo existe); membro comum recebe `FORBIDDEN`, porque para ele não há
   * existência a esconder — ele já está lá dentro.
   */
  private async assertOwner(userId: string, groupId: string): Promise<void> {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);
    if (eu.role !== GroupRole.OWNER) {
      throw new ForbiddenException('Apenas o dono do grupo pode fazer isso');
    }
  }
}
