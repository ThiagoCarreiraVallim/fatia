import { apiFetch } from './http';
import { markdownLitePlainText } from './markdown-lite';
import type { MediaView } from './community-content';
import type { GroupRole } from './community';

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
/** Aviso fixado fica no topo no máximo isto. */
export const PIN_MAX_DAYS = 90;
/**
 * Votos mínimos para qualquer resultado de enquete (a API não manda antes). Para
 * quem votou, são os votos dos outros: total − 1 ≥ 5.
 */
export const POLL_MIN_VOTES = 5;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;
export const POLL_QUESTION_MAX = 200;
export const POLL_OPTION_MAX = 80;
export const POLL_MAX_DAYS = 30;
export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_SLOT_MINUTES = 15;

export const FEED_FILTERS = ['all', 'team', 'content', 'members'] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];
export const FEED_FILTER_LABEL: Record<FeedFilter, string> = {
  all: 'Tudo',
  team: 'Equipe',
  content: 'Conteúdo novo',
  members: 'Membros',
};

export type PostKind = 'POST' | 'POLL' | 'ANNOUNCEMENT' | 'AUTO';
export type AutoPostKind = 'PLAN' | 'TIP' | 'EXERCISE' | 'CHALLENGE';

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
  /** O papel de quem é da equipe; nulo para membro. */
  role?: GroupRole | null;
  /** Publicado em nome da comunidade. */
  asGroup?: boolean;
  isMe: boolean;
  /** Foto de perfil, quando a visibilidade dela deixa você ver; nulo = iniciais. */
  avatarUrl?: string | null;
}

export interface PollOption {
  id: string;
  label: string;
  /** % inteiro; nulo enquanto o resultado está escondido. */
  percent: number | null;
}

/**
 * A enquete como a API mostra: `totalVotes` e as % só chegam com
 * `POLL_MIN_VOTES` votos e depois de votar (ou encerrada). Voto é anônimo.
 */
export interface PollView {
  question: string;
  closesAt: string;
  closed: boolean;
  myOptionId: string | null;
  totalVotes: number | null;
  options: PollOption[];
  canClose: boolean;
}

export interface Post {
  id: string;
  kind?: PostKind;
  /** Título do comunicado ou do conteúdo novo. */
  title?: string | null;
  body: string;
  createdAt: string;
  author: PostAuthor;
  images: MediaView[];
  pinned: boolean;
  pinnedUntil?: string | null;
  poll?: PollView | null;
  auto?: { kind: AutoPostKind; refId: string } | null;
  /** Só chega ao autor. */
  removed: { reason: ReportReason | null } | null;
  reactions: { counts: Record<PostReactionKind, number>; mine: PostReactionKind | null };
  commentCount: number;
  canDelete: boolean;
  canModerate: boolean;
  canHide?: boolean;
  canBlock?: boolean;
}

export interface PostComment {
  id: string;
  body: string;
  createdAt: string;
  author: PostAuthor;
  removed: boolean;
  canDelete: boolean;
  canModerate: boolean;
  canBlock?: boolean;
}

export interface PostDetail extends Post {
  comments: PostComment[];
}

export interface FeedPage {
  policy: PostPolicy;
  canPost: boolean;
  canModerate: boolean;
  /** Equipe: publica em nome da comunidade e fixa como aviso. */
  isTeam?: boolean;
  groupName?: string;
  /** O carrossel de avisos, só na primeira página. */
  pins?: Post[];
  /** Posts dos outros desde a última visita. */
  unseen?: number;
  displayName: string | null;
  suggestedDisplayName: string;
  posts: Post[];
  nextCursor: string | null;
}

export interface CreatePostInput {
  kind?: 'POST' | 'POLL';
  body?: string;
  imageFileIds?: string[];
  displayName?: string;
  publishedAs?: 'PERSON' | 'GROUP';
  pin?: boolean;
  /** Dias no topo; nulo = sem prazo. */
  pinDays?: number | null;
  poll?: { question: string; options: string[]; days: number };
}

/** Uma linha do painel de enquetes (Pn-26). */
export interface PanelPoll {
  postId: string;
  question: string;
  author: string;
  createdAt: string;
  closesAt: string;
  closed: boolean;
  totalVotes: number | null;
  options: { label: string; percent: number | null }[];
  top: string | null;
}

export type AnnouncementRepeat = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface AnnouncementInput {
  title: string;
  body: string;
  publishedAs: 'PERSON' | 'GROUP';
  pin: boolean;
  pinDays: number | null;
  push: boolean;
  /** ISO do primeiro disparo (bloco de 15 min); nulo = agora. */
  at: string | null;
  repeat: AnnouncementRepeat;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  publishedAs: 'PERSON' | 'GROUP';
  pin: boolean;
  pinDays: number | null;
  push: boolean;
  repeat: AnnouncementRepeat;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  author: string;
}

/** Uma pessoa bloqueada (Você > Conta). */
export interface BlockedUser {
  id: string;
  label: string;
  groupName: string | null;
  createdAt: string;
}

export interface ForYouItem {
  kind: 'PLAN_OFFER' | 'NUTRITION_PLAN';
  id: string;
  title: string;
  note: string | null;
  from: string | null;
  at: string;
  href: string;
}

export interface ForYou {
  count: number;
  todo: ForYouItem[];
  recommended: { kind: 'PLAN' | 'TIP'; id: string; title: string; meta: string; href: string }[];
  fromTeam: { postId: string; title: string; from: string; at: string; unread: boolean }[];
  done: ForYouItem[];
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
  list: (groupId: string, cursor?: string | null, filter: FeedFilter = 'all') => {
    const q = new URLSearchParams();
    if (cursor) q.set('cursor', cursor);
    if (filter !== 'all') q.set('filter', filter);
    const qs = q.toString();
    return apiFetch<FeedPage>(qs ? `${posts(groupId)}?${qs}` : posts(groupId));
  },
  unseen: (groupId: string) => apiFetch<{ count: number }>(`${posts(groupId)}/unseen`),
  markSeen: (groupId: string) =>
    apiFetch<{ seenAt: string }>(`${posts(groupId)}/seen`, json('POST')),
  hide: (groupId: string, id: string) =>
    apiFetch<{ hidden: boolean }>(`${posts(groupId)}/${id}/hide`, json('POST')),
  /** Vota ou troca de opção. O voto não se apaga (a API não tem a rota). */
  vote: (groupId: string, id: string, optionId: string) =>
    apiFetch<Post>(`${posts(groupId)}/${id}/poll/vote`, json('PUT', { optionId })),
  closePoll: (groupId: string, id: string) =>
    apiFetch<Post>(`${posts(groupId)}/${id}/poll/close`, json('POST')),
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
  /** Fixa como aviso por `days` dias (nulo = sem prazo). */
  pin: (groupId: string, id: string, days: number | null = null) =>
    apiFetch<{ id: string; pinnedUntil: string | null }>(
      `${posts(groupId)}/${id}/pin`,
      json('POST', { days }),
    ),
  reorderPins: (groupId: string, postIds: string[]) =>
    apiFetch<{ order: string[] }>(`${posts(groupId)}/pins`, json('PUT', { postIds })),
  polls: (groupId: string) => apiFetch<PanelPoll[]>(`${moderation(groupId)}/polls`),
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

const announcements = (groupId: string) => `/api/groups/${groupId}/announcements`;

export const announcementsApi = {
  list: (groupId: string) => apiFetch<Announcement[]>(announcements(groupId)),
  create: (groupId: string, input: AnnouncementInput) =>
    apiFetch<Announcement>(announcements(groupId), json('POST', input)),
  cancel: (groupId: string, id: string) =>
    apiFetch<{ canceled: true }>(`${announcements(groupId)}/${id}`, json('DELETE')),
};

/** Bloqueio global (ADR 032): vale em todas as comunidades, nos dois sentidos. */
export const blocksApi = {
  list: () => apiFetch<BlockedUser[]>('/api/users/me/blocks'),
  block: (input: { groupId: string; postId: string; commentId?: string | null }) =>
    apiFetch<BlockedUser>('/api/users/me/blocks', json('POST', input)),
  unblock: (id: string) =>
    apiFetch<{ unblocked: true }>(`/api/users/me/blocks/${id}`, json('DELETE')),
};

export const forYouApi = {
  get: (groupId: string) => apiFetch<ForYou>(`/api/groups/${groupId}/for-you`),
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
  MISINFORMATION: 'Desinformação de saúde',
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

/** O que impede criar a enquete, ou `null`. Opções vazias são ignoradas. */
export function pollProblem(question: string, options: string[]): string | null {
  const q = question.trim();
  if (!q) return 'Escreva a pergunta.';
  if (q.length > POLL_QUESTION_MAX) return `A pergunta tem até ${POLL_QUESTION_MAX} caracteres.`;
  const opts = options.map((o) => o.trim()).filter(Boolean);
  if (opts.length < POLL_MIN_OPTIONS || opts.length > POLL_MAX_OPTIONS) {
    return `A enquete tem de ${POLL_MIN_OPTIONS} a ${POLL_MAX_OPTIONS} opções.`;
  }
  if (opts.some((o) => o.length > POLL_OPTION_MAX)) {
    return `Cada opção tem até ${POLL_OPTION_MAX} caracteres.`;
  }
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) {
    return 'Cada opção aparece uma vez.';
  }
  return null;
}

/** A linha embaixo da enquete (prancha Cm-21). */
export function pollResultNote(
  poll: Pick<PollView, 'closed' | 'myOptionId' | 'totalVotes'>,
): string {
  if (poll.totalVotes !== null) {
    const n = poll.totalVotes === 1 ? '1 voto' : `${poll.totalVotes} votos`;
    return poll.closed ? `${n} · encerrada` : n;
  }
  if (!poll.closed && !poll.myOptionId) return 'Vote para ver o resultado';
  // Quem votou conhece o próprio voto: contam os votos dos outros.
  return `Amostra pequena demais para mostrar · o resultado aparece com ${POLL_MIN_VOTES} votos${
    poll.myOptionId ? ' além do seu' : ''
  }`;
}

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Encerra em 3 dias", "Encerra hoje", "Encerrada". */
export function pollClosesLabel(
  poll: Pick<PollView, 'closed' | 'closesAt'>,
  now: Date = new Date(),
): string {
  const fim = new Date(poll.closesAt);
  if (poll.closed || fim <= now) return 'Encerrada';
  const dias = Math.round((inicioDoDia(fim) - inicioDoDia(now)) / 86_400_000);
  if (dias <= 0) return 'Encerra hoje';
  if (dias === 1) return 'Encerra amanhã';
  return `Encerra em ${dias} dias`;
}

/** O selo do aviso fixado. */
/** O nome do aviso nas listas (Moderação): o título, ou a primeira linha do texto sem marcação. */
export function pinHeadline(post: { title?: string | null; body: string }): string {
  if (post.title) return post.title;
  const primeira = post.body.split('\n').find((l) => l.trim()) ?? '';
  return markdownLitePlainText(primeira).trim() || 'Aviso';
}

export function pinDeadlineLabel(pinnedUntil: string | null | undefined): string {
  if (!pinnedUntil) return 'Fixado';
  const d = new Date(pinnedUntil);
  return `Fixado até ${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** "Fixar por": as opções da prancha Pn-14. */
export const PIN_DAY_OPTIONS: { days: number | null; label: string }[] = [
  { days: 3, label: '3 dias' },
  { days: 7, label: '7 dias' },
  { days: null, label: 'Sem prazo' },
];

/**
 * Os horários do comunicado no dia `day` (hora local), em blocos de 15 min e
 * só depois de `now`. A API recusa o que não cair num bloco.
 */
export function announcementSlots(
  day: Date,
  now: Date = new Date(),
): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = [];
  for (let m = 0; m < 24 * 60; m += ANNOUNCEMENT_SLOT_MINUTES) {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m);
    if (d <= now) continue;
    out.push({
      iso: d.toISOString(),
      label: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    });
  }
  return out;
}

const DIAS_DA_SEMANA = [
  'Todo domingo',
  'Toda segunda',
  'Toda terça',
  'Toda quarta',
  'Toda quinta',
  'Toda sexta',
  'Todo sábado',
];

/** "Repetir": o dia da semana e do mês vêm do primeiro horário. */
export function repeatOptions(first: Date): { value: AnnouncementRepeat; label: string }[] {
  return [
    { value: 'NONE', label: 'Não repetir' },
    { value: 'DAILY', label: 'Todo dia' },
    { value: 'WEEKLY', label: DIAS_DA_SEMANA[first.getDay()]! },
    { value: 'MONTHLY', label: `Todo dia ${first.getDate()}` },
  ];
}

/** Os posts automáticos que a equipe liga e desliga (prancha Pn-14). */
export const AUTO_POST_KINDS: AutoPostKind[] = ['PLAN', 'TIP', 'EXERCISE', 'CHALLENGE'];
export const AUTO_POST_LABEL: Record<AutoPostKind, { label: string; hint: string }> = {
  PLAN: { label: 'Plano novo publicado', hint: 'Com o botão Ver o plano' },
  TIP: { label: 'Dica nova', hint: 'Com o título e o botão Ver a dica' },
  EXERCISE: { label: 'Exercício novo no guia', hint: 'Com o botão Ver o exercício' },
  CHALLENGE: { label: 'Desafio começa', hint: 'Com o botão Ver o desafio' },
};

export type CommunityTab = 'feed' | 'for-you' | 'challenges' | 'content';

/**
 * As abas da comunidade para o membro, iguais na web e no app.
 *
 * O mural **é** a comunidade: tocar nela abre o mural em `/community/<id>`, e
 * o que era a aba Início virou a tela discreta de `/community/<id>/settings`
 * (engrenagem no topo do mural), sem aba. A Agenda da prancha Cm-03 entra com
 * a #397; até lá a aba não aparece. `/community/<id>/feed` só redireciona
 * para a raiz.
 */
export function communityTabs(
  groupId: string,
): { tab: CommunityTab; label: string; href: string }[] {
  const base = `/community/${groupId}`;
  return [
    { tab: 'feed', label: 'Mural', href: base },
    { tab: 'for-you', label: 'Para você', href: `${base}/for-you` },
    { tab: 'challenges', label: 'Desafios', href: `${base}/challenges` },
    { tab: 'content', label: 'Conteúdo', href: `${base}/content` },
  ];
}

/** A aba ativa a partir do caminho (`/community/<id>/challenges/<c>` → `challenges`). */
export function activeCommunityTab(pathname: string): CommunityTab {
  const segment = pathname.split(/[?#]/)[0]!.split('/')[3];
  return segment === 'challenges' || segment === 'content' || segment === 'for-you'
    ? segment
    : 'feed';
}
