import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AvatarVisibility,
  GroupRole,
  MembershipStatus,
  PostAuthorAs,
  PostKind,
  PostPolicy,
  type AutoPostKind,
  type GroupAnnouncement,
  type MediaFile,
  type PostReactionKind,
  type Prisma,
  type ReportReason,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import {
  NotificationService,
  REACTION_KEY_PREFIX,
  type Notice,
} from '../notifications/notification.service';
import { MediaService, type MediaView } from '../storage/media.service';
import {
  commentNotice,
  reactionNotice,
  removedNotice,
  reportReviewedNotice,
} from './community-notices';
import { blockedUserIds } from './block.service';
import { requireContentRole } from './content-roles';
import { cleanDisplayName, firstName } from './display-name';
import { can, TEAM_ROLES } from './permissions';

export const POST_BODY_MAX = 2000;
export const POST_MAX_IMAGES = 4;
export const COMMENT_BODY_MAX = 500;
export const REPORT_NOTE_MAX = 500;
/** Fixados ao mesmo tempo: o topo do mural é recado da equipe, não arquivo. */
export const MAX_PINNED = 3;
export const FEED_PAGE_SIZE = 20;
/** Aviso fixado fica no topo no máximo isto; depois volta a ser post comum. */
export const PIN_MAX_DAYS = 90;
/**
 * Votos mínimos para qualquer resultado de enquete, para todo mundo, inclusive
 * a equipe: com menos, as % apontariam quem votou em quê (o `MIN_CELL` da
 * ADR 026). Abaixo disso a API não manda nem o total.
 */
export const POLL_MIN_VOTES = 5;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;
export const POLL_QUESTION_MAX = 200;
export const POLL_OPTION_MAX = 80;
export const POLL_MAX_DAYS = 30;
export const ANNOUNCEMENT_TITLE_MAX = 120;
export const FEED_FILTERS = ['all', 'team', 'content', 'members'] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];
const DIA_MS = 86_400_000;
/** Trecho do post na fila de moderação e no cartão do chat. */
const EXCERPT_MAX = 280;

export const POST_REACTIONS = ['STRONG', 'FIRE', 'CLAP', 'HEART'] as const;
export const REPORT_REASONS = [
  'SPAM',
  'OFFENSIVE',
  'HARASSMENT',
  'MISINFORMATION',
  'OTHER',
] as const;

export interface AuthorView {
  displayName: string;
  /** Dono, profissional ou criador: o mural mostra o selo "Equipe". */
  team: boolean;
  /** O papel de quem é da equipe ("personal", "dono"); nulo para membro. */
  role: GroupRole | null;
  /** Publicado em nome da comunidade: o nome e a foto são os dela. */
  asGroup: boolean;
  isMe: boolean;
  /**
   * Foto de perfil, só quando a visibilidade escolhida deixa quem lê ver
   * (prancha Al-V9): "Minhas comunidades" mostra a todos aqui; "Só a equipe",
   * à equipe e à própria pessoa. Nulo = iniciais.
   */
  avatarUrl: string | null;
}

export interface PollOptionView {
  id: string;
  label: string;
  /** % inteiro; nulo enquanto o resultado está escondido. */
  percent: number | null;
}

/**
 * A enquete como quem pergunta pode vê-la. O resultado (`totalVotes` e as %)
 * só vem com `POLL_MIN_VOTES` votos e, para o membro, depois de votar ou com
 * a enquete encerrada (prancha Cm-21). Quem votou em quê nunca sai daqui.
 */
export interface PollView {
  question: string;
  closesAt: Date;
  closed: boolean;
  myOptionId: string | null;
  totalVotes: number | null;
  options: PollOptionView[];
  canClose: boolean;
}

export interface PostView {
  id: string;
  kind: PostKind;
  /** Título do comunicado ou do conteúdo novo; nulo no post comum. */
  title: string | null;
  body: string;
  createdAt: Date;
  author: AuthorView;
  images: MediaView[];
  pinned: boolean;
  pinnedUntil: Date | null;
  poll: PollView | null;
  /** Post automático: o conteúdo que ele anuncia. */
  auto: { kind: AutoPostKind; refId: string } | null;
  /** Só chega ao autor: para os outros, post removido não existe. */
  removed: { reason: ReportReason | null } | null;
  reactions: { counts: Record<PostReactionKind, number>; mine: PostReactionKind | null };
  commentCount: number;
  /** O autor apaga o que é dele. */
  canDelete: boolean;
  /** Quem modera remove e fixa (`content.moderate`). */
  canModerate: boolean;
  /** "Ocultar este post" e "Bloquear": não valem para o que é seu. */
  canHide: boolean;
  canBlock: boolean;
}

export interface CommentView {
  id: string;
  body: string;
  createdAt: Date;
  author: AuthorView;
  removed: boolean;
  canDelete: boolean;
  canModerate: boolean;
  canBlock: boolean;
}

export interface FeedPage {
  policy: PostPolicy;
  canPost: boolean;
  canModerate: boolean;
  /** Equipe: publica em nome da comunidade e fixa como aviso (prancha Cm-06). */
  isTeam: boolean;
  /** O nome da comunidade, para o "Publicar como". */
  groupName: string;
  /** O carrossel de avisos, na ordem da equipe. Só na primeira página. */
  pins: PostView[];
  /** Posts dos outros desde a última visita (`markSeen`). */
  unseen: number;
  /** O apelido com que a pessoa aparece, ou `null` se ainda não tem. */
  displayName: string | null;
  suggestedDisplayName: string;
  posts: PostView[];
  /** Para a próxima página; `null` no fim. */
  nextCursor: string | null;
}

export interface PostDetail extends PostView {
  comments: CommentView[];
}

export interface PollInput {
  question: string;
  options: string[];
  /** Fecha em N dias (1 a `POLL_MAX_DAYS`). */
  days: number;
}

export interface CreatePostInput {
  kind?: 'POST' | 'POLL';
  body?: string;
  imageFileIds?: string[];
  displayName?: string;
  /** Só a equipe: em nome da comunidade. */
  publishedAs?: 'PERSON' | 'GROUP';
  /** Só a equipe: "Fixar como aviso", por `pinDays` dias (nulo = sem prazo). */
  pin?: boolean;
  pinDays?: number | null;
  poll?: PollInput;
}

/** Uma linha do painel de enquetes (prancha Pn-26). */
export interface PanelPollView {
  postId: string;
  question: string;
  author: string;
  createdAt: Date;
  closesAt: Date;
  closed: boolean;
  totalVotes: number | null;
  options: { label: string; percent: number | null }[];
  /** A opção com mais votos; nula enquanto o resultado está escondido. */
  top: string | null;
}

export interface ReportInput {
  reason: ReportReason;
  note?: string | null;
  commentId?: string | null;
}

/** Uma linha da fila: as denúncias abertas de um mesmo post ou comentário. */
export interface ReportQueueItem {
  /** A denúncia mais antiga do alvo; resolver uma resolve todas. */
  reportId: string;
  postId: string;
  commentId: string | null;
  excerpt: string;
  images: number;
  author: { displayName: string; membershipId: string; team: boolean };
  reasons: Partial<Record<ReportReason, number>>;
  /** Os comentários de quem denunciou, sem dizer quem foi. */
  notes: string[];
  count: number;
  firstReportedAt: Date;
}

export interface RemovedPostView {
  id: string;
  excerpt: string;
  images: number;
  author: { displayName: string; membershipId: string };
  reason: ReportReason | null;
  removedAt: Date;
}

const AUTOR = {
  select: {
    id: true,
    userId: true,
    role: true,
    displayName: true,
    user: {
      select: { name: true, nickname: true, avatarVisibility: true, avatarFile: true },
    },
  },
} as const;

const INCLUIR = {
  author: AUTOR,
  images: { include: { file: true }, orderBy: { order: 'asc' } },
  reactions: {
    select: { membershipId: true, kind: true, membership: { select: { userId: true } } },
  },
  poll: {
    include: {
      options: {
        orderBy: { order: 'asc' },
        include: { _count: { select: { votes: true } } },
      },
    },
  },
} satisfies Prisma.GroupPostInclude;

type PostBase = Prisma.GroupPostGetPayload<{ include: typeof INCLUIR }>;
type PostRow = PostBase & { comments: number; myOptionId: string | null };
type PollRow = NonNullable<PostBase['poll']>;
type Autor = Prisma.GroupMembershipGetPayload<typeof AUTOR>;

interface Eu {
  userId: string;
  role: GroupRole;
  membershipId: string;
  /** Contas bloqueadas em qualquer sentido: somem do mural inteiro. */
  hidden: string[];
  group: { name: string; policy: PostPolicy; avatar: MediaFile | null };
  /** Desde quando contam os "posts novos". */
  seenSince: Date;
  displayName: string | null;
  userName: string;
  /** O apelido do perfil (Você, #387), que vale em toda comunidade sem apelido próprio. */
  userNickname: string | null;
  moderates: boolean;
}

const emptyReactionCounts = (): Record<PostReactionKind, number> => ({
  STRONG: 0,
  FIRE: 0,
  CLAP: 0,
  HEART: 0,
});

/** Aviso fixado que ainda está no topo: fixado, no ar e dentro do prazo. */
function activePin(now: Date): Prisma.GroupPostWhereInput {
  return {
    pinnedAt: { not: null },
    removedAt: null,
    OR: [{ pinnedUntil: null }, { pinnedUntil: { gt: now } }],
  };
}

function filterWhere(filter: FeedFilter): Prisma.GroupPostWhereInput {
  if (filter === 'content') return { kind: PostKind.AUTO };
  if (filter === 'team') {
    return {
      kind: { not: PostKind.AUTO },
      OR: [{ publishedAs: PostAuthorAs.GROUP }, { author: { role: { in: [...TEAM_ROLES] } } }],
    };
  }
  if (filter === 'members') {
    return {
      kind: { not: PostKind.AUTO },
      publishedAs: PostAuthorAs.PERSON,
      author: { role: GroupRole.MEMBER },
    };
  }
  return {};
}

/** A enquete acabou: prazo vencido ou encerrada antes. */
function pollClosed(p: { closesAt: Date; closedAt: Date | null }, now = new Date()): boolean {
  return p.closedAt !== null || p.closesAt.getTime() <= now.getTime();
}

/**
 * As % da enquete, só quando pode mostrar. Arredondadas, cada uma por si: a
 * soma pode dar 99 ou 101, como em qualquer enquete.
 *
 * Quem votou conhece o próprio voto: tirando-o do total, sobram os dos outros.
 * Por isso, para quem votou, são os **votos dos outros** que precisam chegar a
 * `POLL_MIN_VOTES` (total − 1 ≥ 5); para quem não votou, o total.
 */
function pollResults(
  options: { _count: { votes: number } }[],
  viewer: { voted: boolean; allowed: boolean },
): { total: number | null; percents: (number | null)[] } {
  const total = options.reduce((s, o) => s + o._count.votes, 0);
  const outros = viewer.voted ? total - 1 : total;
  if (!viewer.allowed || outros < POLL_MIN_VOTES) {
    return { total: null, percents: options.map(() => null) };
  }
  return { total, percents: options.map((o) => Math.round((o._count.votes / total) * 100)) };
}

function excerpt(body: string): string {
  const linha = body.replace(/\s+/g, ' ').trim();
  return linha.length > EXCERPT_MAX ? `${linha.slice(0, EXCERPT_MAX - 1)}…` : linha;
}

/**
 * O mural da comunidade (Fase 8b, redesenhado na #394).
 *
 * Todo membro ativo lê (`post.read`); publica quem a política deixa
 * (`post.create`, e `TEAM_ONLY` fecha para `MEMBER`); quem modera
 * (`content.moderate`) remove, restaura, fixa e ordena os avisos, e trata a
 * fila de denúncias.
 *
 * **Tudo é buscado com o `groupId` da URL**: `postId`, `commentId`, `reportId`,
 * `optionId` e os `fileId` das imagens chegam por input e nunca valem fora
 * dela. Post removido some para todo mundo menos o autor, que vê o aviso — e as
 * imagens ficam só para ele até apagar (ADR 028 §4).
 *
 * **Bloqueio (#394):** quem bloqueou e quem foi bloqueado deixam de se ver em
 * todo o mural: posts, comentários, reações e as contagens deles. O post
 * publicado em nome da comunidade não é de uma pessoa e continua visível.
 */
@Injectable()
export class PostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly notifications: NotificationService,
  ) {}

  // ---------------------------------------------------------------- leitura

  async list(
    userId: string,
    groupId: string,
    cursor?: string | null,
    filter: FeedFilter = 'all',
  ): Promise<FeedPage> {
    const eu = await this.me(userId, groupId, 'post.read');
    const agora = new Date();
    const visivel = this.visibleWhere(groupId, eu);

    let depois: { createdAt: Date; id: string } | null = null;
    if (cursor) {
      depois = await this.prisma.groupPost.findFirst({
        where: { id: cursor, ...visivel },
        select: { createdAt: true, id: true },
      });
      if (!depois) throw new BadRequestException('Página inválida');
    }

    // Os avisos vão no carrossel da primeira página e não se repetem no resto.
    const fixados = depois
      ? []
      : await this.prisma.groupPost.findMany({
          where: { AND: [visivel, activePin(agora)] },
          include: INCLUIR,
          orderBy: [{ pinOrder: { sort: 'asc', nulls: 'last' } }, { pinnedAt: 'desc' }],
        });
    const linhas = await this.prisma.groupPost.findMany({
      where: {
        AND: [
          visivel,
          { NOT: activePin(agora) },
          filterWhere(filter),
          depois
            ? {
                OR: [
                  { createdAt: { lt: depois.createdAt } },
                  { createdAt: depois.createdAt, id: { lt: depois.id } },
                ],
              }
            : {},
        ],
      },
      include: INCLUIR,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: FEED_PAGE_SIZE + 1,
    });
    const temMais = linhas.length > FEED_PAGE_SIZE;
    const pagina = linhas.slice(0, FEED_PAGE_SIZE);
    const [pins, rows] = await Promise.all([this.enrich(fixados, eu), this.enrich(pagina, eu)]);

    return {
      policy: eu.group.policy,
      canPost: this.canPost(eu.role, eu.group.policy),
      canModerate: eu.moderates,
      isTeam: TEAM_ROLES.includes(eu.role),
      groupName: eu.group.name,
      displayName: eu.displayName,
      suggestedDisplayName: eu.displayName ?? eu.userNickname ?? firstName(eu.userName),
      pins: await Promise.all(pins.map((r) => this.view(r, eu))),
      posts: await Promise.all(rows.map((r) => this.view(r, eu))),
      unseen: depois ? 0 : await this.countUnseen(groupId, eu),
      nextCursor: temMais ? (pagina.at(-1)?.id ?? null) : null,
    };
  }

  async get(userId: string, groupId: string, postId: string): Promise<PostDetail> {
    const eu = await this.me(userId, groupId, 'post.read');
    const row = await this.findVisible(groupId, postId, eu);
    const comentarios = await this.prisma.groupPostComment.findMany({
      where: { postId: row.id, ...this.visibleCommentWhere(eu) },
      include: { author: AUTOR },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const [completo] = await this.enrich([row], eu);
    return {
      ...(await this.view(completo!, eu)),
      comments: await Promise.all(
        comentarios.map(async (c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt,
          author: await this.author(c.author, eu),
          removed: c.removedAt !== null,
          canDelete: c.membershipId === eu.membershipId,
          canModerate: eu.moderates && c.removedAt === null,
          canBlock: c.membershipId !== eu.membershipId && c.removedAt === null,
        })),
      ),
    };
  }

  /** Quantos posts dos outros chegaram desde a última visita ao mural. */
  async unseen(userId: string, groupId: string): Promise<{ count: number }> {
    const eu = await this.me(userId, groupId, 'post.read');
    return { count: await this.countUnseen(groupId, eu) };
  }

  /** A pessoa abriu o mural: zera os "posts novos". */
  async markSeen(userId: string, groupId: string): Promise<{ seenAt: Date }> {
    const eu = await this.me(userId, groupId, 'post.read');
    const seenAt = new Date();
    await this.prisma.groupMembership.update({
      where: { id: eu.membershipId },
      data: { feedSeenAt: seenAt },
    });
    return { seenAt };
  }

  // ---------------------------------------------------------------- escrita do membro

  async create(userId: string, groupId: string, input: CreatePostInput): Promise<PostView> {
    const eu = await this.me(userId, groupId, 'post.create');
    if (!this.canPost(eu.role, eu.group.policy)) {
      throw new ForbiddenException('Nesta comunidade, só a equipe publica no mural');
    }
    const equipe = TEAM_ROLES.includes(eu.role);
    const comoGrupo = input.publishedAs === 'GROUP';
    if ((comoGrupo || input.pin) && !equipe) {
      throw new ForbiddenException('Só a equipe publica como a comunidade e fixa avisos');
    }
    const kind = input.kind === 'POLL' ? PostKind.POLL : PostKind.POST;
    const body = (input.body ?? '').trim();
    const ids = input.imageFileIds ?? [];
    if (body.length > POST_BODY_MAX) {
      throw new BadRequestException(`O post tem até ${POST_BODY_MAX} caracteres`);
    }
    if (ids.length > POST_MAX_IMAGES) {
      throw new BadRequestException(`Até ${POST_MAX_IMAGES} imagens por post`);
    }
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Imagem repetida');
    const poll = kind === PostKind.POLL ? this.cleanPoll(input.poll) : null;
    if (poll && ids.length > 0) throw new BadRequestException('Enquete não leva imagem');
    if (!poll && !body && ids.length === 0) {
      throw new BadRequestException('Escreva algo ou envie uma imagem');
    }
    const pinUntil = input.pin ? this.pinDeadline(input.pinDays ?? null) : undefined;

    const arquivos = await this.ownImages(userId, groupId, ids);
    const nome = await this.ensureDisplayName(eu, input.displayName);
    const agora = new Date();
    const criar = async (db: Prisma.TransactionClient | PrismaService) => {
      let fixado: { pinnedAt?: Date; pinOrder?: number; pinnedUntil?: Date | null } = {};
      if (input.pin) {
        await this.assertPinRoom(db, groupId);
        fixado = {
          pinnedAt: agora,
          pinOrder: await this.frontPinOrder(db, groupId),
          pinnedUntil: pinUntil,
        };
      }
      return db.groupPost.create({
        data: this.postData({
          groupId,
          membershipId: eu.membershipId,
          kind,
          body,
          publishedAs: comoGrupo ? PostAuthorAs.GROUP : PostAuthorAs.PERSON,
          fixado,
          arquivos,
          poll,
          agora,
        }),
        include: INCLUIR,
      });
    };
    const row = input.pin ? await this.withPinLock(groupId, criar) : await criar(this.prisma);
    return this.view({ ...row, comments: 0, myOptionId: null }, { ...eu, displayName: nome });
  }

  private postData(p: {
    groupId: string;
    membershipId: string;
    kind: PostKind;
    body: string;
    publishedAs: PostAuthorAs;
    fixado: { pinnedAt?: Date; pinOrder?: number; pinnedUntil?: Date | null };
    arquivos: { id: string }[];
    poll: PollInput | null;
    agora: Date;
  }): Prisma.GroupPostUncheckedCreateInput {
    const { arquivos, poll, agora } = p;
    return {
      groupId: p.groupId,
      membershipId: p.membershipId,
      kind: p.kind,
      body: p.body,
      publishedAs: p.publishedAs,
      ...p.fixado,
      images: { create: arquivos.map((f, order) => ({ fileId: f.id, order })) },
      ...(poll
        ? {
            poll: {
              create: {
                question: poll.question,
                closesAt: new Date(agora.getTime() + poll.days * DIA_MS),
                options: { create: poll.options.map((label, order) => ({ label, order })) },
              },
            },
          }
        : {}),
    };
  }

  /** O autor apaga o próprio post, com as imagens. Moderação remove, não apaga. */
  async remove(userId: string, groupId: string, postId: string): Promise<{ deleted: boolean }> {
    const eu = await this.me(userId, groupId, 'post.read');
    const row = await this.findVisible(groupId, postId, eu);
    if (row.membershipId !== eu.membershipId) {
      throw new ForbiddenException('Só quem publicou apaga o post');
    }
    const arquivos = row.images.map((i) => i.file);
    await this.prisma.groupPost.delete({ where: { id: row.id } });
    await this.media.discard(arquivos);
    return { deleted: true };
  }

  /** "Ocultar este post": some só para quem ocultou (prancha Cm-07). */
  async hide(userId: string, groupId: string, postId: string): Promise<{ hidden: boolean }> {
    const eu = await this.me(userId, groupId, 'post.read');
    const row = await this.findVisible(groupId, postId, eu);
    if (row.membershipId === eu.membershipId) {
      throw new BadRequestException('Para tirar o que é seu, apague o post');
    }
    await this.prisma.groupPostHide.upsert({
      where: { postId_membershipId: { postId: row.id, membershipId: eu.membershipId } },
      create: { postId: row.id, membershipId: eu.membershipId },
      update: {},
    });
    return { hidden: true };
  }

  async react(
    userId: string,
    groupId: string,
    postId: string,
    kind: PostReactionKind | null,
  ): Promise<PostView> {
    const eu = await this.me(userId, groupId, 'post.read');
    const row = await this.findLive(groupId, postId, eu);
    if (kind) {
      const before = await this.prisma.groupPostReaction.findUnique({
        where: { postId_membershipId: { postId: row.id, membershipId: eu.membershipId } },
        select: { id: true },
      });
      await this.prisma.groupPostReaction.upsert({
        where: { postId_membershipId: { postId: row.id, membershipId: eu.membershipId } },
        create: { postId: row.id, membershipId: eu.membershipId, kind },
        update: { kind },
      });
      // Só a reação nova avisa: trocar de emoji não é novidade para o autor.
      if (!before && row.membershipId !== eu.membershipId) {
        const author = eu.displayName ?? eu.userNickname ?? firstName(eu.userName);
        await this.notifyAuthor(
          row.membershipId,
          (groupName) => reactionNotice({ groupId, groupName, author }),
          `${REACTION_KEY_PREFIX}${row.id}`,
          author,
          eu.hidden,
        );
      }
    } else {
      await this.prisma.groupPostReaction.deleteMany({
        where: { postId: row.id, membershipId: eu.membershipId },
      });
    }
    return this.viewOne(groupId, postId, eu);
  }

  async comment(
    userId: string,
    groupId: string,
    postId: string,
    input: { body: string; displayName?: string },
  ): Promise<CommentView> {
    const eu = await this.me(userId, groupId, 'post.read');
    const row = await this.findLive(groupId, postId, eu);
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Escreva o comentário');
    if (body.length > COMMENT_BODY_MAX) {
      throw new BadRequestException(`O comentário tem até ${COMMENT_BODY_MAX} caracteres`);
    }
    const nome = await this.ensureDisplayName(eu, input.displayName);
    const c = await this.prisma.groupPostComment.create({
      data: { postId: row.id, membershipId: eu.membershipId, body },
      include: { author: AUTOR },
    });
    if (row.membershipId !== eu.membershipId) {
      // Agrupado por post: uma conversa animada não vira um aviso por comentário.
      await this.notifyAuthor(
        row.membershipId,
        (groupName) => commentNotice({ groupId, groupName, author: nome }),
        `comment:${row.id}`,
        undefined,
        eu.hidden,
      );
    }
    return {
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      author: await this.author({ ...c.author, displayName: nome }, eu),
      removed: false,
      canDelete: true,
      canModerate: eu.moderates,
      canBlock: false,
    };
  }

  async deleteComment(
    userId: string,
    groupId: string,
    postId: string,
    commentId: string,
  ): Promise<{ deleted: boolean }> {
    const eu = await this.me(userId, groupId, 'post.read');
    const c = await this.findComment(groupId, postId, commentId);
    if (c.membershipId !== eu.membershipId) {
      throw new ForbiddenException('Só quem comentou apaga o comentário');
    }
    await this.prisma.groupPostComment.delete({ where: { id: c.id } });
    return { deleted: true };
  }

  /**
   * Denunciar um post ou um comentário. Repetir a denúncia do mesmo alvo
   * enquanto ela está aberta não cria outra; a própria publicação não se
   * denuncia.
   */
  async report(
    userId: string,
    groupId: string,
    postId: string,
    input: ReportInput,
  ): Promise<{ reported: boolean }> {
    const eu = await this.me(userId, groupId, 'post.read');
    const post = await this.findLive(groupId, postId, eu);
    const comentario = input.commentId
      ? await this.findComment(groupId, postId, input.commentId)
      : null;
    if (comentario && comentario.removedAt) throw new NotFoundException('Comment not found');
    const autor = comentario ? comentario.membershipId : post.membershipId;
    if (autor === eu.membershipId) {
      throw new BadRequestException('Você não pode denunciar o que você mesmo publicou');
    }
    const note = (input.note ?? '').trim() || null;
    if (note && note.length > REPORT_NOTE_MAX) {
      throw new BadRequestException(
        `O comentário da denúncia tem até ${REPORT_NOTE_MAX} caracteres`,
      );
    }
    const aberta = await this.prisma.groupPostReport.findFirst({
      where: {
        postId: post.id,
        commentId: comentario?.id ?? null,
        reporterId: eu.membershipId,
        resolvedAt: null,
      },
      select: { id: true },
    });
    if (!aberta) {
      await this.prisma.groupPostReport.create({
        data: {
          postId: post.id,
          commentId: comentario?.id ?? null,
          reporterId: eu.membershipId,
          reason: input.reason,
          note,
        },
      });
    }
    return { reported: true };
  }

  // ---------------------------------------------------------------- enquetes

  /**
   * Votar, ou trocar de opção, até o prazo. O voto não se apaga: tirar e pôr
   * de novo deixaria comparar o resultado com e sem ele. Opção de outra
   * enquete responde como inexistente.
   */
  async vote(userId: string, groupId: string, postId: string, optionId: string): Promise<PostView> {
    if (!optionId) throw new BadRequestException('Escolha uma opção');
    const eu = await this.me(userId, groupId, 'post.read');
    const row = await this.findLive(groupId, postId, eu);
    const poll = await this.prisma.groupPoll.findUnique({
      where: { postId: row.id },
      select: { id: true, closesAt: true, closedAt: true },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    if (pollClosed(poll)) throw new ConflictException('A enquete já encerrou');
    const opcao = await this.prisma.groupPollOption.findFirst({
      where: { id: optionId, pollId: poll.id },
      select: { id: true },
    });
    if (!opcao) throw new NotFoundException('Option not found');
    await this.prisma.groupPollVote.upsert({
      where: { pollId_membershipId: { pollId: poll.id, membershipId: eu.membershipId } },
      create: { pollId: poll.id, optionId: opcao.id, membershipId: eu.membershipId },
      update: { optionId: opcao.id },
    });
    return this.viewOne(groupId, postId, eu);
  }

  /** Encerrar antes do prazo: quem publicou, quem modera ou quem comunica. */
  async closePoll(userId: string, groupId: string, postId: string): Promise<PostView> {
    const eu = await this.me(userId, groupId, 'post.read');
    const row = await this.findLive(groupId, postId, eu);
    const poll = await this.prisma.groupPoll.findUnique({
      where: { postId: row.id },
      select: { id: true, closesAt: true, closedAt: true },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    if (!this.canClosePoll(eu, row.membershipId)) {
      throw new ForbiddenException('Só quem publicou ou a equipe encerra a enquete');
    }
    if (!pollClosed(poll)) {
      await this.prisma.groupPoll.update({
        where: { id: poll.id },
        data: { closedAt: new Date() },
      });
    }
    return this.viewOne(groupId, postId, eu);
  }

  /**
   * O painel de enquetes da equipe (prancha Pn-26): todas as enquetes no ar,
   * com o resultado só a partir de `POLL_MIN_VOTES`, como para o membro.
   */
  async polls(userId: string, groupId: string): Promise<PanelPollView[]> {
    const eu = await this.me(userId, groupId, 'content.publish');
    const rows = await this.prisma.groupPost.findMany({
      where: { groupId, kind: PostKind.POLL, removedAt: null, poll: { isNot: null } },
      include: { author: AUTOR, poll: INCLUIR.poll },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const meus = new Set(
      (
        await this.prisma.groupPollVote.findMany({
          where: {
            membershipId: eu.membershipId,
            pollId: { in: rows.map((r) => r.poll!.id) },
          },
          select: { pollId: true },
        })
      ).map((v) => v.pollId),
    );
    const grupo = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { name: true },
    });
    return rows.map((r) => {
      const poll = r.poll!;
      const { total, percents } = pollResults(poll.options, {
        voted: meus.has(poll.id),
        allowed: true,
      });
      let top: string | null = null;
      if (total !== null) {
        const maior = [...poll.options].sort((a, b) => b._count.votes - a._count.votes)[0];
        top = maior?.label ?? null;
      }
      return {
        postId: r.id,
        question: poll.question,
        author: r.publishedAs === PostAuthorAs.GROUP ? grupo.name : this.nameOf(r.author),
        createdAt: r.createdAt,
        closesAt: poll.closesAt,
        closed: pollClosed(poll),
        totalVotes: total,
        options: poll.options.map((o, i) => ({ label: o.label, percent: percents[i] ?? null })),
        top,
      };
    });
  }

  // ---------------------------------------------------------------- moderação

  async moderatePost(
    userId: string,
    groupId: string,
    postId: string,
    action: 'remove' | 'restore' | 'pin' | 'unpin',
    reason?: ReportReason | null,
  ): Promise<{ id: string; pinned: boolean; removed: boolean }> {
    if (action === 'pin') {
      const r = await this.pin(userId, groupId, postId, null);
      return { id: r.id, pinned: true, removed: false };
    }
    const eu = await this.me(userId, groupId, 'content.moderate');
    const row = await this.prisma.groupPost.findFirst({
      where: { id: postId, groupId },
      select: { id: true, membershipId: true, removedAt: true, pinnedAt: true },
    });
    if (!row) throw new NotFoundException('Post not found');
    const agora = new Date();

    if (action === 'remove') {
      await this.prisma.$transaction([
        this.prisma.groupPost.update({
          where: { id: row.id },
          data: {
            removedAt: row.removedAt ?? agora,
            removedById: eu.membershipId,
            removedReason: reason ?? null,
            pinnedAt: null,
            pinOrder: null,
            pinnedUntil: null,
          },
        }),
        this.resolveOp({ postId: row.id }, eu.membershipId, 'removed', agora),
      ]);
      if (!row.removedAt) {
        await this.notifyAuthor(row.membershipId, (groupName) =>
          removedNotice({ groupId, groupName, what: 'post' }),
        );
      }
      return { id: row.id, pinned: false, removed: true };
    }
    if (action === 'restore') {
      await this.prisma.groupPost.update({
        where: { id: row.id },
        data: { removedAt: null, removedById: null, removedReason: null },
      });
      return { id: row.id, pinned: false, removed: false };
    }
    if (row.removedAt) throw new ConflictException('Post removido não fica fixado');
    if (row.pinnedAt) {
      await this.prisma.groupPost.update({
        where: { id: row.id },
        data: { pinnedAt: null, pinOrder: null, pinnedUntil: null },
      });
    }
    return { id: row.id, pinned: false, removed: false };
  }

  /**
   * Fixar como aviso (até `MAX_PINNED` no topo): entra na frente do carrossel,
   * por `days` dias ou sem prazo. Fixar de novo um aviso só troca o prazo.
   */
  async pin(
    userId: string,
    groupId: string,
    postId: string,
    days: number | null,
  ): Promise<{ id: string; pinnedUntil: Date | null }> {
    await this.me(userId, groupId, 'content.moderate');
    const agora = new Date();
    const row = await this.prisma.groupPost.findFirst({
      where: { id: postId, groupId },
      select: { id: true, removedAt: true },
    });
    if (!row) throw new NotFoundException('Post not found');
    if (row.removedAt) throw new ConflictException('Post removido não fica fixado');
    const pinnedUntil = this.pinDeadline(days);
    await this.withPinLock(groupId, async (tx) => {
      const jaNoTopo = await tx.groupPost.count({
        where: { id: row.id, ...activePin(agora) },
      });
      if (jaNoTopo) {
        await tx.groupPost.update({ where: { id: row.id }, data: { pinnedUntil } });
        return;
      }
      await this.assertPinRoom(tx, groupId);
      await tx.groupPost.update({
        where: { id: row.id },
        data: { pinnedAt: agora, pinnedUntil, pinOrder: await this.frontPinOrder(tx, groupId) },
      });
    });
    return { id: row.id, pinnedUntil };
  }

  /**
   * A ordem do carrossel, como a equipe arrastou. Precisa trazer todos os avisos.
   * Se o topo tiver mais que `MAX_PINNED` (estado de antes da trava), os que
   * passarem do teto no fim da nova ordem voltam a ser post comum.
   */
  async reorderPins(
    userId: string,
    groupId: string,
    postIds: string[],
  ): Promise<{ order: string[] }> {
    await this.me(userId, groupId, 'content.moderate');
    return this.withPinLock(groupId, async (tx) => {
      const atuais = await tx.groupPost.findMany({
        where: { groupId, ...activePin(new Date()) },
        select: { id: true },
      });
      const ids = new Set(atuais.map((p) => p.id));
      if (
        postIds.length !== ids.size ||
        new Set(postIds).size !== postIds.length ||
        postIds.some((id) => !ids.has(id))
      ) {
        throw new BadRequestException('A nova ordem precisa ter todos os avisos fixados');
      }
      const ficam = postIds.slice(0, MAX_PINNED);
      const saem = postIds.slice(MAX_PINNED);
      for (const [pinOrder, id] of ficam.entries()) {
        await tx.groupPost.update({ where: { id }, data: { pinOrder } });
      }
      if (saem.length > 0) {
        await tx.groupPost.updateMany({
          where: { id: { in: saem } },
          data: { pinnedAt: null, pinOrder: null, pinnedUntil: null },
        });
      }
      return { order: ficam };
    });
  }

  /**
   * Publica um comunicado (agora ou pelo job dos agendados). Com o topo cheio,
   * o aviso novo entra e o último do carrossel volta a ser post comum: o
   * horário marcado não pode falhar por falta de espaço.
   */
  async publishAnnouncement(a: GroupAnnouncement, now: Date): Promise<{ postId: string }> {
    const ativa = await this.prisma.groupMembership.findFirst({
      where: { id: a.membershipId, status: MembershipStatus.ACTIVE },
      select: { id: true },
    });
    if (!ativa) throw new ConflictException('Quem agendou não está mais na comunidade');
    const publicar = async (db: Prisma.TransactionClient | PrismaService) => {
      if (a.pin) {
        const fixados = await db.groupPost.findMany({
          where: { groupId: a.groupId, ...activePin(now) },
          orderBy: [{ pinOrder: { sort: 'asc', nulls: 'last' } }, { pinnedAt: 'desc' }],
          select: { id: true },
        });
        const sobra = fixados.slice(MAX_PINNED - 1);
        if (sobra.length > 0) {
          await db.groupPost.updateMany({
            where: { id: { in: sobra.map((p) => p.id) } },
            data: { pinnedAt: null, pinOrder: null, pinnedUntil: null },
          });
        }
      }
      return db.groupPost.create({
        data: {
          groupId: a.groupId,
          membershipId: a.membershipId,
          kind: PostKind.ANNOUNCEMENT,
          title: a.title,
          body: a.body,
          publishedAs: a.publishedAs,
          announcementId: a.id,
          createdAt: now,
          ...(a.pin
            ? {
                pinnedAt: now,
                pinOrder: await this.frontPinOrder(db, a.groupId),
                pinnedUntil: a.pinDays ? new Date(now.getTime() + a.pinDays * DIA_MS) : null,
              }
            : {}),
        },
        select: { id: true },
      });
    };
    const post = a.pin ? await this.withPinLock(a.groupId, publicar) : await publicar(this.prisma);
    return { postId: post.id };
  }

  async removeComment(
    userId: string,
    groupId: string,
    postId: string,
    commentId: string,
  ): Promise<{ id: string; removed: boolean }> {
    const eu = await this.me(userId, groupId, 'content.moderate');
    const c = await this.findComment(groupId, postId, commentId);
    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.groupPostComment.update({
        where: { id: c.id },
        data: { removedAt: c.removedAt ?? agora, removedById: eu.membershipId },
      }),
      this.resolveOp({ commentId: c.id }, eu.membershipId, 'removed', agora),
    ]);
    if (!c.removedAt) {
      await this.notifyAuthor(c.membershipId, (groupName) =>
        removedNotice({ groupId, groupName, what: 'comment' }),
      );
    }
    return { id: c.id, removed: true };
  }

  /** A fila: denúncias abertas agrupadas por alvo, a mais antiga primeiro. */
  async reports(userId: string, groupId: string): Promise<ReportQueueItem[]> {
    await this.me(userId, groupId, 'content.moderate');
    const abertas = await this.prisma.groupPostReport.findMany({
      where: { resolvedAt: null, post: { groupId } },
      include: {
        post: {
          select: {
            id: true,
            body: true,
            removedAt: true,
            author: AUTOR,
            _count: { select: { images: true } },
          },
        },
        comment: { select: { id: true, body: true, removedAt: true, author: AUTOR } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    const fila = new Map<string, ReportQueueItem>();
    for (const r of abertas) {
      const chave = `${r.postId}:${r.commentId ?? ''}`;
      let item = fila.get(chave);
      if (!item) {
        const autor = r.comment ? r.comment.author : r.post.author;
        item = {
          reportId: r.id,
          postId: r.postId,
          commentId: r.commentId,
          excerpt: excerpt(r.comment ? r.comment.body : r.post.body),
          images: r.comment ? 0 : r.post._count.images,
          author: {
            displayName: this.nameOf(autor),
            membershipId: autor.id,
            team: TEAM_ROLES.includes(autor.role),
          },
          reasons: {},
          notes: [],
          count: 0,
          firstReportedAt: r.createdAt,
        };
        fila.set(chave, item);
      }
      item.count += 1;
      item.reasons[r.reason] = (item.reasons[r.reason] ?? 0) + 1;
      if (r.note && item.notes.length < 5) item.notes.push(r.note);
    }
    return [...fila.values()];
  }

  /**
   * Resolver uma denúncia resolve todas as abertas do mesmo alvo: remover tira
   * o post (ou o comentário) do mural; descartar mantém.
   */
  async resolveReport(
    userId: string,
    groupId: string,
    reportId: string,
    action: 'remove' | 'dismiss',
  ): Promise<{ resolved: number }> {
    const eu = await this.me(userId, groupId, 'content.moderate');
    const r = await this.prisma.groupPostReport.findFirst({
      where: { id: reportId, post: { groupId } },
      select: { postId: true, commentId: true },
    });
    if (!r) throw new NotFoundException('Report not found');
    const alvo = r.commentId ? { commentId: r.commentId } : { postId: r.postId, commentId: null };
    // Quem denunciou e ainda está na comunidade fica sabendo que a equipe olhou
    // (prancha Ex-06): só isso, sem a decisão nem o conteúdo.
    const quemDenunciou = await this.prisma.groupPostReport.findMany({
      where: { ...alvo, resolvedAt: null, reporter: { status: MembershipStatus.ACTIVE } },
      select: {
        reporter: { select: { userId: true } },
        post: { select: { group: { select: { name: true } } } },
      },
    });
    const avisar = () => {
      if (quemDenunciou.length === 0) return;
      this.notifications.notify(
        quemDenunciou.map((d) => d.reporter.userId),
        reportReviewedNotice({ groupId, groupName: quemDenunciou[0]!.post.group.name }),
      );
    };
    if (action === 'remove') {
      if (r.commentId) await this.removeComment(userId, groupId, r.postId, r.commentId);
      else await this.moderatePost(userId, groupId, r.postId, 'remove', await this.topReason(r));
      avisar();
      return { resolved: 1 };
    }
    const feito = await this.resolveOp(alvo, eu.membershipId, 'dismissed', new Date());
    avisar();
    return { resolved: feito.count };
  }

  /** Removidos nos últimos 30 dias, para desfazer engano. Só o texto. */
  async removed(userId: string, groupId: string): Promise<RemovedPostView[]> {
    await this.me(userId, groupId, 'content.moderate');
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const rows = await this.prisma.groupPost.findMany({
      where: { groupId, removedAt: { gte: desde } },
      include: { author: AUTOR, _count: { select: { images: true } } },
      orderBy: { removedAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      excerpt: excerpt(r.body),
      images: r._count.images,
      author: { displayName: this.nameOf(r.author), membershipId: r.author.id },
      reason: r.removedReason,
      removedAt: r.removedAt!,
    }));
  }

  // ---------------------------------------------------------------- internos

  /**
   * Avisa o autor (Fase 8c) só se a associação dele ainda está ativa: quem
   * saiu ou foi banido não recebe aviso de uma comunidade em que não está.
   */
  private async notifyAuthor(
    membershipId: string,
    notice: (groupName: string) => Notice,
    groupKey?: string,
    actor?: string,
    /**
     * Quem tem bloqueio com quem agiu (#394). O post em nome da comunidade
     * continua visível para os dois, mas o autor não fica sabendo da pessoa.
     */
    blocked: readonly string[] = [],
  ): Promise<void> {
    const autor = await this.prisma.groupMembership.findFirst({
      where: { id: membershipId, status: MembershipStatus.ACTIVE },
      select: { userId: true, group: { select: { name: true } } },
    });
    if (!autor || blocked.includes(autor.userId)) return;
    const aviso = notice(autor.group.name);
    if (groupKey) {
      this.notifications.notifyGrouped(autor.userId, groupKey, aviso, autor.group.name, actor);
    } else {
      this.notifications.notify([autor.userId], aviso);
    }
  }

  private canPost(role: GroupRole, policy: PostPolicy): boolean {
    return policy === PostPolicy.ALL_MEMBERS || TEAM_ROLES.includes(role);
  }

  private canClosePoll(eu: Eu, authorMembershipId: string): boolean {
    return (
      authorMembershipId === eu.membershipId || eu.moderates || can(eu.role, 'announcement.publish')
    );
  }

  private async me(
    userId: string,
    groupId: string,
    action: 'post.read' | 'post.create' | 'content.moderate' | 'content.publish',
  ): Promise<Eu> {
    const role = await requireContentRole(
      this.prisma,
      userId,
      groupId,
      action,
      action === 'content.moderate'
        ? 'Seu papel não modera esta comunidade'
        : 'Seu papel não publica no mural',
    );
    const [m, hidden] = await Promise.all([
      this.prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId } },
        select: {
          id: true,
          displayName: true,
          feedSeenAt: true,
          joinedAt: true,
          createdAt: true,
          user: { select: { name: true, nickname: true } },
          group: { select: { name: true, postPolicy: true, avatarFile: true } },
        },
      }),
      blockedUserIds(this.prisma, userId),
    ]);
    return {
      userId,
      role,
      membershipId: m.id,
      hidden,
      group: { name: m.group.name, policy: m.group.postPolicy, avatar: m.group.avatarFile },
      seenSince: m.feedSeenAt ?? m.joinedAt ?? m.createdAt,
      displayName: m.displayName,
      userName: m.user.name,
      userNickname: m.user.nickname,
      moderates: can(role, 'content.moderate'),
    };
  }

  /**
   * O que quem pergunta enxerga: no ar (ou removido mas dele), não ocultado
   * por ele e de ninguém com quem haja bloqueio — a não ser que o post seja
   * da comunidade, e não de uma pessoa.
   */
  private visibleWhere(groupId: string, eu: Eu): Prisma.GroupPostWhereInput {
    const e: Prisma.GroupPostWhereInput[] = [
      { OR: [{ removedAt: null }, { membershipId: eu.membershipId }] },
      { hides: { none: { membershipId: eu.membershipId } } },
    ];
    if (eu.hidden.length > 0) {
      e.push({
        OR: [{ publishedAs: PostAuthorAs.GROUP }, { author: { userId: { notIn: eu.hidden } } }],
      });
    }
    return { groupId, AND: e };
  }

  private visibleCommentWhere(eu: Eu): Prisma.GroupPostCommentWhereInput {
    return {
      OR: [{ removedAt: null }, { membershipId: eu.membershipId }],
      ...(eu.hidden.length > 0 ? { author: { userId: { notIn: eu.hidden } } } : {}),
    };
  }

  private countUnseen(groupId: string, eu: Eu): Promise<number> {
    return this.prisma.groupPost.count({
      where: {
        AND: [
          this.visibleWhere(groupId, eu),
          { removedAt: null, createdAt: { gt: eu.seenSince } },
          { membershipId: { not: eu.membershipId } },
        ],
      },
    });
  }

  private cleanPoll(poll: PollInput | undefined): PollInput {
    if (!poll) throw new BadRequestException('Escreva a pergunta e as opções da enquete');
    const question = poll.question.trim();
    const options = poll.options.map((o) => o.trim());
    if (!question || question.length > POLL_QUESTION_MAX) {
      throw new BadRequestException(`A pergunta tem de 1 a ${POLL_QUESTION_MAX} caracteres`);
    }
    if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) {
      throw new BadRequestException(
        `A enquete tem de ${POLL_MIN_OPTIONS} a ${POLL_MAX_OPTIONS} opções`,
      );
    }
    if (options.some((o) => !o || o.length > POLL_OPTION_MAX)) {
      throw new BadRequestException(`Cada opção tem de 1 a ${POLL_OPTION_MAX} caracteres`);
    }
    if (new Set(options.map((o) => o.toLocaleLowerCase('pt-BR'))).size !== options.length) {
      throw new BadRequestException('Opção repetida');
    }
    if (!Number.isInteger(poll.days) || poll.days < 1 || poll.days > POLL_MAX_DAYS) {
      throw new BadRequestException(`A enquete fica aberta de 1 a ${POLL_MAX_DAYS} dias`);
    }
    return { question, options, days: poll.days };
  }

  private pinDeadline(days: number | null): Date | null {
    if (days === null) return null;
    if (!Number.isInteger(days) || days < 1 || days > PIN_MAX_DAYS) {
      throw new BadRequestException(`O aviso fica no topo de 1 a ${PIN_MAX_DAYS} dias`);
    }
    return new Date(Date.now() + days * DIA_MS);
  }

  /**
   * Tudo o que põe aviso no topo passa por aqui: uma transação com a trava
   * `pg_advisory_xact_lock` da comunidade. Dois pedidos ao mesmo tempo não
   * contam o mesmo topo e furam o teto de `MAX_PINNED`.
   */
  private withPinLock<T>(
    groupId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`pins:${groupId}`}))`;
      return fn(tx);
    });
  }

  private async assertPinRoom(
    db: Prisma.TransactionClient | PrismaService,
    groupId: string,
  ): Promise<void> {
    const fixados = await db.groupPost.count({
      where: { groupId, ...activePin(new Date()) },
    });
    if (fixados >= MAX_PINNED) {
      throw new ConflictException(`Até ${MAX_PINNED} avisos fixados. Desafixe um antes.`);
    }
  }

  /** A posição da frente do carrossel: uma antes do primeiro aviso. */
  private async frontPinOrder(
    db: Prisma.TransactionClient | PrismaService,
    groupId: string,
  ): Promise<number> {
    const r = await db.groupPost.aggregate({
      where: { groupId, ...activePin(new Date()) },
      _min: { pinOrder: true },
    });
    return (r._min.pinOrder ?? 1) - 1;
  }

  /**
   * Quem ainda não tem apelido ganha um ao publicar: o escolhido ou o primeiro
   * nome. O apelido do perfil não é copiado para a comunidade: ele continua
   * valendo pelo `nameOf`, e trocar no perfil troca aqui também.
   */
  private async ensureDisplayName(eu: Eu, escolhido?: string): Promise<string> {
    if (eu.displayName && !escolhido) return eu.displayName;
    if (!escolhido && eu.userNickname) return eu.userNickname;
    const nome = cleanDisplayName(escolhido ?? firstName(eu.userName));
    if (nome !== eu.displayName) {
      await this.prisma.groupMembership.update({
        where: { id: eu.membershipId },
        data: { displayName: nome },
      });
    }
    return nome;
  }

  /**
   * As imagens do post: enviadas por esta pessoa, para o mural desta
   * comunidade, prontas e ainda sem post. Qualquer outra coisa responde como
   * inexistente.
   */
  private async ownImages(userId: string, groupId: string, ids: string[]): Promise<MediaFile[]> {
    if (ids.length === 0) return [];
    const arquivos: MediaFile[] = [];
    for (const id of ids) {
      const f = await this.media.resolveForGroup(groupId, id, 'post_image');
      if (f.uploaderId !== userId) throw new NotFoundException('File not found');
      arquivos.push(f);
    }
    const usados = await this.prisma.groupPostImage.count({ where: { fileId: { in: ids } } });
    if (usados > 0) throw new ConflictException('Esta imagem já está em outro post');
    return arquivos;
  }

  /** Visível para quem pergunta (`visibleWhere`). */
  private async findVisible(groupId: string, postId: string, eu: Eu) {
    const row = await this.prisma.groupPost.findFirst({
      where: { AND: [{ id: postId }, this.visibleWhere(groupId, eu)] },
      include: INCLUIR,
    });
    if (!row) throw new NotFoundException('Post not found');
    return row;
  }

  /**
   * No ar e visível: reagir, comentar, votar e denunciar só valem para post
   * que todo mundo vê — e que quem pergunta enxerga (bloqueio responde 404).
   */
  private async findLive(groupId: string, postId: string, eu: Eu) {
    const row = await this.prisma.groupPost.findFirst({
      where: { AND: [{ id: postId, removedAt: null }, this.visibleWhere(groupId, eu)] },
      select: { id: true, membershipId: true },
    });
    if (!row) throw new NotFoundException('Post not found');
    return row;
  }

  private async findComment(groupId: string, postId: string, commentId: string) {
    const c = await this.prisma.groupPostComment.findFirst({
      where: { id: commentId, postId, post: { groupId } },
      select: { id: true, membershipId: true, removedAt: true },
    });
    if (!c) throw new NotFoundException('Comment not found');
    return c;
  }

  private resolveOp(
    alvo: { postId?: string; commentId?: string | null },
    by: string,
    resolution: 'removed' | 'dismissed',
    at: Date,
  ) {
    return this.prisma.groupPostReport.updateMany({
      where: { ...alvo, resolvedAt: null },
      data: { resolvedAt: at, resolvedById: by, resolution },
    });
  }

  /** O motivo mais denunciado; no empate, o que chegou primeiro. */
  private async topReason(r: { postId: string }): Promise<ReportReason | null> {
    const abertas = await this.prisma.groupPostReport.findMany({
      where: { postId: r.postId, commentId: null, resolvedAt: null },
      select: { reason: true },
      orderBy: { createdAt: 'asc' },
    });
    const contagem = new Map<ReportReason, number>();
    for (const a of abertas) contagem.set(a.reason, (contagem.get(a.reason) ?? 0) + 1);
    let melhor: ReportReason | null = null;
    for (const [motivo, n] of contagem) {
      if (melhor === null || n > contagem.get(melhor)!) melhor = motivo;
    }
    return melhor;
  }

  /**
   * Os comentários que quem pergunta enxerga, contados numa consulta só, e o
   * voto dele nas enquetes da página.
   */
  private async enrich(rows: PostBase[], eu: Eu): Promise<PostRow[]> {
    if (rows.length === 0) return [];
    const [contagem, votos] = await Promise.all([
      this.prisma.groupPostComment.groupBy({
        by: ['postId'],
        where: { postId: { in: rows.map((r) => r.id) }, ...this.visibleCommentWhere(eu) },
        _count: { _all: true },
      }),
      this.prisma.groupPollVote.findMany({
        where: {
          membershipId: eu.membershipId,
          pollId: { in: rows.flatMap((r) => (r.poll ? [r.poll.id] : [])) },
        },
        select: { pollId: true, optionId: true },
      }),
    ]);
    const porPost = new Map(contagem.map((c) => [c.postId, c._count._all]));
    const meuVoto = new Map(votos.map((v) => [v.pollId, v.optionId]));
    return rows.map((r) => ({
      ...r,
      comments: porPost.get(r.id) ?? 0,
      myOptionId: r.poll ? (meuVoto.get(r.poll.id) ?? null) : null,
    }));
  }

  private async viewOne(groupId: string, postId: string, eu: Eu): Promise<PostView> {
    const atual = await this.findVisible(groupId, postId, eu);
    const [completo] = await this.enrich([atual], eu);
    return this.view(completo!, eu);
  }

  /** Apelido da comunidade, senão o do perfil (Você, #387), senão o primeiro nome. */
  private nameOf(a: Autor): string {
    return a.displayName ?? a.user.nickname ?? firstName(a.user.name);
  }

  private async author(a: Autor, eu: Eu, asGroup = false): Promise<AuthorView> {
    const isMe = a.id === eu.membershipId;
    if (asGroup) {
      const foto = await this.media.viewOrNull(eu.group.avatar);
      return {
        avatarUrl: foto?.url ?? null,
        displayName: eu.group.name,
        team: true,
        role: null,
        asGroup: true,
        isMe,
      };
    }
    const podeVer =
      a.user.avatarVisibility === AvatarVisibility.COMMUNITIES ||
      isMe ||
      TEAM_ROLES.includes(eu.role);
    const foto = podeVer ? await this.media.viewOrNull(a.user.avatarFile) : null;
    const team = TEAM_ROLES.includes(a.role);
    return {
      avatarUrl: foto?.url ?? null,
      displayName: this.nameOf(a),
      team,
      role: team ? a.role : null,
      asGroup: false,
      isMe,
    };
  }

  private pollView(poll: PollRow, myOptionId: string | null, eu: Eu, authorId: string): PollView {
    const closed = pollClosed(poll);
    const { total, percents } = pollResults(poll.options, {
      voted: myOptionId !== null,
      allowed: myOptionId !== null || closed,
    });
    return {
      question: poll.question,
      closesAt: poll.closesAt,
      closed,
      myOptionId,
      totalVotes: total,
      options: poll.options.map((o, i) => ({
        id: o.id,
        label: o.label,
        percent: percents[i] ?? null,
      })),
      canClose: !closed && this.canClosePoll(eu, authorId),
    };
  }

  private async view(r: PostRow, eu: Eu): Promise<PostView> {
    const counts = emptyReactionCounts();
    // Reação de quem tem bloqueio com quem pergunta não conta nem aparece.
    const reacoes = r.reactions.filter((re) => !eu.hidden.includes(re.membership.userId));
    for (const re of reacoes) counts[re.kind] += 1;
    const meu = r.membershipId === eu.membershipId;
    const asGroup = r.publishedAs === PostAuthorAs.GROUP;
    const pinned =
      r.pinnedAt !== null &&
      r.removedAt === null &&
      (r.pinnedUntil === null || r.pinnedUntil.getTime() > Date.now());
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt,
      author: await this.author(r.author, eu, asGroup),
      images: await Promise.all(r.images.map((i) => this.media.view(i.file))),
      pinned,
      pinnedUntil: pinned ? r.pinnedUntil : null,
      poll: r.poll ? this.pollView(r.poll, r.myOptionId, eu, r.membershipId) : null,
      auto: r.autoKind && r.autoRefId ? { kind: r.autoKind, refId: r.autoRefId } : null,
      removed: r.removedAt ? { reason: r.removedReason } : null,
      reactions: {
        counts,
        mine: reacoes.find((re) => re.membershipId === eu.membershipId)?.kind ?? null,
      },
      commentCount: r.comments,
      canDelete: meu,
      canModerate: eu.moderates && r.removedAt === null,
      canHide: !meu,
      canBlock: !meu && !asGroup,
    };
  }
}
