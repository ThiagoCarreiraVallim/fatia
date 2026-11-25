import { apiFetch } from './http';
import type {
  AvatarVisibility,
  BodyObjective,
  ActivityLevel,
  BiologicalSex,
  MeUser,
} from './users';

/**
 * A aba Você (#387): textos e regras iguais no app e na web, e as rotas de
 * novidades, tutoriais e ideias.
 */

export type NewsTone = 'lime' | 'amber' | 'blue' | 'neutral';

export interface NewsItem {
  id: string;
  /** AAAA-MM-DD. */
  date: string;
  title: string;
  body: string;
  /** Ícone do design system. */
  icon: string;
  tone: NewsTone;
  href: string | null;
  unread: boolean;
}

export interface NewsFeed {
  items: NewsItem[];
  unreadCount: number;
}

export const newsApi = {
  list: () => apiFetch<NewsFeed>('/api/news'),
  /** Sem `ids`: "Marcar tudo como lido". */
  markRead: (ids?: string[]) =>
    apiFetch<NewsFeed>('/api/news/read', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids } : {}),
    }),
};

export const tutorialsApi = {
  seen: () => apiFetch<{ seen: string[] }>('/api/tutorials/seen'),
  markSeen: (id: string) =>
    apiFetch<{ seen: string[] }>('/api/tutorials/seen', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
};

export const IDEA_MAX = 1000;

/** "Onde ajudaria" no "Sugerir uma ideia" da equipe (#413, Pn-27). */
export type IdeaArea = 'COMMUNITY' | 'MEMBERS' | 'PLANS' | 'REPORT';
export const IDEA_AREAS: readonly { value: IdeaArea; label: string }[] = [
  { value: 'COMMUNITY', label: 'Comunidade' },
  { value: 'MEMBERS', label: 'Membros' },
  { value: 'PLANS', label: 'Planos' },
  { value: 'REPORT', label: 'Relatório' },
];

/** Uma novidade do painel (#413): abre uma seção do painel, não uma rota do app. */
export interface PanelNewsItem {
  id: string;
  /** AAAA-MM-DD. */
  date: string;
  title: string;
  body: string;
  icon: string;
  /** A seção do painel (`PanelSection`) que a novidade abre. */
  section: string | null;
  unread: boolean;
}

export interface PanelNewsFeed {
  items: PanelNewsItem[];
  unreadCount: number;
}

/** As novidades do painel da equipe (#413, Pn-27): só quem é da equipe de alguma comunidade. */
export const panelNewsApi = {
  list: () => apiFetch<PanelNewsFeed>('/api/panel/news'),
  /** Sem `ids`: "Marcar tudo como lido". */
  markRead: (ids?: string[]) =>
    apiFetch<PanelNewsFeed>('/api/panel/news/read', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids } : {}),
    }),
};

/** O selo do topo de Novidades: "3 não lidas" ou "tudo lido" (Pn-27b). */
export function panelUnreadLabel(n: number): string {
  if (n <= 0) return 'tudo lido';
  return n === 1 ? '1 não lida' : `${n} não lidas`;
}

export const ideasApi = {
  /** A do aluno vem sem área; a da equipe diz onde ajudaria. */
  send: (body: string, area?: IdeaArea) =>
    apiFetch<{ sent: true }>('/api/feedback/ideas', {
      method: 'POST',
      body: JSON.stringify(area ? { body, area } : { body }),
    }),
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `10 nov` — a data da novidade, sem ano (a lista é curta e recente). */
export function newsDate(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return m && d ? `${d} ${MESES[m - 1]}` : day;
}

/** "3 novidades", "1 novidade", "Tudo lido"; sem conexão, "salvo em 9 nov". */
export function newsCountLabel(unread: number, savedAt?: string | null): string {
  if (savedAt) return `salvo em ${newsDate(savedAt.slice(0, 10))}`;
  if (unread === 0) return 'Tudo lido';
  return unread === 1 ? '1 novidade' : `${unread} novidades`;
}

/** Iniciais do avatar: "Ana Demo" → "AD". */
export function initialsOf(name: string | null | undefined): string {
  const partes = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return partes
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

type CommunityNameOf = Pick<MeUser, 'name' | 'nickname'> &
  Partial<Pick<MeUser, 'nameIsProvisional'>>;

/**
 * O nome que os outros membros leem: o apelido, senão o primeiro nome. Enquanto
 * o nome é o que o provisionamento inventou (o `sub`, o pedaço do e-mail), é
 * "Membro" — igual à API (ADR 050).
 */
export function communityName(me: CommunityNameOf): string {
  const apelido = me.nickname?.trim();
  if (apelido) return apelido;
  if (me.nameIsProvisional) return 'Membro';
  return me.name.trim().split(/\s+/)[0] || me.name;
}

/** O nome do perfil (o mesmo limite da API). */
export const PROFILE_NAME_MAX = 120;

/**
 * Pedir o nome antes do primeiro post ou da entrada num desafio: só enquanto o
 * nome for provisório e não houver apelido. Salvo no perfil, não pergunta mais.
 */
export function needsCommunityName(me: CommunityNameOf | null | undefined): boolean {
  return !!me && me.nameIsProvisional === true && !me.nickname?.trim();
}

/** O que impede o nome digitado; `null` quando serve. */
export function communityNameProblem(name: string, me: Pick<MeUser, 'email'>): string | null {
  const nome = name.trim();
  if (!nome || nome === me.email.split('@')[0]) return 'Escreva seu nome como quer aparecer.';
  if (nome.length > PROFILE_NAME_MAX) return `Use até ${PROFILE_NAME_MAX} caracteres.`;
  return null;
}

/** `ana@email.com · nas comunidades: Ana` (cabeçalho de Você). */
export function youHeaderLine(me: Pick<MeUser, 'email' | 'name' | 'nickname'>): string {
  return `${me.email} · nas comunidades: ${communityName(me)}`;
}

export const AVATAR_VISIBILITY_OPTIONS: { value: AvatarVisibility; label: string }[] = [
  { value: 'COMMUNITIES', label: 'Minhas comunidades' },
  { value: 'TEAM_ONLY', label: 'Só a equipe' },
];

export function avatarVisibilityText(v: AvatarVisibility): string {
  return v === 'COMMUNITIES'
    ? 'Membros e equipe das comunidades em que você está veem a foto. Fora delas, ninguém.'
    : 'Os outros membros veem suas iniciais; só a equipe vê a foto.';
}

/** Por que a foto não pode ser trocada agora; `null` quando pode. */
export function avatarUploadNotice(me: Pick<MeUser, 'mediaUploadEnabled'>): string | null {
  return me.mediaUploadEnabled === false
    ? 'O envio de fotos não está disponível neste servidor agora. Por enquanto, você aparece com as iniciais.'
    : null;
}

export function whatsappOptInText(on: boolean): string {
  return on
    ? 'A equipe das suas comunidades vê o número e toca para abrir o WhatsApp.'
    : 'Ninguém vê seu número. A equipe fala com você pelo app só por planos e avisos.';
}

/** `5565998123456` → `(65) 99812-3456`; número de fora do Brasil fica com o `+`. */
export function formatWhatsapp(digits: string | null | undefined): string {
  if (!digits) return '';
  const d = digits.replace(/\D/g, '');
  const br = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : null;
  if (!br) return `+${d}`;
  const ddd = br.slice(0, 2);
  const resto = br.slice(2);
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** "Guardar fotos das refeições" (ADR 038): a linha de baixo e o aviso ao trocar. */
export function keepPhotosText(keep: boolean): { subtitle: string; toast: string } {
  return keep
    ? { subtitle: 'Ficam junto da refeição no diário', toast: 'Novas fotos serão guardadas' }
    : { subtitle: 'A foto é usada e descartada', toast: 'Novas fotos não serão guardadas' };
}

const OBJETIVO: Record<BodyObjective, string> = {
  LOSE: 'Perder',
  MAINTAIN: 'Manter',
  GAIN: 'Ganhar',
};
const ATIVIDADE: Record<ActivityLevel, string> = {
  SEDENTARY: 'parado',
  LIGHT: 'leve',
  MODERATE: 'moderado',
  ACTIVE: 'ativo',
  VERY_ACTIVE: 'muito ativo',
};
const SEXO: Record<BiologicalSex, string> = { FEMALE: 'feminino', MALE: 'masculino' };

function idade(birthDate: string, now: Date): number {
  const [a, m, d] = birthDate.slice(0, 10).split('-').map(Number);
  let anos = now.getUTCFullYear() - a!;
  const antes =
    now.getUTCMonth() + 1 < m! || (now.getUTCMonth() + 1 === m! && now.getUTCDate() < d!);
  if (antes) anos -= 1;
  return anos;
}

/** "Perder · leve · feminino, 32 anos" — a linha "Objetivo e rotina" de Você. */
export function objectiveSummary(
  me: Pick<MeUser, 'objective' | 'activityLevel' | 'sex' | 'birthDate'>,
  now = new Date(),
): string | null {
  const partes: string[] = [];
  if (me.objective) partes.push(OBJETIVO[me.objective]);
  if (me.activityLevel) partes.push(ATIVIDADE[me.activityLevel]);
  const quem = [
    me.sex ? SEXO[me.sex] : null,
    me.birthDate ? `${idade(me.birthDate, now)} anos` : null,
  ]
    .filter(Boolean)
    .join(', ');
  if (quem) partes.push(quem);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** Estatura do sheet de Você: entre 100 e 250 cm, de 1 em 1. */
export const HEIGHT_MIN_CM = 100;
export const HEIGHT_MAX_CM = 250;
export function stepHeight(cm: number, delta: number): number {
  return Math.min(HEIGHT_MAX_CM, Math.max(HEIGHT_MIN_CM, Math.round(cm) + delta));
}

/**
 * O perfil em cache com o e-mail e o nome que a API acabou de gravar pelo ID
 * token (ADR 050). Escrito direto no cache: a tela não espera um refetch para
 * trocar o `<sub>@logto.local` pelo e-mail real.
 */
export function withIdentity<T extends { email: string; name: string }>(
  me: T | undefined,
  identity: { email: string; name: string },
): T | undefined {
  return me ? { ...me, email: identity.email, name: identity.name } : undefined;
}
