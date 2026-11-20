import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  GroupRole,
  JoinPolicy,
  type InviteOrigin,
  JoinVia,
  MembershipStatus,
  type GroupMembership,
  type Prisma,
  type ShareScope,
} from '@fatia/db';
import { membershipsWithEffectiveSeat } from '../billing/subscription-entitlements.service';
import { PrismaService } from '../common/prisma.service';
import { ChallengeService } from './challenge.service';
import { NotificationService } from '../notifications/notification.service';
import { joinApprovedNotice, joinRequestNotice } from './community-notices';
import { assertJoinMeetsRequiredScopes, normalizarEscopos } from './consent-scopes';
import { cancelScheduledAnnouncementsOp } from './announcement-schedule';
import { findGroupByEntryCode } from './entry-code';
import {
  can,
  canManageMember,
  canReceiveLink,
  rolesGrantableBy,
  seesOnlyAccompanied,
  STAFF_ROLES,
  type GroupAction,
  type Specialty,
} from './permissions';
import { ProfessionalLinkService } from './professional-link.service';
import { revokeCreatedTeamInvitesOp, specialtyClearedAuditOp } from './team-invites';

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
  /**
   * Por onde entrou e quem acompanha (#401, "Entrou por" e "Acompanha"). Só
   * para a equipe que vê todos (`OWNER`, `PROFESSIONAL`).
   */
  joinedVia?: {
    via: JoinVia | null;
    inviteId: string | null;
    label: string | null;
    origin: InviteOrigin | null;
  } | null;
  accompaniedBy?: { membershipId: string; name: string } | null;
  leftAt?: Date | null;
  /**
   * O WhatsApp que a pessoa escolheu mostrar à equipe (`whatsappOptIn`, perfil).
   * Só de quem está ativo e só para a equipe que vê todos.
   */
  whatsapp?: string | null;
}

export interface ListMembersOptions {
  /** Inclui quem saiu ou foi removido (aba "Saíram"). Só para quem vê todos. */
  includeLeft?: boolean;
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
/** O código revogado entre a leitura e o commit responde como código inexistente. */
function codigoEsgotado(err: unknown): never {
  if ((err as { code?: string })?.code === 'P2025') throw new NotFoundException(NOT_FOUND);
  throw err;
}

/** Uma pessoa da equipe, como o membro a vê no Cm-04. */
export interface TeamMemberView {
  name: string;
  role: GroupRole;
  /** A especialidade do profissional (#404); nula para os outros papéis. */
  specialty: Specialty | null;
  /** É quem acompanha quem pergunta (#404, "Acompanhado por"). */
  accompaniesMe: boolean;
  /** O que ela vê de quem pergunta (vazio = nada). */
  sees: ShareScope[];
  /** A última vez que ela abriu algo de quem pergunta (acesso não negado). */
  lastViewedAt: Date | null;
}

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: ProfessionalLinkService,
    private readonly notifications: NotificationService,
    @Optional() private readonly challenges?: ChallengeService,
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
    code: string,
    consent: JoinConsent = { scopes: [], statsOptIn: false },
  ): Promise<MembershipResult> {
    // Código legível da equipe ou slug (#393); só por convite não abre a porta.
    const entrada = await findGroupByEntryCode(this.prisma, code);
    if (!entrada) throw new NotFoundException(NOT_FOUND);
    const { group } = entrada;
    // Código gerado pela equipe (o QR da recepção) ou o slug da página (#398).
    const via = entrada.inviteId ? JoinVia.CODE : JoinVia.PAGE;
    // Conta o uso do código no mesmo commit da entrada; o filtro de `maxUses`
    // faz o último uso disputado falhar inteiro (P2025 → 404).
    const usoDoCodigo = entrada.inviteId
      ? [
          this.prisma.groupInvite.update({
            where: {
              id: entrada.inviteId,
              revokedAt: null,
              ...(entrada.inviteMaxUses !== null ? { uses: { lt: entrada.inviteMaxUses } } : {}),
            },
            data: { uses: { increment: 1 } },
          }),
        ]
      : [];

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
    // Também no pedido que espera aprovação: o dono aprova o que viu, e o
    // consentimento guardado no pedido é o que vira vínculo na aprovação.
    assertJoinMeetsRequiredScopes(GroupRole.MEMBER, group.requiredSharingScopes, consent.scopes);

    if (group.joinPolicy === JoinPolicy.OPEN) {
      const ops = await this.activationOps({
        groupId: group.id,
        userId,
        role: GroupRole.MEMBER,
        consent,
        at: new Date(),
        via,
        viaInviteId: entrada.inviteId ?? null,
      });
      const [membership] = (await this.prisma
        .$transaction([...ops, ...usoDoCodigo])
        .catch(codigoEsgotado)) as [GroupMembership];
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
      joinVia: via,
      joinedViaInviteId: entrada.inviteId ?? null,
      accompaniedById: null,
    };
    const [membership] = (await this.prisma
      .$transaction([
        existente
          ? this.prisma.groupMembership.update({ where: { id: existente.id }, data: pedido })
          : this.prisma.groupMembership.create({
              data: { groupId: group.id, userId, ...pedido },
            }),
        ...usoDoCodigo,
      ])
      .catch(codigoEsgotado)) as [GroupMembership];

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
    actorId: string,
    groupId: string,
    membershipId: string,
    role: GrantableRole = GroupRole.MEMBER,
  ): Promise<MembershipResult> {
    const eu = await this.assertAction(actorId, groupId, 'member.approve');
    // A recepção aprova no balcão só como membro; o administrador não faz
    // outro administrador (#404).
    if (!rolesGrantableBy(eu.role).includes(role)) {
      throw new ForbiddenException('Seu papel não dá esse papel a quem entra');
    }

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
    // Aprovar já com papel de equipe é dar papel: vai para a trilha (#404).
    if (role !== GroupRole.MEMBER) {
      ops.push(
        this.prisma.groupAuditLog.create({
          data: {
            groupId,
            actorId,
            action: 'members.approve',
            targetCount: 1,
            payload: { membershipIds: [alvo.id], from: null, to: role },
          },
        }),
      );
    }
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
    /** Por onde entrou (#398). Ausente na aprovação: vale o que o pedido guardou. */
    via?: JoinVia;
    /** O convite por onde entrou (#401, "Entrou por"); vale junto com `via`. */
    viaInviteId?: string | null;
    /** Quem da equipe acompanha (#401); vale junto com `via`. */
    accompaniedById?: string | null;
  }): Promise<Prisma.PrismaPromise<unknown>[]> {
    const { groupId, userId, role, at } = params;
    const scopes = normalizarEscopos(params.consent.scopes);
    const ativos = await this.prisma.groupMembership.findMany({
      where: { groupId, status: MembershipStatus.ACTIVE, userId: { not: userId } },
      select: { userId: true, role: true, consentScopes: true, specialty: true },
    });

    const dados = {
      role,
      status: MembershipStatus.ACTIVE,
      joinedAt: at,
      leftAt: null,
      consentScopes: scopes,
      consentAt: at,
      statsOptIn: params.consent.statsOptIn,
      // Quem volta (ou é reativado) não herda o que marcou antes: e-mail do
      // relatório (#400) e aviso diário de em risco (#399) recomeçam desligados.
      reportEmail: false,
      riskDigest: false,
      // Nem a especialidade (#404): quem volta para a equipe recomeça sem ela,
      // e o leque inverso abaixo sai coerente com isso.
      specialty: null,
      // Entrada nova (com `via`) reescreve a origem e o responsável: quem volta
      // por outro caminho não herda o de antes. Na aprovação, fica o do pedido.
      ...(params.via
        ? {
            joinVia: params.via,
            joinedViaInviteId: params.viaInviteId ?? null,
            accompaniedById: params.accompaniedById ?? null,
          }
        : {}),
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
        receiverSpecialty: new Map(ativos.map((m) => [m.userId, m.specialty])),
        at,
      }),
    ];
    if (canReceiveLink(role)) {
      ops.push(
        ...this.links.teamMemberLinksOps({
          groupId,
          teamUserId: userId,
          subjects: ativos.map((m) => ({ userId: m.userId, scopes: m.consentScopes })),
          specialty: null,
          at,
        }),
      );
    }
    return ops;
  }

  /**
   * A equipe vista pelo membro (#393, Cm-04 "Equipe da academia"): quem da
   * equipe ativa existe, o que cada um vê **de quem pergunta** (os vínculos
   * vivos dele neste grupo) e quando olhou por último (acesso não negado, na
   * trilha dele). Outros alunos nunca aparecem, e o dado de outra pessoa
   * também não: tudo parte de `subjectUserId = userId`.
   */
  async teamForMember(userId: string, groupId: string): Promise<TeamMemberView[]> {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true, accompaniedById: true },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);

    const [equipe, vinculos] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: {
          groupId,
          status: MembershipStatus.ACTIVE,
          // A equipe toda (#404): administrador e recepção aparecem com "não vê
          // seus dados", que é a verdade.
          role: { in: [...STAFF_ROLES] },
          userId: { not: userId },
        },
        select: {
          id: true,
          userId: true,
          role: true,
          specialty: true,
          user: { select: { name: true } },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.professionalLink.findMany({
        where: { groupId, subjectUserId: userId, revokedAt: null },
        select: { professionalId: true, scopes: true },
      }),
    ]);
    const vistos = await this.prisma.professionalAccessLog.groupBy({
      by: ['professionalId'],
      where: {
        subjectUserId: userId,
        denied: false,
        professionalId: { in: equipe.map((m) => m.userId) },
        OR: [{ groupId }, { groupId: null, link: { groupId } }],
      },
      _max: { at: true },
    });
    const escopos = new Map(vinculos.map((v) => [v.professionalId, v.scopes]));
    const ultimo = new Map(vistos.map((v) => [v.professionalId, v._max.at]));
    return equipe.map((m) => ({
      name: m.user.name,
      role: m.role,
      specialty: m.specialty,
      accompaniesMe: eu.accompaniedById === m.id,
      sees: normalizarEscopos(escopos.get(m.userId) ?? []),
      lastViewedAt: ultimo.get(m.userId) ?? null,
    }));
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
  async listMembers(
    userId: string,
    groupId: string,
    opts: ListMembersOptions = {},
  ): Promise<MemberView[]> {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);

    // Quem vê o grupo inteiro: o dono, o administrador, o profissional e a
    // recepção (#404). O que cada um vê de cada pessoa é outra coisa: a
    // recepção, só nome, papel e situação.
    const veTodos =
      eu.role === GroupRole.OWNER ||
      eu.role === GroupRole.ADMIN ||
      eu.role === GroupRole.PROFESSIONAL ||
      eu.role === GroupRole.RECEPTION;
    const veDetalhe = veTodos && eu.role !== GroupRole.RECEPTION;
    // "Profissionais veem só quem acompanham" (#404): o profissional vê a
    // equipe e os membros que apontam para ele.
    const grupo = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { proSeeOnlyAssigned: true },
    });
    const soOsMeus = seesOnlyAccompanied(eu.role, grupo.proSeeOnlyAssigned);
    // Quem saiu só aparece para a equipe que vê todos: nome e data, nada mais.
    const status =
      veDetalhe && opts.includeLeft
        ? [
            MembershipStatus.INVITED,
            MembershipStatus.ACTIVE,
            MembershipStatus.LEFT,
            MembershipStatus.REMOVED,
          ]
        : [MembershipStatus.INVITED, MembershipStatus.ACTIVE];

    const membros = await this.prisma.groupMembership.findMany({
      where: {
        groupId,
        status: { in: status },
        ...(soOsMeus
          ? { OR: [{ role: { not: GroupRole.MEMBER } }, { accompaniedById: eu.id }, { userId }] }
          : veTodos
            ? {}
            : { OR: [{ role: { in: [...STAFF_ROLES] } }, { userId }] }),
      },
      include: {
        user: { select: { name: true, whatsapp: true, whatsappOptIn: true } },
        joinedViaInvite: { select: { id: true, label: true, origin: true } },
        accompaniedBy: { select: { id: true, user: { select: { name: true } } } },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    // Uma consulta só para todos os vínculos ativos concedidos a quem pergunta
    // neste grupo — e não uma por membro.
    const vinculos = veDetalhe
      ? await this.prisma.professionalLink.findMany({
          where: { groupId, professionalId: userId, revokedAt: null },
          select: { subjectUserId: true, scopes: true },
        })
      : [];
    const porTitular = new Map(vinculos.map((v) => [v.subjectUserId, v.scopes]));
    // O assento que vale, pela regra do portão da IA — e não só "atribuído".
    // Assento é cobrança: só quem vê a fatura (#404, o administrador não).
    const veAssento = veDetalhe && eu.role !== GroupRole.ADMIN;
    const withSeat = veAssento
      ? await membershipsWithEffectiveSeat(
          this.prisma,
          membros.filter((m) => m.status === MembershipStatus.ACTIVE).map((m) => m.id),
        )
      : new Set<string>();

    return membros.map((m) => ({
      membershipId: m.id,
      name: m.user.name,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
      ...(veDetalhe
        ? {
            scopesGrantedToMe:
              m.status === MembershipStatus.ACTIVE || m.status === MembershipStatus.INVITED
                ? (porTitular.get(m.userId) ?? [])
                : [],
            ...(veAssento ? { hasAiSeat: withSeat.has(m.id) } : {}),
            joinedVia:
              m.joinVia || m.joinedViaInvite
                ? {
                    via: m.joinVia,
                    inviteId: m.joinedViaInvite?.id ?? null,
                    label: m.joinedViaInvite?.label ?? null,
                    origin: m.joinedViaInvite?.origin ?? null,
                  }
                : null,
            accompaniedBy: m.accompaniedBy
              ? { membershipId: m.accompaniedBy.id, name: m.accompaniedBy.user.name }
              : null,
            leftAt: m.leftAt,
            whatsapp:
              m.status === MembershipStatus.ACTIVE && m.user.whatsappOptIn ? m.user.whatsapp : null,
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
    actorId: string,
    groupId: string,
    membershipId: string,
    role: GrantableRole,
  ): Promise<MembershipResult> {
    const eu = await this.assertAction(actorId, groupId, 'member.role');

    const alvo = await this.prisma.groupMembership.findUnique({ where: { id: membershipId } });
    // Amarrado ao grupo da URL (#204): ser dono daqui não muda papel em outro grupo.
    if (!alvo || alvo.groupId !== groupId || alvo.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
    }
    if (alvo.role === GroupRole.OWNER) {
      throw new ConflictException('O papel do dono não muda: transfira a comunidade.');
    }
    // O administrador não mexe em outro administrador (nem em si) e não faz
    // administrador ninguém (#404): é o que impede o escalonamento.
    if (!canManageMember(eu.role, alvo.role) || !rolesGrantableBy(eu.role).includes(role)) {
      throw new ForbiddenException('Seu papel não faz essa troca de papel');
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
    // Especialidade é do profissional (#404): some com o papel, e a troca vai
    // para a trilha.
    const especialidade = role === GroupRole.PROFESSIONAL ? alvo.specialty : null;
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
          specialty: especialidade,
          at,
        }),
      );
    }
    if (sai) vinculos.push(this.links.revokeAsReceiverOp(groupId, alvo.userId, at));
    // Os convites de equipe que ela criou e o papel novo não dá mais caem (#404).
    const convites = [revokeCreatedTeamInvitesOp(this.prisma, groupId, alvo.userId, role, at)];
    const trilhaEspecialidade =
      alvo.specialty && !especialidade
        ? [
            specialtyClearedAuditOp(this.prisma, {
              groupId,
              actorId,
              membershipId: alvo.id,
              from: alvo.specialty,
            }),
          ]
        : [];
    // Sem o papel de comunicar, os agendados dela não saem mais (#394).
    const cancelaAgendados = !can(role, 'announcement.publish')
      ? [cancelScheduledAnnouncementsOp(this.prisma, alvo.id, at)]
      : [];

    // Quem deixa de ser profissional deixa de acompanhar; quem vira equipe deixa
    // de ser acompanhado (#401).
    const acompanha = (r: GroupRole) => r === GroupRole.PROFESSIONAL || r === GroupRole.OWNER;
    const largaAcompanhados =
      acompanha(alvo.role) && !acompanha(role) ? releaseAccompaniedOps(this.prisma, alvo.id) : [];

    const [membership, ...resto] = (await this.prisma.$transaction([
      this.prisma.groupMembership.update({
        where: { id: alvo.id },
        // Papel novo, escolhas novas: e-mail do relatório (#400) e aviso diário
        // de em risco (#399) são do papel de antes e recomeçam desligados.
        data: {
          role,
          reportEmail: false,
          riskDigest: false,
          ...(role !== GroupRole.MEMBER ? { accompaniedById: null } : {}),
          specialty: especialidade,
        },
      }),
      ...vinculos,
      ...cancelaAgendados,
      ...largaAcompanhados,
      ...convites,
      ...trilhaEspecialidade,
      // Quem mudou o papel de quem, e quando (#404): o dono vê na Equipe.
      this.prisma.groupAuditLog.create({
        data: {
          groupId,
          actorId,
          action: 'members.role',
          targetCount: 1,
          payload: { membershipIds: [alvo.id], from: alvo.role, to: role },
        },
      }),
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

    return this.endMembership(
      membership.id,
      groupId,
      userId,
      MembershipStatus.LEFT,
      'left_group',
      userId,
      membership.specialty,
    );
  }

  /**
   * O dono remove um membro. Mesmo efeito de `leave()` sobre os vínculos — só
   * muda o `revokedReason`, porque quem saiu e quem foi removido precisam ser
   * distinguíveis na trilha.
   */
  async removeMember(
    actorId: string,
    groupId: string,
    membershipId: string,
  ): Promise<MembershipResult> {
    const eu = await this.assertAction(actorId, groupId, 'member.remove');

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
    if (!canManageMember(eu.role, alvo.role)) {
      throw new ForbiddenException('Seu papel não remove esta pessoa');
    }

    return this.endMembership(
      alvo.id,
      groupId,
      alvo.userId,
      MembershipStatus.REMOVED,
      'membership_removed',
      actorId,
      alvo.specialty,
    );
  }

  /**
   * O dono bane alguém (Fase 8b, ADR 032): o mesmo encerramento da remoção —
   * vínculos e assento revogados na mesma transação — e o status `BANNED`, que
   * o código e o convite não reabrem. Vale também para quem já saiu: banir é
   * sobre voltar.
   */
  async ban(actorId: string, groupId: string, membershipId: string): Promise<MembershipResult> {
    const eu = await this.assertAction(actorId, groupId, 'member.ban');
    const alvo = await this.prisma.groupMembership.findUnique({ where: { id: membershipId } });
    // Amarrado ao grupo da URL (#204).
    if (!alvo || alvo.groupId !== groupId) throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
    if (alvo.role === GroupRole.OWNER) {
      throw new ConflictException('O dono não pode ser banido do próprio grupo');
    }
    if (!canManageMember(eu.role, alvo.role)) {
      throw new ForbiddenException('Seu papel não bane esta pessoa');
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
    return this.endMembership(
      alvo.id,
      groupId,
      alvo.userId,
      MembershipStatus.BANNED,
      'membership_removed',
      actorId,
      alvo.specialty,
    );
  }

  /** Desbanir não põe de volta: a associação fica `REMOVED`, e a pessoa pode pedir de novo. */
  async unban(actorId: string, groupId: string, membershipId: string): Promise<MembershipResult> {
    const eu = await this.assertAction(actorId, groupId, 'member.ban');
    const alvo = await this.prisma.groupMembership.findUnique({ where: { id: membershipId } });
    if (!alvo || alvo.groupId !== groupId || alvo.status !== MembershipStatus.BANNED) {
      throw new NotFoundException(MEMBERSHIP_NOT_FOUND);
    }
    // O mesmo limite do banir (#404): o admin não desfaz o banimento de outro admin.
    if (!canManageMember(eu.role, alvo.role)) {
      throw new ForbiddenException('Seu papel não desfaz o banimento desta pessoa');
    }
    const m = await this.prisma.groupMembership.update({
      where: { id: alvo.id },
      data: { status: MembershipStatus.REMOVED },
    });
    return { membershipId: m.id, groupId, status: m.status, role: m.role, revokedLinks: 0 };
  }

  async listBanned(actorId: string, groupId: string) {
    await this.assertAction(actorId, groupId, 'member.ban');
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
  private async endMembership(
    membershipId: string,
    groupId: string,
    userId: string,
    status: Extract<MembershipStatus, 'LEFT' | 'REMOVED' | 'BANNED'>,
    reason: 'left_group' | 'membership_removed',
    /** Quem encerrou e a especialidade que some junto, para a trilha (#404). */
    actorId: string,
    specialty: string | null,
  ): Promise<MembershipResult> {
    const agora = new Date();

    const [membership, revogados] = await this.prisma.$transaction([
      this.prisma.groupMembership.update({
        where: { id: membershipId },
        // A especialidade não sobrevive à saída (#404): quem volta recomeça.
        data: { status, leftAt: agora, accompaniedById: null, specialty: null },
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
      // Os comunicados que a pessoa agendou não saem depois que ela saiu (#394).
      cancelScheduledAnnouncementsOp(this.prisma, membershipId, agora),
      // Quem ela acompanhava fica sem responsável (#401).
      ...releaseAccompaniedOps(this.prisma, membershipId),
      // As anotações da equipe sobre ela moram na comunidade e saem com ela (#402).
      this.prisma.memberNote.deleteMany({ where: { groupId, subjectUserId: userId } }),
      // Plano que esperava o aceite não se responde mais (#402); o aceito é dela.
      this.prisma.planOfferVersion.updateMany({
        where: { status: 'PENDING', offer: { groupId, userId } },
        data: { status: 'SUPERSEDED', respondedAt: agora },
      }),
      // Reação e comentário da equipe nos treinos dela moram na comunidade (#399).
      this.prisma.sessionFeedback.deleteMany({ where: { groupId, session: { userId } } }),
      // O "Visto" sobre ela, e o que ela viu se era da equipe (#399).
      this.prisma.reviewSeen.deleteMany({
        where: { groupId, OR: [{ subjectUserId: userId }, { userId }] },
      }),
      // Os convites de equipe que ela criou não abrem porta depois que saiu (#404).
      revokeCreatedTeamInvitesOp(this.prisma, groupId, userId, null, agora),
      ...(specialty
        ? [
            specialtyClearedAuditOp(this.prisma, {
              groupId,
              actorId,
              membershipId,
              from: specialty,
            }),
          ]
        : []),
    ]);

    // As fotos de prova dos check-ins dela nesta comunidade saem na hora (ADR 044 §7).
    await this.challenges?.afterMembershipEnded(membership.id);

    return {
      membershipId: membership.id,
      groupId,
      status: membership.status,
      role: membership.role,
      revokedLinks: revogados.count,
    };
  }

  /**
   * A matriz de novo, no service (#404: não é mais "só o dono"). Não-membro
   * recebe `NOT_FOUND` (não pode descobrir que o grupo existe); membro sem o
   * papel recebe `FORBIDDEN`, porque para ele não há existência a esconder.
   */
  private async assertAction(
    userId: string,
    groupId: string,
    action: GroupAction,
  ): Promise<{ id: string; role: GroupRole }> {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true, role: true, status: true },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);
    if (!can(eu.role, action)) {
      throw new ForbiddenException('Seu papel nesta comunidade não permite isso');
    }
    return eu;
  }
}

/**
 * Quem sai da equipe (ou da comunidade) deixa de acompanhar: os membros e os
 * convites que apontavam para ela ficam sem responsável (#401).
 */
function releaseAccompaniedOps(
  prisma: PrismaService,
  membershipId: string,
): Prisma.PrismaPromise<unknown>[] {
  return [
    prisma.groupMembership.updateMany({
      where: { accompaniedById: membershipId },
      data: { accompaniedById: null },
    }),
    prisma.groupInvite.updateMany({
      where: { accompaniedById: membershipId },
      data: { accompaniedById: null },
    }),
  ];
}
