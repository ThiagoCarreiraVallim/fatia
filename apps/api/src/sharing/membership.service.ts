import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupRole,
  JoinPolicy,
  MembershipStatus,
  type GroupMembership,
  type Prisma,
  type ShareScope,
} from '@fatia/db';
import { membershipsWithEffectiveSeat } from '../billing/subscription-entitlements.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { joinApprovedNotice, joinRequestNotice } from './community-notices';
import { normalizarEscopos } from './consent-scopes';
import { canReceiveLink } from './permissions';
import { ProfessionalLinkService } from './professional-link.service';

/** Mesma resposta para "grupo não existe" e "não sou membro dele" (#92). */
const NOT_FOUND = 'Group not found';
/** Mesma resposta para membership inexistente e de outro grupo (#204). */
const MEMBERSHIP_NOT_FOUND = 'Membership not found';

/**
 * Quem foi banido não volta pelo código nem por convite (Fase 8b). A pessoa já
 * sabe que a comunidade existe: a resposta diz o porquê, sem esconder.
 */
export function assertNotBanned(status: MembershipStatus | null | undefined): void {
  if (status === MembershipStatus.BANNED) {
    throw new ForbiddenException('Você não pode entrar nesta comunidade');
  }
}

/** Papéis que um convite pode conceder. `OWNER` nunca entra por aqui. */
export type GrantableRole = Exclude<GroupRole, 'OWNER'>;

export interface MemberView {
  membershipId: string;
  name: string;
  role: GroupRole;
  status: MembershipStatus;
  joinedAt: Date | null;
  /**
   * Escopos que este membro consentiu **a quem está perguntando**. Só aparece
   * para quem vê o grupo inteiro (`OWNER` e `PROFESSIONAL`, que recebem vínculo
   * desde a ADR 026), e só sobre o vínculo dele: ninguém vê o que o membro
   * consentiu a outra pessoa da equipe.
   */
  scopesGrantedToMe?: ShareScope[];
  /**
   * A comunidade paga o PRO desta pessoa (ADR 025). Só para o `OWNER` e o
   * `PROFESSIONAL`. A participação individual nas estatísticas (`statsOptIn`)
   * **não** sai para ninguém: diria quem entra no agregado (THREAT_MODEL §9).
   */
  hasAiSeat?: boolean;
}

/** O que a pessoa escolheu compartilhar ao entrar (ADR 026). Nada por padrão. */
export interface JoinConsent {
  scopes: ShareScope[];
  statsOptIn: boolean;
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
 * Duas invariantes governam este arquivo (ADR 014, revista pela ADR 026):
 *
 * 1. **Entrar concede só o que a pessoa escolheu.** Os vínculos que nascem na
 *    entrada são exatamente os escopos marcados na tela de consentimento —
 *    nada vem marcado, e recusar tudo também entra. Quem lê dado de saúde é
 *    sempre quem tem vínculo consentido pelo titular.
 * 2. **Sair revoga.** Perder o contexto do grupo encerra todo vínculo daquele
 *    `groupId`, na mesma transação da mudança de status — senão existe uma
 *    janela em que a membership já acabou e a permissão ainda vale.
 */
@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: ProfessionalLinkService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Entrada do próprio usuário pelo código (`slug`) da comunidade.
   *
   * Ninguém coloca outra pessoa dentro de um grupo: a identidade de quem entra
   * sai sempre do contexto autenticado, jamais do input. O papel é sempre
   * `MEMBER` — papel de equipe, que recebe consentimento de leitura, nunca é
   * autoatribuído (vem do convite ou da aprovação do dono).
   *
   * A política da comunidade decide o resto (ADR 026):
   * - `OPEN`: entra na hora, e o consentimento escolhido já vira vínculo;
   * - `APPROVAL`: fica pendente com o consentimento guardado, e os vínculos só
   *   nascem na aprovação;
   * - `INVITE_ONLY`: o código não abre a porta — responde como inexistente.
   */
  async requestJoin(
    userId: string,
    slug: string,
    consent: JoinConsent = { scopes: [], statsOptIn: false },
  ): Promise<MembershipResult> {
    const group = await this.prisma.group.findUnique({ where: { slug } });
    if (!group || group.joinPolicy === JoinPolicy.INVITE_ONLY) {
      throw new NotFoundException(NOT_FOUND);
    }

    const existente = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
    });
    assertNotBanned(existente?.status);

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

    if (group.joinPolicy === JoinPolicy.OPEN) {
      const ops = await this.activationOps({
        groupId: group.id,
        userId,
        role: GroupRole.MEMBER,
        consent,
        at: new Date(),
      });
      const [membership] = (await this.prisma.$transaction(ops)) as [GroupMembership];
      return {
        membershipId: membership.id,
        groupId: group.id,
        status: membership.status,
        role: membership.role,
        revokedLinks: 0,
      };
    }

    const escopos = normalizarEscopos(consent.scopes);
    const pedido = {
      status: MembershipStatus.INVITED,
      role: GroupRole.MEMBER,
      consentScopes: escopos,
      consentAt: new Date(),
      statsOptIn: consent.statsOptIn,
    };
    const membership = existente
      ? await this.prisma.groupMembership.update({ where: { id: existente.id }, data: pedido })
      : await this.prisma.groupMembership.create({
          data: { groupId: group.id, userId, ...pedido },
        });

    const quem = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    this.notifications.notify(
      [group.ownerId],
      joinRequestNotice({
        groupId: group.id,
        groupName: group.name,
        requesterName: quem?.name ?? 'Alguém',
      }),
    );

    return {
      membershipId: membership.id,
      groupId: group.id,
      status: membership.status,
      role: membership.role,
      revokedLinks: 0,
    };
  }

  /**
   * Aprovação do dono. Define o papel de quem entra (nunca `OWNER`) e só aqui
   * o consentimento guardado no pedido vira vínculo — junto com o leque inverso
   * quando o papel é de equipe.
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

    const ops = await this.activationOps({
      groupId,
      userId: alvo.userId,
      role,
      consent: { scopes: alvo.consentScopes, statsOptIn: alvo.statsOptIn },
      at: new Date(),
    });
    const [membership] = (await this.prisma.$transaction(ops)) as [GroupMembership];
    const grupo = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { name: true },
    });
    this.notifications.notify(
      [alvo.userId],
      joinApprovedNotice({ groupId, groupName: grupo.name }),
    );

    return {
      membershipId: membership.id,
      groupId,
      status: membership.status,
      role: membership.role,
      revokedLinks: 0,
    };
  }

  /**
   * As escritas de quem passa a ser membro ativo, **sem executar**, para um
   * único `$transaction([...])` (ADR 010: sem transação interativa). A primeira
   * operação é sempre o upsert da membership.
   *
   * 1. a membership fica `ACTIVE` com o papel e o registro do aceite;
   * 2. o consentimento escolhido vira vínculo para cada pessoa ativa da equipe;
   * 3. se o papel é de equipe, a pessoa recebe o vínculo de cada membro que já
   *    consentiu (o leque inverso).
   *
   * Usado pela entrada aberta, pela aprovação e pelo aceite de convite.
   */
  async activationOps(params: {
    groupId: string;
    userId: string;
    role: GroupRole;
    consent: JoinConsent;
    at: Date;
  }): Promise<Prisma.PrismaPromise<unknown>[]> {
    const { groupId, userId, role, at } = params;
    const scopes = normalizarEscopos(params.consent.scopes);
    const ativos = await this.prisma.groupMembership.findMany({
      where: { groupId, status: MembershipStatus.ACTIVE, userId: { not: userId } },
      select: { userId: true, role: true, consentScopes: true },
    });

    const dados = {
      role,
      status: MembershipStatus.ACTIVE,
      joinedAt: at,
      leftAt: null,
      consentScopes: scopes,
      consentAt: at,
      statsOptIn: params.consent.statsOptIn,
    };
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.groupMembership.upsert({
        where: { groupId_userId: { groupId, userId } },
        create: { groupId, userId, ...dados },
        update: dados,
      }),
      ...this.links.groupConsentOps({
        subjectUserId: userId,
        groupId,
        scopes,
        receivers: ativos.filter((m) => canReceiveLink(m.role)).map((m) => m.userId),
        at,
      }),
    ];
    if (canReceiveLink(role)) {
      ops.push(
        ...this.links.teamMemberLinksOps({
          groupId,
          teamUserId: userId,
          subjects: ativos.map((m) => ({ userId: m.userId, scopes: m.consentScopes })),
          at,
        }),
      );
    }
    return ops;
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
      include: {
        user: { select: { name: true } },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    // Uma consulta só para todos os vínculos ativos concedidos a quem pergunta
    // neste grupo — e não uma por membro.
    const vinculos = veTodos
      ? await this.prisma.professionalLink.findMany({
          where: { groupId, professionalId: userId, revokedAt: null },
          select: { subjectUserId: true, scopes: true },
        })
      : [];
    const porTitular = new Map(vinculos.map((v) => [v.subjectUserId, v.scopes]));
    // O assento que vale, pela regra do portão da IA — e não só "atribuído".
    const withSeat = veTodos
      ? await membershipsWithEffectiveSeat(
          this.prisma,
          membros.map((m) => m.id),
        )
      : new Set<string>();

    return membros.map((m) => ({
      membershipId: m.id,
      name: m.user.name,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
      ...(veTodos
        ? {
            scopesGrantedToMe: porTitular.get(m.userId) ?? [],
            hasAiSeat: withSeat.has(m.id),
          }
        : {}),
    }));
  }

  /**
   * O dono muda o papel de quem já está dentro. Os vínculos acompanham, no
   * mesmo commit (ADR 026):
   *
   * - virar equipe (de `MEMBER`) passa a receber o que cada membro já
   *   consentiu à comunidade — o mesmo leque inverso da entrada pela equipe;
   * - deixar a equipe (para `MEMBER`) revoga tudo que a pessoa recebia ali;
   * - entre papéis de equipe, nada muda nos vínculos.
   *
   * O dono não muda de papel por aqui (transfere), e pedido pendente se aprova,
   * não se promove.
   */
  async changeRole(
    ownerId: string,
    groupId: string,
    membershipId: string,
    role: GrantableRole,
  ): Promise<MembershipResult> {
    await this.assertOwner(ownerId, groupId);

    const alvo = await this.prisma.groupMembership.findUnique({ where: { id: membershipId } });
    // Amarrado ao grupo da URL (#204): ser dono daqui não muda papel em outro grupo.
    if (!alvo || alvo.groupId !== groupId || alvo.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
    }
    if (alvo.role === GroupRole.OWNER) {
      throw new ConflictException('O papel do dono não muda: transfira a comunidade.');
    }
    if (alvo.role === role) {
      return {
        membershipId: alvo.id,
        groupId,
        status: alvo.status,
        role: alvo.role,
        revokedLinks: 0,
      };
    }

    const at = new Date();
    const entra = !canReceiveLink(alvo.role) && canReceiveLink(role);
    const sai = canReceiveLink(alvo.role) && !canReceiveLink(role);
    const vinculos: Prisma.PrismaPromise<unknown>[] = [];
    if (entra) {
      const outros = await this.prisma.groupMembership.findMany({
        where: { groupId, status: MembershipStatus.ACTIVE, userId: { not: alvo.userId } },
        select: { userId: true, consentScopes: true },
      });
      vinculos.push(
        ...this.links.teamMemberLinksOps({
          groupId,
          teamUserId: alvo.userId,
          subjects: outros.map((m) => ({ userId: m.userId, scopes: m.consentScopes })),
          at,
        }),
      );
    }
    if (sai) vinculos.push(this.links.revokeAsReceiverOp(groupId, alvo.userId, at));

    const [membership, ...resto] = (await this.prisma.$transaction([
      this.prisma.groupMembership.update({ where: { id: alvo.id }, data: { role } }),
      ...vinculos,
    ])) as [GroupMembership, ...unknown[]];

    return {
      membershipId: membership.id,
      groupId,
      status: membership.status,
      role: membership.role,
      revokedLinks: sai ? ((resto[0] as { count: number }).count ?? 0) : 0,
    };
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
   * O dono bane alguém (Fase 8b, ADR 032): o mesmo encerramento da remoção —
   * vínculos e assento revogados na mesma transação — e o status `BANNED`, que
   * o código e o convite não reabrem. Vale também para quem já saiu: banir é
   * sobre voltar.
   */
  async ban(ownerId: string, groupId: string, membershipId: string): Promise<MembershipResult> {
    await this.assertOwner(ownerId, groupId);
    const alvo = await this.prisma.groupMembership.findUnique({ where: { id: membershipId } });
    // Amarrado ao grupo da URL (#204).
    if (!alvo || alvo.groupId !== groupId) throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
    if (alvo.role === GroupRole.OWNER) {
      throw new ConflictException('O dono não pode ser banido do próprio grupo');
    }
    if (alvo.status === MembershipStatus.BANNED) {
      return {
        membershipId: alvo.id,
        groupId,
        status: alvo.status,
        role: alvo.role,
        revokedLinks: 0,
      };
    }
    return this.encerrar(
      alvo.id,
      groupId,
      alvo.userId,
      MembershipStatus.BANNED,
      'membership_removed',
    );
  }

  /** Desbanir não põe de volta: a associação fica `REMOVED`, e a pessoa pode pedir de novo. */
  async unban(ownerId: string, groupId: string, membershipId: string): Promise<MembershipResult> {
    await this.assertOwner(ownerId, groupId);
    const alvo = await this.prisma.groupMembership.findUnique({ where: { id: membershipId } });
    if (!alvo || alvo.groupId !== groupId || alvo.status !== MembershipStatus.BANNED) {
      throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
    }
    const m = await this.prisma.groupMembership.update({
      where: { id: alvo.id },
      data: { status: MembershipStatus.REMOVED },
    });
    return { membershipId: m.id, groupId, status: m.status, role: m.role, revokedLinks: 0 };
  }

  async listBanned(ownerId: string, groupId: string) {
    await this.assertOwner(ownerId, groupId);
    const rows = await this.prisma.groupMembership.findMany({
      where: { groupId, status: MembershipStatus.BANNED },
      select: { id: true, displayName: true, leftAt: true, user: { select: { name: true } } },
      orderBy: { leftAt: 'desc' },
    });
    return rows.map((r) => ({
      membershipId: r.id,
      name: r.user.name,
      displayName: r.displayName,
      bannedAt: r.leftAt,
    }));
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
    status: Extract<MembershipStatus, 'LEFT' | 'REMOVED' | 'BANNED'>,
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
      // O assento de IA pago pela comunidade (ADR 025) acaba junto: a
      // comunidade deixa de pagar por quem saiu, e o lugar volta ao dono.
      this.prisma.groupSeatAssignment.updateMany({
        where: { membershipId, revokedAt: null },
        data: { revokedAt: agora },
      }),
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
