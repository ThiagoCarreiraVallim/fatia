import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { checkBrandColor } from '@fatia/design';
import {
  CommunitySection as CommunitySectionEnum,
  GroupRole,
  GroupType,
  MembershipStatus,
  type Group,
  type AutoPostKind,
  type CommunitySection,
  type GroupAiMode,
  type GroupMembership,
  type Prisma,
  type GroupVisibility,
  type JoinPolicy,
  type MediaFile,
  type PostPolicy,
  ShareScope,
  SubscriptionStatus,
} from '@fatia/db';
import {
  membershipsWithEffectiveSeat,
  proPayerGroupOf,
} from '../billing/subscription-entitlements.service';
import { PrismaService } from '../common/prisma.service';
import { MediaService } from '../storage/media.service';
import { GROUP_DELETION_HOOKS, type GroupDeletionHook } from './group-deletion.hook';
import { normalizarEscopos } from './consent-scopes';
import { findGroupByEntryCode, groupProOffer } from './entry-code';
import {
  actionsOf,
  can,
  canReceiveLink,
  TEAM_ROLES,
  type GroupAction,
  type Specialty,
} from './permissions';
import { ProfessionalLinkService } from './professional-link.service';
import { revokeCreatedTeamInvitesOp, specialtyClearedAuditOp } from './team-invites';

/** Resposta única para grupo que não existe e para grupo de que não sou membro (#92). */
const NOT_FOUND = 'Group not found';

/**
 * Status em que a associação ainda é viva — o que decide se o grupo aparece
 * para quem pergunta.
 *
 * Constante compartilhada, e não um `if` por método: `listMine` escondia o
 * grupo de quem saiu (`LEFT`) enquanto `findByIdForMember` barrava só `REMOVED`
 * e continuava devolvendo nome e slug por id. Duas listas escritas à mão
 * divergem; esta é a única.
 */
const STATUS_VIVOS = [MembershipStatus.INVITED, MembershipStatus.ACTIVE] as const;

export interface CreateGroupInput {
  type: GroupType;
  name: string;
  /** Opcional: sem slug, deriva do nome com sufixo aleatório. */
  slug?: string;
  description?: string;
  joinPolicy?: JoinPolicy;
  visibility?: GroupVisibility;
  timezone?: string;
  /** O que quem entra como membro precisa compartilhar. Ausente = nada. */
  requiredSharingScopes?: ShareScope[];
}

/** O que o dono pode mudar no perfil. Tipo e slug ficam: o slug está em links já distribuídos. */
export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  joinPolicy?: JoinPolicy;
  visibility?: GroupVisibility;
  timezone?: string;
  /** Quem publica no mural (Fase 8b). */
  postPolicy?: PostPolicy;
  /** Que conteúdo novo vira post automático no mural (#394). */
  autoPosts?: AutoPostKind[];
  /**
   * Mudar a lista vale para quem entrar dali em diante: quem já está dentro
   * não passa a dever o que nunca compartilhou (`consent-scopes.ts`).
   */
  requiredSharingScopes?: ShareScope[];
  /** "Profissionais veem só quem acompanham" (#404). */
  proSeeOnlyAssigned?: boolean;
  /**
   * Patrocinada ou social (#413). Só o dono muda (é cobrança); patrocinada com
   * assentos valendo não vira social.
   */
  type?: GroupType;
  /** Cor de destaque (#413). Nula = a cor padrão. Só entra com contraste. */
  brandColor?: string | null;
  /** Seções escondidas para os membros (#413). Só visual. */
  hiddenSections?: CommunitySection[];
}

export interface GroupSummary {
  id: string;
  type: GroupType;
  name: string;
  slug: string;
  description: string | null;
  joinPolicy: JoinPolicy;
  /** Papel de quem está perguntando. Nunca o papel de outra pessoa. */
  role: GroupRole;
  /**
   * O que o papel de quem pergunta faz aqui, da matriz (#404): a tela esconde o
   * que não alcança sem ter de repetir a matriz. Vazio enquanto pendente, fora
   * `group.read`. A API continua sendo o portão.
   */
  actions: GroupAction[];
  /** A especialidade de quem pergunta, se for profissional (#404). */
  specialty: Specialty | null;
  /** "Profissionais veem só quem acompanham" (#404). */
  proSeeOnlyAssigned: boolean;
  status: MembershipStatus;
  membershipId: string;
  joinedAt: Date | null;
  createdAt: Date;
  /** O que a própria pessoa escolheu compartilhar com a equipe (ADR 026). */
  consentScopes: ShareScope[];
  statsOptIn: boolean;
  /** Se a comunidade dá o PRO a esta pessoa (assento valendo ou todos os membros, ADR 025). */
  hasAiSeat: boolean;
  /**
   * O PRO que vale agora é pago **por esta** comunidade (#393): a fonte do
   * direito é `GROUP` e o pool é deste grupo. Com assinatura própria valendo,
   * `false` mesmo com assento. É o selo "PRO pago pela academia" e o "se sair,
   * volta ao Free".
   */
  proPaidByThisGroup: boolean;
  /** Avatar da comunidade, por URL assinada de curta duração (ADR 028). */
  avatarUrl: string | null;
  /** Quem publica no mural (Fase 8b). */
  postPolicy: PostPolicy;
  /** Que conteúdo novo vira post automático no mural (#394). */
  autoPosts: AutoPostKind[];
  /** O que a comunidade exige que membros compartilhem para entrar. */
  requiredSharingScopes: ShareScope[];
  /** Pública ou privada (Cm-01, Cm-04). */
  visibility: GroupVisibility;
  /** Fuso da comunidade ("fuso Cuiabá" no Cm-04). */
  timezone: string;
  /** Cor de destaque da comunidade (#413). Nula = a cor padrão. */
  brandColor: string | null;
  /** Capa da comunidade (#413), por URL assinada de curta duração. */
  coverUrl: string | null;
  /** Seções escondidas para os membros (#413). Só visual. */
  hiddenSections: CommunitySection[];
  /** Pessoas ativas na comunidade. */
  memberCount: number;
  /** Posts dos outros desde a última visita ao mural (`feedSeenAt`). */
  newPostCount: number;
  /** O que a equipe mandou e espera resposta desta pessoa ("3 para você"). */
  forYouCount: number;
  /** A posição desta pessoa no desafio em andamento em que ela entrou. */
  challenge: { id: string; title: string; rank: number } | null;
}

/** O que o cartão de "Minhas comunidades" conta, por associação (#393). */
interface MembershipExtras {
  memberCount: number;
  newPostCount: number;
  forYouCount: number;
  challenge: GroupSummary['challenge'];
}

const SEM_EXTRAS: MembershipExtras = {
  memberCount: 0,
  newPostCount: 0,
  forYouCount: 0,
  challenge: null,
};

/** Preview mostrado a quem foi convidado, ANTES de decidir entrar. */
export interface GroupPreview {
  id: string;
  type: GroupType;
  name: string;
  /**
   * O que mandar de volta ao entrar (`POST /groups/join`): o código normalizado,
   * ou o slug quando a comunidade é pública. Sem `slug` à parte: o slug não se
   * revoga, e quem chegou por código não pode levar a porta permanente.
   */
  code: string;
  memberCount: number;
  description: string | null;
  joinPolicy: JoinPolicy;
  visibility: GroupVisibility;
  /** Quem vai receber o que a pessoa escolher compartilhar. Só nome e papel. */
  team: { name: string; role: GroupRole }[];
  /** O que é obrigatório compartilhar para entrar pelo código (sempre como membro). */
  requiredSharingScopes: ShareScope[];
  /**
   * `ALL_MEMBERS`: "A academia libera o PRO"; `SEATS` com vaga: "pode liberar";
   * `null`: sem oferta (`groupProOffer`).
   */
  proOffer: GroupAiMode | null;
}

const INCLUIR = {
  group: { include: { avatarFile: true, coverFile: true } },
} as const;

/** Assentos que ainda cobram ou dão PRO: com eles, a comunidade não vira social (#413). */
const LIVE_POOL_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.PENDING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.TRIALING,
];

/** As seções escondidas sem repetição, na ordem do enum (como os escopos). */
function normalizeSections(sections: readonly CommunitySection[]): CommunitySection[] {
  const asked = new Set(sections);
  return Object.values(CommunitySectionEnum).filter((s) => asked.has(s));
}

/**
 * A cor que a comunidade grava (#413): hex minúsculo, só com 4,5:1 contra texto
 * branco ou escuro (`checkBrandColor`, ADR 041). A cor sem contraste volta com
 * o motivo e a sugestão de tom, como no editor da marca.
 */
export function brandColorToStore(value: string | null): string | null {
  if (value === null) return null;
  const check = checkBrandColor(value);
  if (check.status !== 'ok') throw new BadRequestException(check.message);
  return check.color.toLowerCase();
}

function toSummary(
  m: GroupMembership & { group: Group },
  avatarUrl: string | null,
  coverUrl: string | null,
  hasAiSeat: boolean,
  proPaidByThisGroup: boolean,
  extras: MembershipExtras,
): GroupSummary {
  return {
    id: m.group.id,
    type: m.group.type,
    name: m.group.name,
    slug: m.group.slug,
    description: m.group.description,
    joinPolicy: m.group.joinPolicy,
    role: m.role,
    actions: m.status === MembershipStatus.ACTIVE ? actionsOf(m.role) : ['group.read'],
    specialty: m.specialty,
    proSeeOnlyAssigned: m.group.proSeeOnlyAssigned,
    status: m.status,
    membershipId: m.id,
    joinedAt: m.joinedAt,
    createdAt: m.group.createdAt,
    consentScopes: m.consentScopes,
    statsOptIn: m.statsOptIn,
    hasAiSeat,
    proPaidByThisGroup,
    avatarUrl,
    postPolicy: m.group.postPolicy,
    autoPosts: m.group.autoPosts,
    requiredSharingScopes: m.group.requiredSharingScopes,
    visibility: m.group.visibility,
    timezone: m.group.timezone,
    brandColor: m.group.brandColor,
    coverUrl,
    hiddenSections: m.group.hiddenSections,
    ...extras,
  };
}

/**
 * Ciclo de vida do grupo (ADR 014).
 *
 * Grupo é contexto administrativo e **não** é permissão: nenhum método daqui
 * cria, lê ou altera `ProfessionalLink`. Entrar concede zero — quem lê dado de
 * saúde é quem tem vínculo consentido pelo titular, ato separado (#155).
 */
@Injectable()
export class GroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: ProfessionalLinkService,
    @Optional()
    @Inject(GROUP_DELETION_HOOKS)
    private readonly ganchos: GroupDeletionHook[] = [],
    @Optional() private readonly media: MediaService | null = null,
  ) {}

  private async summaryOf(
    m: GroupMembership & {
      group: Group & { avatarFile: MediaFile | null; coverFile: MediaFile | null };
    },
    withSeat: ReadonlySet<string>,
    payer: string | null,
    extras: ReadonlyMap<string, MembershipExtras>,
  ): Promise<GroupSummary> {
    const [avatar, cover] = this.media
      ? await Promise.all([
          this.media.viewOrNull(m.group.avatarFile),
          this.media.viewOrNull(m.group.coverFile),
        ])
      : [null, null];
    return toSummary(
      m,
      avatar?.url ?? null,
      cover?.url ?? null,
      withSeat.has(m.id),
      payer === m.groupId,
      extras.get(m.id) ?? SEM_EXTRAS,
    );
  }

  /**
   * As contagens do cartão (#393, Cm-01), só das associações ativas: o pedido
   * que espera aprovação ainda não lê o mural nem recebe plano. Uma consulta
   * por associação: a pessoa está em poucas comunidades.
   */
  private async extrasOf(
    memberships: readonly GroupMembership[],
    now: Date = new Date(),
  ): Promise<Map<string, MembershipExtras>> {
    const ativas = memberships.filter((m) => m.status === MembershipStatus.ACTIVE);
    const out = new Map<string, MembershipExtras>();
    if (ativas.length === 0) return out;
    const pessoas = await this.prisma.groupMembership.groupBy({
      by: ['groupId'],
      where: {
        groupId: { in: ativas.map((m) => m.groupId) },
        status: MembershipStatus.ACTIVE,
      },
      _count: { _all: true },
    });
    const porGrupo = new Map(pessoas.map((p) => [p.groupId, p._count._all]));
    await Promise.all(
      ativas.map(async (m) => {
        const desde = m.feedSeenAt ?? m.joinedAt ?? m.createdAt;
        const [newPostCount, forYouCount, participacao] = await Promise.all([
          this.prisma.groupPost.count({
            where: {
              groupId: m.groupId,
              removedAt: null,
              createdAt: { gt: desde },
              membershipId: { not: m.id },
            },
          }),
          this.prisma.planOfferVersion.count({
            where: { status: 'PENDING', offer: { userId: m.userId, groupId: m.groupId } },
          }),
          this.prisma.groupChallengeParticipant.findFirst({
            where: {
              membershipId: m.id,
              challenge: {
                groupId: m.groupId,
                startsAt: { lte: now },
                endsAt: { gt: now },
                endedEarlyAt: null,
              },
            },
            orderBy: { challenge: { endsAt: 'asc' } },
            select: { score: true, challenge: { select: { id: true, title: true } } },
          }),
        ]);
        // Empate divide a posição (1, 1, 3), como no placar do desafio.
        const challenge = participacao
          ? {
              ...participacao.challenge,
              rank:
                1 +
                (await this.prisma.groupChallengeParticipant.count({
                  where: {
                    challengeId: participacao.challenge.id,
                    score: { gt: participacao.score },
                    membership: { status: MembershipStatus.ACTIVE },
                  },
                })),
            }
          : null;
        out.set(m.id, {
          memberCount: porGrupo.get(m.groupId) ?? 0,
          newPostCount,
          forYouCount,
          challenge,
        });
      }),
    );
    return out;
  }

  /**
   * Cria o grupo já com a membership de `OWNER`.
   *
   * Escrita aninhada, e não duas chamadas: grupo sem dono é órfão com cobrança
   * viva — se a segunda escrita falhasse sozinha, ninguém poderia administrar
   * nem apagar o que ficou. O aninhamento roda numa transação só, sem transação
   * interativa (pgbouncer, ADR 010).
   */
  async create(ownerId: string, input: CreateGroupInput): Promise<Group> {
    const slug = input.slug ?? this.derivarSlug(input.name);

    try {
      return await this.prisma.group.create({
        data: {
          type: input.type,
          name: input.name,
          slug,
          ownerId,
          description: input.description,
          joinPolicy: input.joinPolicy,
          visibility: input.visibility,
          timezone: input.timezone,
          requiredSharingScopes: normalizarEscopos(input.requiredSharingScopes ?? []),
          memberships: {
            create: {
              userId: ownerId,
              role: GroupRole.OWNER,
              status: MembershipStatus.ACTIVE,
              joinedAt: new Date(),
            },
          },
        },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        // Slug é público e escolhido por humano: colisão é erro de entrada, não
        // existência a esconder.
        throw new ConflictException('Slug já está em uso');
      }
      throw err;
    }
  }

  /** Grupos de quem pergunta, com o papel dele. Nunca grupos de terceiros. */
  async listMine(userId: string): Promise<GroupSummary[]> {
    const memberships = await this.prisma.groupMembership.findMany({
      where: {
        userId,
        // Quem saiu ou foi removido não vê mais o grupo na própria lista; a
        // linha continua no banco para o histórico.
        status: { in: [...STATUS_VIVOS] },
      },
      include: INCLUIR,
      orderBy: { createdAt: 'desc' },
    });

    // O assento que vale, pela regra do portão da IA — e não só "atribuído".
    const [withSeat, payer, extras] = await Promise.all([
      membershipsWithEffectiveSeat(
        this.prisma,
        memberships.map((m) => m.id),
      ),
      proPayerGroupOf(this.prisma, userId),
      this.extrasOf(memberships),
    ]);
    return Promise.all(memberships.map((m) => this.summaryOf(m, withSeat, payer, extras)));
  }

  /**
   * Grupo por id, do ponto de vista de quem pergunta.
   *
   * Não-membro recebe o mesmo `NOT_FOUND` de grupo inexistente — devolver
   * "existe, mas você não está" transformaria a rota em oráculo de existência de
   * academia, e o slug é o único identificador público do produto.
   *
   * Quem saiu conta como não-membro: `STATUS_VIVOS` é o mesmo conjunto de
   * `listMine`, senão o grupo some da lista e continua legível por id.
   */
  async findByIdForMember(userId: string, groupId: string): Promise<GroupSummary> {
    const membership = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: INCLUIR,
    });

    if (!membership || !STATUS_VIVOS.some((status) => status === membership.status)) {
      throw new NotFoundException(NOT_FOUND);
    }

    const [withSeat, payer, extras] = await Promise.all([
      membershipsWithEffectiveSeat(this.prisma, [membership.id]),
      proPayerGroupOf(this.prisma, userId),
      this.extrasOf([membership]),
    ]);
    return this.summaryOf(membership, withSeat, payer, extras);
  }

  /**
   * Preview pelo código (#393, Cm-02) — o que a pessoa vê antes de pedir para
   * entrar. Vale o código legível da equipe ou o slug (`entry-code.ts`).
   *
   * Exige autenticação (não é `@Public()`) e devolve só metadado do grupo:
   * nome, tipo e quantos membros, e a equipe que receberá o que for
   * compartilhado. **Nunca** a lista de membros — quem está numa academia é
   * informação sobre pessoas, não sobre o grupo.
   */
  async previewByCode(raw: string): Promise<GroupPreview> {
    const entrada = await findGroupByEntryCode(this.prisma, raw);
    // Inválido, vencido, revogado e só por convite: o mesmo 404.
    if (!entrada) throw new NotFoundException(NOT_FOUND);
    const { group } = entrada;

    const [memberCount, equipe, proOffer] = await Promise.all([
      this.prisma.groupMembership.count({
        where: { groupId: group.id, status: MembershipStatus.ACTIVE },
      }),
      this.prisma.groupMembership.findMany({
        where: {
          groupId: group.id,
          status: MembershipStatus.ACTIVE,
          role: { in: [...TEAM_ROLES] },
        },
        select: { role: true, user: { select: { name: true } } },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      }),
      groupProOffer(this.prisma, group.id),
    ]);

    return {
      id: group.id,
      type: group.type,
      name: group.name,
      code: entrada.code,
      memberCount,
      description: group.description,
      joinPolicy: group.joinPolicy,
      visibility: group.visibility,
      team: equipe.map((m) => ({ name: m.user.name, role: m.role })),
      requiredSharingScopes: group.requiredSharingScopes,
      proOffer,
    };
  }

  /**
   * Perfil, marca, acesso e seções (#413, Pn-15). O guarda já conferiu
   * `group.update`; o service confere de novo e cobra o papel do que é só do
   * dono: o que todo membro precisa compartilhar (`group.sharing`) e o tipo
   * (`billing.manage`, porque patrocinada é a que paga).
   */
  async update(actorId: string, groupId: string, input: UpdateGroupInput): Promise<Group> {
    const eu = await this.assertAction(actorId, groupId, 'group.update');
    const { requiredSharingScopes, autoPosts, brandColor, hiddenSections, type, ...resto } = input;
    // O que todo membro precisa compartilhar decide o que a equipe recebe: é
    // do dono, que define a equipe (#404, ADR 043).
    if (requiredSharingScopes !== undefined && !can(eu.role, 'group.sharing')) {
      throw new ForbiddenException('Só o dono muda o que é obrigatório compartilhar');
    }
    // A foto do prato só existe para quem escolheu guardar (ADR 038): exigir
    // seria cobrar o que a pessoa pode nem ter (#413, Pn-15).
    if (requiredSharingScopes?.includes(ShareScope.MEAL_PHOTOS)) {
      throw new BadRequestException('Fotos das refeições não pode ser obrigatória');
    }
    const cor = brandColor === undefined ? undefined : brandColorToStore(brandColor);
    if (type !== undefined) await this.assertTypeChange(eu, groupId, type);
    const trilha: Prisma.PrismaPromise<unknown>[] = [];
    if (input.proSeeOnlyAssigned !== undefined) {
      const atual = await this.prisma.group.findUniqueOrThrow({
        where: { id: groupId },
        select: { proSeeOnlyAssigned: true },
      });
      // Quem ligou ou desligou o "só quem acompanham", e quando (#404), no
      // mesmo commit da mudança.
      if (atual.proSeeOnlyAssigned !== input.proSeeOnlyAssigned) {
        trilha.push(
          this.prisma.groupAuditLog.create({
            data: {
              groupId,
              actorId,
              action: 'group.pro_see_only_assigned',
              targetCount: 0,
              payload: { value: input.proSeeOnlyAssigned },
            },
          }),
        );
      }
    }
    const [grupo] = (await this.prisma.$transaction([
      this.prisma.group.update({
        where: { id: groupId },
        data: {
          ...resto,
          ...(requiredSharingScopes
            ? { requiredSharingScopes: normalizarEscopos(requiredSharingScopes) }
            : {}),
          ...(autoPosts ? { autoPosts: [...new Set(autoPosts)] } : {}),
          ...(cor !== undefined ? { brandColor: cor } : {}),
          ...(hiddenSections ? { hiddenSections: normalizeSections(hiddenSections) } : {}),
          ...(type !== undefined ? { type } : {}),
        },
      }),
      ...trilha,
    ])) as [Group, ...unknown[]];
    return grupo;
  }

  /**
   * Trocar o tipo é do dono (#413): patrocinada é a comunidade que paga o PRO.
   * Com assentos ainda cobrando ou valendo, ela não vira social: os assentos
   * saem antes, em Assentos e faturas.
   */
  private async assertTypeChange(
    eu: GroupMembership,
    groupId: string,
    type: GroupType,
  ): Promise<void> {
    if (!can(eu.role, 'billing.manage')) {
      throw new ForbiddenException('Só o dono muda o tipo da comunidade');
    }
    if (type !== GroupType.SOCIAL) return;
    const pool = await this.prisma.groupSeatPool.findUnique({
      where: { groupId },
      select: { status: true },
    });
    if (pool && LIVE_POOL_STATUSES.includes(pool.status)) {
      throw new ConflictException(
        'Com assentos valendo, a comunidade segue patrocinada. Cancele os assentos em Assentos e faturas antes.',
      );
    }
  }

  /**
   * Troca o avatar da comunidade. O arquivo precisa ter sido enviado para esta
   * comunidade como avatar; o anterior é apagado do bucket.
   */
  async setAvatar(ownerId: string, groupId: string, fileId: string | null): Promise<GroupSummary> {
    await this.assertAction(ownerId, groupId, 'group.update');
    if (fileId && !this.media) throw new NotFoundException('File not found');
    const atual = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { avatarFileId: true },
    });
    if (fileId !== atual.avatarFileId) {
      const novo = fileId
        ? await this.media!.resolveForGroup(groupId, fileId, 'group_avatar')
        : null;
      await this.prisma.group.update({
        where: { id: groupId },
        data: { avatarFileId: novo?.id ?? null },
      });
      await this.media?.discardById(atual.avatarFileId);
    }
    return this.findByIdForMember(ownerId, groupId);
  }

  /**
   * Troca a capa da comunidade (#413). Mesma regra do avatar: o arquivo foi
   * enviado para esta comunidade como capa; a anterior sai do bucket.
   */
  async setCover(actorId: string, groupId: string, fileId: string | null): Promise<GroupSummary> {
    await this.assertAction(actorId, groupId, 'group.update');
    if (fileId && !this.media) throw new NotFoundException('File not found');
    const atual = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { coverFileId: true },
    });
    if (fileId !== atual.coverFileId) {
      const nova = fileId
        ? await this.media!.resolveForGroup(groupId, fileId, 'group_cover')
        : null;
      await this.prisma.group.update({
        where: { id: groupId },
        data: { coverFileId: nova?.id ?? null },
      });
      await this.media?.discardById(atual.coverFileId);
    }
    return this.findByIdForMember(actorId, groupId);
  }

  /**
   * Apaga a comunidade. Antes, os ganchos (cancelar os assentos no Asaas); a
   * cascata leva memberships, vínculos, convites e assentos — e nenhum dado de
   * saúde de ninguém, que nunca esteve sob o grupo.
   */
  async remove(ownerId: string, groupId: string): Promise<{ id: string }> {
    await this.assertAction(ownerId, groupId, 'group.delete');
    for (const gancho of this.ganchos ?? []) await gancho.beforeDelete(groupId);
    await this.prisma.group.delete({ where: { id: groupId } });
    return { id: groupId };
  }

  /**
   * Passa a comunidade para outra pessoa ativa. O antigo dono fica na equipe
   * como `PROFESSIONAL`; quem não era equipe recebe, no mesmo commit, o vínculo
   * de cada membro que já consentiu à comunidade (ADR 026).
   */
  async transferOwnership(
    ownerId: string,
    groupId: string,
    membershipId: string,
  ): Promise<GroupSummary> {
    const eu = await this.assertAction(ownerId, groupId, 'group.transfer');
    const alvo = await this.prisma.groupMembership.findUnique({ where: { id: membershipId } });
    if (!alvo || alvo.groupId !== groupId || alvo.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Membership not found');
    }
    if (alvo.id === eu.id) throw new ConflictException('Você já é o dono desta comunidade');

    const at = new Date();
    const leque = canReceiveLink(alvo.role)
      ? []
      : this.links.teamMemberLinksOps({
          groupId,
          teamUserId: alvo.userId,
          subjects: (
            await this.prisma.groupMembership.findMany({
              where: { groupId, status: MembershipStatus.ACTIVE, userId: { not: alvo.userId } },
              select: { userId: true, consentScopes: true },
            })
          ).map((m) => ({ userId: m.userId, scopes: m.consentScopes })),
          specialty: null,
          at,
        });

    // Os dois lados da posse vão para a trilha como troca de papel (#404), e a
    // especialidade que o novo dono deixa também.
    const papel = (membershipId: string, from: GroupRole, to: GroupRole) =>
      this.prisma.groupAuditLog.create({
        data: {
          groupId,
          actorId: ownerId,
          action: 'members.role',
          targetCount: 1,
          payload: { membershipIds: [membershipId], from, to },
        },
      });
    await this.prisma.$transaction([
      this.prisma.groupMembership.update({
        where: { id: eu.id },
        // Papel novo, escolhas novas (#400, #399), como em toda troca de papel.
        data: { role: GroupRole.PROFESSIONAL, reportEmail: false, riskDigest: false },
      }),
      // Especialidade é do profissional (#404): o novo dono deixa a dela.
      this.prisma.groupMembership.update({
        where: { id: alvo.id },
        data: {
          role: GroupRole.OWNER,
          specialty: null,
          accompaniedById: null,
          reportEmail: false,
          riskDigest: false,
        },
      }),
      this.prisma.group.update({ where: { id: groupId }, data: { ownerId: alvo.userId } }),
      ...leque,
      // O antigo dono vira profissional: os convites de equipe dele caem.
      revokeCreatedTeamInvitesOp(this.prisma, groupId, ownerId, GroupRole.PROFESSIONAL, at),
      papel(alvo.id, alvo.role, GroupRole.OWNER),
      papel(eu.id, GroupRole.OWNER, GroupRole.PROFESSIONAL),
      ...(alvo.specialty
        ? [
            specialtyClearedAuditOp(this.prisma, {
              groupId,
              actorId: ownerId,
              membershipId: alvo.id,
              from: alvo.specialty,
            }),
          ]
        : []),
    ]);
    return this.findByIdForMember(ownerId, groupId);
  }

  /**
   * A matriz de novo, no service (#404: o administrador também edita; passar a
   * posse e apagar seguem do dono). Não-membro recebe `NOT_FOUND` (não pode
   * descobrir que o grupo existe); membro sem o papel recebe `FORBIDDEN`. A
   * mesma regra do `GroupRoleGuard` (`docs/PERMISSIONS.md`).
   */
  private async assertAction(
    userId: string,
    groupId: string,
    action: GroupAction,
  ): Promise<GroupMembership> {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException(NOT_FOUND);
    if (!can(eu.role, action)) {
      throw new ForbiddenException('Seu papel nesta comunidade não permite isso');
    }
    return eu;
  }

  /**
   * Slug a partir do nome, com sufixo aleatório.
   *
   * O sufixo não é enfeite: sem ele "academia central" colide entre cidades
   * diferentes e o segundo dono recebe um erro que não sabe resolver.
   */
  private derivarSlug(name: string): string {
    const base = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

    return `${base || 'grupo'}-${randomBytes(4).toString('hex')}`;
  }
}
