import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  PostPolicy,
  type GroupRole,
  type MediaFile,
  type PostReactionKind,
  type Prisma,
  type ReportReason,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { MediaService, type MediaView } from '../storage/media.service';
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
  isMe: boolean;
}

export interface PostView {
  id: string;
  body: string;
  createdAt: Date;
  author: AuthorView;
  images: MediaView[];
  pinned: boolean;
  /** Só chega ao autor: para os outros, post removido não existe. */
  removed: { reason: ReportReason | null } | null;
  reactions: { counts: Record<PostReactionKind, number>; mine: PostReactionKind | null };
  commentCount: number;
  /** O autor apaga o que é dele. */
  canDelete: boolean;
  /** Quem modera remove e fixa (`content.moderate`). */
  canModerate: boolean;
}

export interface CommentView {
  id: string;
  body: string;
  createdAt: Date;
  author: AuthorView;
  removed: boolean;
  canDelete: boolean;
  canModerate: boolean;
}

export interface FeedPage {
  policy: PostPolicy;
  canPost: boolean;
  canModerate: boolean;
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

export interface CreatePostInput {
  body?: string;
  imageFileIds?: string[];
  displayName?: string;
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
    role: true,
    displayName: true,
    user: { select: { name: true } },
  },
} as const;

const INCLUIR = {
  author: AUTOR,
  images: { include: { file: true }, orderBy: { order: 'asc' } },
  reactions: { select: { membershipId: true, kind: true } },
} satisfies Prisma.GroupPostInclude;

type PostRow = Prisma.GroupPostGetPayload<{ include: typeof INCLUIR }> & { comments: number };
type Autor = Prisma.GroupMembershipGetPayload<typeof AUTOR>;

interface Eu {
  role: GroupRole;
  membershipId: string;
  displayName: string | null;
  userName: string;
  moderates: boolean;
}

const zeradas = (): Record<PostReactionKind, number> => ({ STRONG: 0, FIRE: 0, CLAP: 0, HEART: 0 });

function excerpt(body: string): string {
  const linha = body.replace(/\s+/g, ' ').trim();
  return linha.length > EXCERPT_MAX ? `${linha.slice(0, EXCERPT_MAX - 1)}…` : linha;
}

/**
 * O mural da comunidade (Fase 8b).
 *
 * Todo membro ativo lê (`post.read`); publica quem a política deixa
 * (`post.create`, e `TEAM_ONLY` fecha para `MEMBER`); quem modera
 * (`content.moderate`) remove, restaura e fixa, e trata a fila de denúncias.
 *
 * **Tudo é buscado com o `groupId` da URL**: `postId`, `commentId`, `reportId`
 * e os `fileId` das imagens chegam por input e nunca valem fora dela. Post
 * removido some para todo mundo menos o autor, que vê o aviso — e as imagens
 * ficam só para ele até apagar (ADR 028 §4).
 */
@Injectable()
export class PostService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly media: MediaService | null,
  ) {}

  // ---------------------------------------------------------------- leitura

  async list(userId: string, groupId: string, cursor?: string | null): Promise<FeedPage> {
    const eu = await this.me(userId, groupId, 'post.read');
    const policy = await this.policyOf(groupId);
    const visivel: Prisma.GroupPostWhereInput = {
      groupId,
      OR: [{ removedAt: null }, { membershipId: eu.membershipId }],
    };

    let depois: { createdAt: Date; id: string } | null = null;
    if (cursor) {
      depois = await this.prisma.groupPost.findFirst({
        where: { id: cursor, ...visivel },
        select: { createdAt: true, id: true },
      });
      if (!depois) throw new BadRequestException('Página inválida');
    }

    // Os fixados vão no topo da primeira página e não se repetem no resto.
    const fixados = depois
      ? []
      : await this.prisma.groupPost.findMany({
          where: { groupId, removedAt: null, pinnedAt: { not: null } },
          include: INCLUIR,
          orderBy: { pinnedAt: 'desc' },
        });
    const linhas = await this.prisma.groupPost.findMany({
      where: {
        ...visivel,
        AND: [
          { OR: [{ pinnedAt: null }, { removedAt: { not: null } }] },
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
    const rows = await this.withCommentCounts([...fixados, ...pagina], eu);

    return {
      policy,
      canPost: this.canPost(eu.role, policy),
      canModerate: eu.moderates,
      displayName: eu.displayName,
      suggestedDisplayName: eu.displayName ?? firstName(eu.userName),
      posts: await Promise.all(rows.map((r) => this.view(r, eu))),
      nextCursor: temMais ? (pagina.at(-1)?.id ?? null) : null,
    };
  }

  async get(userId: string, groupId: string, postId: string): Promise<PostDetail> {
    const eu = await this.me(userId, groupId, 'post.read');
    const row = await this.findVisible(groupId, postId, eu);
    const comentarios = await this.prisma.groupPostComment.findMany({
      where: {
        postId: row.id,
        OR: [{ removedAt: null }, { membershipId: eu.membershipId }],
      },
      include: { author: AUTOR },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const [comContagem] = await this.withCommentCounts([row], eu);
    return {
      ...(await this.view(comContagem!, eu)),
      comments: comentarios.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        author: this.author(c.author, eu),
        removed: c.removedAt !== null,
        canDelete: c.membershipId === eu.membershipId,
        canModerate: eu.moderates && c.removedAt === null,
      })),
    };
  }

  // ---------------------------------------------------------------- escrita do membro

  async create(userId: string, groupId: string, input: CreatePostInput): Promise<PostView> {
    const eu = await this.me(userId, groupId, 'post.create');
    const policy = await this.policyOf(groupId);
    if (!this.canPost(eu.role, policy)) {
      throw new ForbiddenException('Nesta comunidade, só a equipe publica no mural');
    }
    const body = (input.body ?? '').trim();
    const ids = input.imageFileIds ?? [];
    if (body.length > POST_BODY_MAX) {
      throw new BadRequestException(`O post tem até ${POST_BODY_MAX} caracteres`);
    }
    if (ids.length > POST_MAX_IMAGES) {
      throw new BadRequestException(`Até ${POST_MAX_IMAGES} imagens por post`);
    }
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Imagem repetida');
    if (!body && ids.length === 0)
      throw new BadRequestException('Escreva algo ou envie uma imagem');

    const arquivos = await this.ownImages(userId, groupId, ids);
    const nome = await this.ensureDisplayName(eu, input.displayName);
    const row = await this.prisma.groupPost.create({
      data: {
        groupId,
        membershipId: eu.membershipId,
        body,
        images: { create: arquivos.map((f, order) => ({ fileId: f.id, order })) },
      },
      include: INCLUIR,
    });
    return this.view({ ...row, comments: 0 }, { ...eu, displayName: nome });
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
    await this.media?.discard(arquivos);
    return { deleted: true };
  }

  async react(
    userId: string,
    groupId: string,
    postId: string,
    kind: PostReactionKind | null,
  ): Promise<PostView> {
    const eu = await this.me(userId, groupId, 'post.read');
    const row = await this.findLive(groupId, postId);
    if (kind) {
      await this.prisma.groupPostReaction.upsert({
        where: { postId_membershipId: { postId: row.id, membershipId: eu.membershipId } },
        create: { postId: row.id, membershipId: eu.membershipId, kind },
        update: { kind },
      });
    } else {
      await this.prisma.groupPostReaction.deleteMany({
        where: { postId: row.id, membershipId: eu.membershipId },
      });
    }
    const atual = await this.findVisible(groupId, postId, eu);
    const [comContagem] = await this.withCommentCounts([atual], eu);
    return this.view(comContagem!, eu);
  }

  async comment(
    userId: string,
    groupId: string,
    postId: string,
    input: { body: string; displayName?: string },
  ): Promise<CommentView> {
    const eu = await this.me(userId, groupId, 'post.read');
    const row = await this.findLive(groupId, postId);
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
    return {
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      author: this.author({ ...c.author, displayName: nome }, eu),
      removed: false,
      canDelete: true,
      canModerate: eu.moderates,
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
    const post = await this.findLive(groupId, postId);
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

  // ---------------------------------------------------------------- moderação

  async moderatePost(
    userId: string,
    groupId: string,
    postId: string,
    action: 'remove' | 'restore' | 'pin' | 'unpin',
    reason?: ReportReason | null,
  ): Promise<{ id: string; pinned: boolean; removed: boolean }> {
    const eu = await this.me(userId, groupId, 'content.moderate');
    const row = await this.prisma.groupPost.findFirst({
      where: { id: postId, groupId },
      select: { id: true, removedAt: true, pinnedAt: true },
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
          },
        }),
        this.resolveOp({ postId: row.id }, eu.membershipId, 'removed', agora),
      ]);
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
    if (action === 'pin' && !row.pinnedAt) {
      const fixados = await this.prisma.groupPost.count({
        where: { groupId, removedAt: null, pinnedAt: { not: null } },
      });
      if (fixados >= MAX_PINNED) {
        throw new ConflictException(`Até ${MAX_PINNED} posts fixados. Desafixe um antes.`);
      }
      await this.prisma.groupPost.update({ where: { id: row.id }, data: { pinnedAt: agora } });
    }
    if (action === 'unpin' && row.pinnedAt) {
      await this.prisma.groupPost.update({ where: { id: row.id }, data: { pinnedAt: null } });
    }
    return { id: row.id, pinned: action === 'pin', removed: false };
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
    if (action === 'remove') {
      if (r.commentId) await this.removeComment(userId, groupId, r.postId, r.commentId);
      else await this.moderatePost(userId, groupId, r.postId, 'remove', await this.topReason(r));
      return { resolved: 1 };
    }
    const alvo = r.commentId ? { commentId: r.commentId } : { postId: r.postId, commentId: null };
    const feito = await this.resolveOp(alvo, eu.membershipId, 'dismissed', new Date());
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

  private canPost(role: GroupRole, policy: PostPolicy): boolean {
    return policy === PostPolicy.ALL_MEMBERS || TEAM_ROLES.includes(role);
  }

  private async me(
    userId: string,
    groupId: string,
    action: 'post.read' | 'post.create' | 'content.moderate',
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
    const m = await this.prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true, displayName: true, user: { select: { name: true } } },
    });
    return {
      role,
      membershipId: m.id,
      displayName: m.displayName,
      userName: m.user.name,
      moderates: can(role, 'content.moderate'),
    };
  }

  private async policyOf(groupId: string): Promise<PostPolicy> {
    const g = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { postPolicy: true },
    });
    return g.postPolicy;
  }

  /** Quem ainda não tem apelido ganha um ao publicar: o escolhido ou o primeiro nome. */
  private async ensureDisplayName(eu: Eu, escolhido?: string): Promise<string> {
    if (eu.displayName && !escolhido) return eu.displayName;
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
    if (!this.media) throw new NotFoundException('File not found');
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

  /** Visível para quem pergunta: no ar, ou removido mas dele. */
  private async findVisible(groupId: string, postId: string, eu: Eu) {
    const row = await this.prisma.groupPost.findFirst({
      where: {
        id: postId,
        groupId,
        OR: [{ removedAt: null }, { membershipId: eu.membershipId }],
      },
      include: INCLUIR,
    });
    if (!row) throw new NotFoundException('Post not found');
    return row;
  }

  /** No ar: reagir, comentar e denunciar só valem para post que todo mundo vê. */
  private async findLive(groupId: string, postId: string) {
    const row = await this.prisma.groupPost.findFirst({
      where: { id: postId, groupId, removedAt: null },
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

  private async topReason(r: { postId: string }): Promise<ReportReason | null> {
    const grupos = await this.prisma.groupPostReport.groupBy({
      by: ['reason'],
      where: { postId: r.postId, commentId: null, resolvedAt: null },
      _count: { reason: true },
      orderBy: { _count: { reason: 'desc' } },
      take: 1,
    });
    return grupos[0]?.reason ?? null;
  }

  /** Comentários que quem pergunta enxerga, contados numa consulta só. */
  private async withCommentCounts(
    rows: Prisma.GroupPostGetPayload<{ include: typeof INCLUIR }>[],
    eu: Eu,
  ): Promise<PostRow[]> {
    if (rows.length === 0) return [];
    const contagem = await this.prisma.groupPostComment.groupBy({
      by: ['postId'],
      where: {
        postId: { in: rows.map((r) => r.id) },
        OR: [{ removedAt: null }, { membershipId: eu.membershipId }],
      },
      _count: { _all: true },
    });
    const porPost = new Map(contagem.map((c) => [c.postId, c._count._all]));
    return rows.map((r) => ({ ...r, comments: porPost.get(r.id) ?? 0 }));
  }

  private nameOf(a: Autor): string {
    return a.displayName ?? firstName(a.user.name);
  }

  private author(a: Autor, eu: Eu): AuthorView {
    return {
      displayName: this.nameOf(a),
      team: TEAM_ROLES.includes(a.role),
      isMe: a.id === eu.membershipId,
    };
  }

  private async view(r: PostRow, eu: Eu): Promise<PostView> {
    const counts = zeradas();
    for (const re of r.reactions) counts[re.kind] += 1;
    const meu = r.membershipId === eu.membershipId;
    return {
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      author: this.author(r.author, eu),
      images: this.media ? await Promise.all(r.images.map((i) => this.media!.view(i.file))) : [],
      pinned: r.pinnedAt !== null && r.removedAt === null,
      removed: r.removedAt ? { reason: r.removedReason } : null,
      reactions: {
        counts,
        mine: r.reactions.find((re) => re.membershipId === eu.membershipId)?.kind ?? null,
      },
      commentCount: r.comments,
      canDelete: meu,
      canModerate: eu.moderates && r.removedAt === null,
    };
  }
}
