import { apiFetch } from './http';
import type { MediaView } from './community-content';

/**
 * O mural da comunidade (Fase 8b, ADR 032): posts com texto e até 4 imagens,
 * reações, comentários e denúncias; a equipe modera. Aqui ficam os tipos, os
 * limites e os textos, iguais na web e no app.
 */

/** Limites iguais aos da API (`post.service.ts`). */
export const POST_BODY_MAX = 2000;
export const POST_MAX_IMAGES = 4;
export const COMMENT_BODY_MAX = 500;
export const REPORT_NOTE_MAX = 500;
export const MAX_PINNED = 3;

export type PostPolicy = 'ALL_MEMBERS' | 'TEAM_ONLY';
export const POST_REACTIONS = ['STRONG', 'FIRE', 'CLAP', 'HEART'] as const;
export type PostReactionKind = (typeof POST_REACTIONS)[number];
export const REPORT_REASONS = [
  'SPAM',
  'OFFENSIVE',
  'HARASSMENT',
  'MISINFORMATION',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface PostAuthor {
  displayName: string;
  /** Dono, profissional ou criador. */
  team: boolean;
  isMe: boolean;
}

export interface Post {
  id: string;
  body: string;
  createdAt: string;
  author: PostAuthor;
  images: MediaView[];
  pinned: boolean;
  /** Só chega ao autor. */
  removed: { reason: ReportReason | null } | null;
  reactions: { counts: Record<PostReactionKind, number>; mine: PostReactionKind | null };
  commentCount: number;
  canDelete: boolean;
  canModerate: boolean;
}

export interface PostComment {
  id: string;
  body: string;
  createdAt: string;
  author: PostAuthor;
  removed: boolean;
  canDelete: boolean;
  canModerate: boolean;
}

export interface PostDetail extends Post {
  comments: PostComment[];
}

export interface FeedPage {
  policy: PostPolicy;
  canPost: boolean;
  canModerate: boolean;
  displayName: string | null;
  suggestedDisplayName: string;
  posts: Post[];
  nextCursor: string | null;
}

export interface CreatePostInput {
  body?: string;
  imageFileIds?: string[];
  displayName?: string;
}

export interface ReportQueueItem {
  reportId: string;
  postId: string;
  commentId: string | null;
  excerpt: string;
  images: number;
  author: { displayName: string; membershipId: string; team: boolean };
  reasons: Partial<Record<ReportReason, number>>;
  notes: string[];
  count: number;
  firstReportedAt: string;
}

export interface RemovedPost {
  id: string;
  excerpt: string;
  images: number;
  author: { displayName: string; membershipId: string };
  reason: ReportReason | null;
  removedAt: string;
}

export interface BannedMember {
  membershipId: string;
  name: string;
  displayName: string | null;
  bannedAt: string | null;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const posts = (groupId: string) => `/api/groups/${groupId}/posts`;
const moderation = (groupId: string) => `/api/groups/${groupId}/moderation`;

export const feedApi = {
  list: (groupId: string, cursor?: string | null) =>
    apiFetch<FeedPage>(
      cursor ? `${posts(groupId)}?cursor=${encodeURIComponent(cursor)}` : posts(groupId),
    ),
  get: (groupId: string, id: string) => apiFetch<PostDetail>(`${posts(groupId)}/${id}`),
  create: (groupId: string, input: CreatePostInput) =>
    apiFetch<Post>(posts(groupId), json('POST', input)),
  remove: (groupId: string, id: string) =>
    apiFetch<{ deleted: boolean }>(`${posts(groupId)}/${id}`, json('DELETE')),
  react: (groupId: string, id: string, kind: PostReactionKind | null) =>
    kind
      ? apiFetch<Post>(`${posts(groupId)}/${id}/reaction`, json('PUT', { kind }))
      : apiFetch<Post>(`${posts(groupId)}/${id}/reaction`, json('DELETE')),
  comment: (groupId: string, id: string, body: string, displayName?: string) =>
    apiFetch<PostComment>(
      `${posts(groupId)}/${id}/comments`,
      json('POST', displayName ? { body, displayName } : { body }),
    ),
  deleteComment: (groupId: string, id: string, commentId: string) =>
    apiFetch<{ deleted: boolean }>(`${posts(groupId)}/${id}/comments/${commentId}`, json('DELETE')),
  report: (
    groupId: string,
    id: string,
    input: { reason: ReportReason; note?: string | null; commentId?: string | null },
  ) => apiFetch<{ reported: boolean }>(`${posts(groupId)}/${id}/report`, json('POST', input)),
};

export const moderationApi = {
  removePost: (groupId: string, id: string, reason?: ReportReason | null) =>
    apiFetch<{ id: string }>(
      `${posts(groupId)}/${id}/remove`,
      json('POST', { reason: reason ?? null }),
    ),
  restorePost: (groupId: string, id: string) =>
    apiFetch<{ id: string }>(`${posts(groupId)}/${id}/restore`, json('POST')),
  pin: (groupId: string, id: string) =>
    apiFetch<{ id: string }>(`${posts(groupId)}/${id}/pin`, json('POST')),
  unpin: (groupId: string, id: string) =>
    apiFetch<{ id: string }>(`${posts(groupId)}/${id}/pin`, json('DELETE')),
  removeComment: (groupId: string, id: string, commentId: string) =>
    apiFetch<{ id: string }>(`${posts(groupId)}/${id}/comments/${commentId}/remove`, json('POST')),
  reports: (groupId: string) => apiFetch<ReportQueueItem[]>(`${moderation(groupId)}/reports`),
  resolve: (groupId: string, reportId: string, action: 'remove' | 'dismiss') =>
    apiFetch<{ resolved: number }>(
      `${moderation(groupId)}/reports/${reportId}/resolve`,
      json('POST', { action }),
    ),
  removed: (groupId: string) => apiFetch<RemovedPost[]>(`${moderation(groupId)}/removed`),
  bans: (groupId: string) => apiFetch<BannedMember[]>(`${moderation(groupId)}/bans`),
  ban: (groupId: string, membershipId: string) =>
    apiFetch<{ membershipId: string }>(`${moderation(groupId)}/bans/${membershipId}`, json('POST')),
  unban: (groupId: string, membershipId: string) =>
    apiFetch<{ membershipId: string }>(
      `${moderation(groupId)}/bans/${membershipId}`,
      json('DELETE'),
    ),
};

export const REACTION_INFO: Record<PostReactionKind, { emoji: string; label: string }> = {
  STRONG: { emoji: '💪', label: 'Força' },
  FIRE: { emoji: '🔥', label: 'Fogo' },
  CLAP: { emoji: '👏', label: 'Palmas' },
  HEART: { emoji: '❤️', label: 'Coração' },
};

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  SPAM: 'Spam ou propaganda',
  OFFENSIVE: 'Ofensivo',
  HARASSMENT: 'Assédio ou ataque a alguém',
  MISINFORMATION: 'Informação de saúde perigosa',
  OTHER: 'Outro motivo',
};

export const POST_POLICY_LABEL: Record<PostPolicy, string> = {
  ALL_MEMBERS: 'Todos os membros publicam',
  TEAM_ONLY: 'Só a equipe publica',
};

/** O aviso que o autor vê no post removido. */
export function removedNotice(reason: ReportReason | null): string {
  return reason
    ? `Removido pela equipe: ${REPORT_REASON_LABEL[reason].toLowerCase()}. Só você vê este post.`
    : 'Removido pela equipe. Só você vê este post.';
}

/** "3 comentários", "Comentar". */
export function commentsLabel(n: number): string {
  if (n === 0) return 'Comentar';
  return n === 1 ? '1 comentário' : `${n} comentários`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "agora", "há 5 min", "há 3 h", "ontem", "12 out". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const quando = new Date(iso);
  // Relógio do aparelho adiantado dá segundos negativos, e cai em "agora".
  const seg = Math.round((now.getTime() - quando.getTime()) / 1000);
  if (seg < 60) return 'agora';
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  if (h < 48) return 'ontem';
  const data = `${quando.getDate()} ${MESES[quando.getMonth()]}`;
  return quando.getFullYear() === now.getFullYear() ? data : `${data} ${quando.getFullYear()}`;
}

/** O que impede publicar, ou `null`. Mesmas regras da API. */
export function postProblem(body: string, images: number): string | null {
  const texto = body.trim();
  if (!texto && images === 0) return 'Escreva algo ou escolha uma imagem.';
  if (texto.length > POST_BODY_MAX) return `O post tem até ${POST_BODY_MAX} caracteres.`;
  if (images > POST_MAX_IMAGES) return `Até ${POST_MAX_IMAGES} imagens por post.`;
  return null;
}

/** O que impede comentar, ou `null`. */
export function commentProblem(body: string): string | null {
  const texto = body.trim();
  if (!texto) return 'Escreva o comentário.';
  if (texto.length > COMMENT_BODY_MAX)
    return `O comentário tem até ${COMMENT_BODY_MAX} caracteres.`;
  return null;
}

/** "2 denúncias: spam ou propaganda (2)". */
export function reportSummary(item: Pick<ReportQueueItem, 'count' | 'reasons'>): string {
  const motivos = (Object.entries(item.reasons) as [ReportReason, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${REPORT_REASON_LABEL[r].toLowerCase()} (${n})`)
    .join(', ');
  return `${item.count === 1 ? '1 denúncia' : `${item.count} denúncias`}: ${motivos}`;
}

export type CommunityTab = 'feed' | 'challenges' | 'content';

/**
 * As abas da comunidade para o membro, iguais na web e no app.
 *
 * O mural **é** a comunidade: tocar nela abre o mural em `/community/<id>`, e
 * o que era a aba Início virou a tela discreta de `/community/<id>/settings`
 * (engrenagem no topo do mural), sem aba. `/community/<id>/feed` só redireciona
 * para a raiz.
 */
export function communityTabs(
  groupId: string,
): { tab: CommunityTab; label: string; href: string }[] {
  const base = `/community/${groupId}`;
  return [
    { tab: 'feed', label: 'Mural', href: base },
    { tab: 'challenges', label: 'Desafios', href: `${base}/challenges` },
    { tab: 'content', label: 'Planos e dicas', href: `${base}/content` },
  ];
}

/** A aba ativa a partir do caminho (`/community/<id>/challenges/<c>` → `challenges`). */
export function activeCommunityTab(pathname: string): CommunityTab {
  const segment = pathname.split(/[?#]/)[0]!.split('/')[3];
  return segment === 'challenges' || segment === 'content' ? segment : 'feed';
}
