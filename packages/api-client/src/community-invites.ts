import type {
  InviteKind,
  InviteOrigin,
  InviteStatus,
  PanelMember,
  ResendManyResult,
} from './community-admin';
import { shortPanelDate } from './community-panel';

/**
 * Textos e regras das telas Membros, Convites e Ativação pendente (#401),
 * iguais na web e no app. Só apresentação: quem pode o quê decide a API.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** O texto de quando o número é pequeno demais para aparecer (AGGREGATION_POLICY). */
export const SMALL_SAMPLE = 'amostra pequena demais para mostrar';

export const INVITE_ORIGINS: readonly InviteOrigin[] = [
  'QR',
  'INSTAGRAM',
  'SITE',
  'REFERRAL',
  'EMAIL_LIST',
  'OTHER',
];

const ORIGIN_LABEL: Record<InviteOrigin, string> = {
  QR: 'QR · recepção',
  INSTAGRAM: 'Instagram',
  SITE: 'Site',
  REFERRAL: 'Indicação',
  EMAIL_LIST: 'Lista de e-mails',
  OTHER: 'Outra',
};

export function inviteOriginLabel(origin: InviteOrigin | null): string {
  return origin ? ORIGIN_LABEL[origin] : 'Sem origem';
}

const VIA_LABEL = {
  INVITE: 'Convite',
  CODE: 'Código da recepção',
  PAGE: 'Página da comunidade',
} as const;

/** "Entrou por": o nome do link, senão a origem, senão o caminho. */
export function joinedViaLabel(member: Pick<PanelMember, 'joinedVia'>): string {
  const v = member.joinedVia;
  if (!v) return '—';
  if (v.label) return v.label;
  if (v.origin) return ORIGIN_LABEL[v.origin];
  return v.via ? VIA_LABEL[v.via] : '—';
}

const STATUS_LABEL: Record<InviteStatus, string> = {
  active: 'ativo',
  used: 'usado',
  expired: 'expirado',
  revoked: 'revogado',
  declined: 'recusado',
};

export function inviteStatusLabel(status: InviteStatus): string {
  return STATUS_LABEL[status];
}

/** "sem prazo", "até 30 nov" ou "expirou 10 nov". */
export function inviteValidityLabel(invite: {
  expiresAt: string | null;
  status: InviteStatus | 'pending' | 'declined';
}): string {
  if (!invite.expiresAt) return 'sem prazo';
  const data = shortPanelDate(invite.expiresAt);
  return invite.status === 'expired' ? `expirou ${data}` : `até ${data}`;
}

/** A nota sob a validade muda com o tipo: o e-mail sempre vence. */
export function inviteValidityNote(kind: InviteKind): string {
  if (kind === 'email') return 'Convite por e-mail vale uma vez, por até 30 dias.';
  return 'Link e QR podem ficar sem prazo: valem até você revogar ou o limite de usos acabar.';
}

/** "hoje", "1 dia", "12 dias": há quanto tempo o convite saiu. */
export function invitedAgoLabel(iso: string, now: Date = new Date()): string {
  const dias = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
  if (dias <= 0) return 'hoje';
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

/** A mensagem pronta para o WhatsApp (#338 etapa 1: sem integração, só o texto). */
export function whatsappInviteMessage(groupName: string, url: string): string {
  return `Oi! Entra na ${groupName} no Fatia para acompanhar seus treinos com a equipe: ${url}`;
}

export function whatsappHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Conversa com o número que a pessoa autorizou; sem país, assume o Brasil. */
export function whatsappChatHref(phone: string): string | null {
  const digitos = phone.replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const comPais = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${comPais}`;
}

export type MemberTab = 'all' | 'pending' | 'unassigned' | 'left';

export const MEMBER_TABS: { tab: MemberTab; label: string }[] = [
  { tab: 'all', label: 'Todos' },
  { tab: 'pending', label: 'Aguardando' },
  { tab: 'unassigned', label: 'Sem acompanhamento' },
  { tab: 'left', label: 'Saíram' },
];

const saiu = (m: PanelMember) =>
  m.status === 'LEFT' || m.status === 'REMOVED' || m.status === 'BANNED';

function inTab(m: PanelMember, tab: MemberTab): boolean {
  switch (tab) {
    case 'all':
      return !saiu(m);
    case 'pending':
      // Pedido de entrada esperando aprovação.
      return m.status === 'INVITED';
    case 'unassigned':
      return m.status === 'ACTIVE' && m.role === 'MEMBER' && !m.accompaniedBy;
    case 'left':
      return saiu(m);
  }
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function filterPanelMembers(
  members: PanelMember[],
  filter: {
    tab: MemberTab;
    q?: string;
    via?: string | null;
    /** Só quem esta pessoa da equipe acompanha ("Distribuir", Pn-19). */
    accompaniedBy?: string | null;
  },
): PanelMember[] {
  const q = filter.q ? semAcento(filter.q) : '';
  return members.filter(
    (m) =>
      inTab(m, filter.tab) &&
      (!q || semAcento(m.name).includes(q)) &&
      (!filter.via || joinedViaLabel(m) === filter.via) &&
      (!filter.accompaniedBy || m.accompaniedBy?.membershipId === filter.accompaniedBy),
  );
}

export function memberTabCounts(members: PanelMember[]): Record<MemberTab, number> {
  return {
    all: members.filter((m) => inTab(m, 'all')).length,
    pending: members.filter((m) => inTab(m, 'pending')).length,
    unassigned: members.filter((m) => inTab(m, 'unassigned')).length,
    left: members.filter((m) => inTab(m, 'left')).length,
  };
}

/** As opções do filtro "Entrou por", na ordem em que aparecem. */
export function memberViaOptions(members: PanelMember[]): string[] {
  const vistos = new Set<string>();
  for (const m of members) {
    const via = joinedViaLabel(m);
    if (via !== '—') vistos.add(via);
  }
  return [...vistos];
}

/** Quem pode acompanhar alguém: profissional e dono ativos. */
export function accompanyOptions(members: PanelMember[]): PanelMember[] {
  return members.filter(
    (m) => m.status === 'ACTIVE' && (m.role === 'PROFESSIONAL' || m.role === 'OWNER'),
  );
}

export interface Page<T> {
  items: T[];
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
}

/** Uma página da lista; página fora do intervalo cai na última. */
export function paginate<T>(items: T[], page: number, size: number): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const atual = Math.min(Math.max(1, page), pages);
  const inicio = (atual - 1) * size;
  const fatia = items.slice(inicio, inicio + size);
  return {
    items: fatia,
    page: atual,
    pages,
    from: total ? inicio + 1 : 0,
    to: inicio + fatia.length,
    total,
  };
}

/** "1–10 de 48". */
export function pageRangeLabel(p: Pick<Page<unknown>, 'from' | 'to' | 'total'>): string {
  if (!p.total) return '0 de 0';
  return `${p.from}–${p.to} de ${p.total}`;
}

/** "2 convites reenviados · 1 não saiu (cedo demais ou no limite de envios)". */
export function resendResultMessage(r: ResendManyResult): string {
  const n = r.sent.length;
  const enviados = n === 1 ? '1 convite reenviado' : `${n} convites reenviados`;
  const k = r.skipped.length;
  if (!k) return enviados;
  const pulados = k === 1 ? '1 não saiu' : `${k} não saíram`;
  return `${enviados} · ${pulados} (cedo demais ou no limite de envios)`;
}
