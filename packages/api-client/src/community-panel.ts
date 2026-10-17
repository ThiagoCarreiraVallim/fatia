import type { GroupRole, GroupType, MyGroup } from './community';
import type {
  BatchSkipReason,
  InsightsCell,
  InsightsPeriod,
  InviteView,
  InvoiceStatus,
  PanelMember,
  PoolStatus,
  SeatsOverview,
} from './community-admin';
import { formatBRL } from './plan';

/**
 * Regras e textos do painel da comunidade, iguais na web e no app (Fase 6).
 * Tudo aqui é apresentação: quem decide o que cada papel pode é a API.
 */

export const GROUP_TYPES: readonly GroupType[] = ['SPONSORED', 'SOCIAL'];

const GROUP_TYPE_LABEL: Record<GroupType, string> = {
  SPONSORED: 'Academia ou estúdio',
  SOCIAL: 'Criador de conteúdo ou grupo',
};

export function groupTypeLabel(type: GroupType): string {
  return GROUP_TYPE_LABEL[type];
}

export type PanelSection = 'overview' | 'members' | 'invites' | 'seats' | 'settings';

export interface PanelLink {
  section: PanelSection;
  label: string;
  /** Caminho a partir de `/org/<groupId>`. */
  path: string;
}

const SECTIONS: Record<PanelSection, PanelLink> = {
  overview: { section: 'overview', label: 'Visão geral', path: '' },
  members: { section: 'members', label: 'Membros', path: '/members' },
  invites: { section: 'invites', label: 'Convites', path: '/invites' },
  seats: { section: 'seats', label: 'Assentos', path: '/seats' },
  settings: { section: 'settings', label: 'Configurações', path: '/settings' },
};

/** Quem administra ou atende abre o painel. */
export function canOpenPanel(group: Pick<MyGroup, 'role' | 'status'>): boolean {
  return group.status === 'ACTIVE' && (group.role === 'OWNER' || group.role === 'PROFESSIONAL');
}

/** As seções do painel para o papel: o profissional cuida de membros e convites. */
export function panelSections(role: GroupRole): PanelLink[] {
  if (role === 'OWNER') return Object.values(SECTIONS);
  if (role === 'PROFESSIONAL') return [SECTIONS.overview, SECTIONS.members, SECTIONS.invites];
  return [];
}

export function panelHref(groupId: string, section: PanelSection = 'overview'): string {
  return `/org/${groupId}${SECTIONS[section].path}`;
}

/** A seção ativa a partir do caminho (`/org/<id>/members/<m>` → `members`). */
export function activePanelSection(pathname: string): PanelSection {
  const parte = pathname.split(/[?#]/)[0].split('/')[3];
  const achada = Object.values(SECTIONS).find((s) => s.path === `/${parte}`);
  return achada?.section ?? 'overview';
}

export const MAX_BATCH_INVITES = 50;
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export interface ParsedEmails {
  valid: string[];
  invalid: string[];
  duplicates: string[];
  /** Válidos além do limite de um lote, que ficam de fora. */
  overLimit: string[];
}

/**
 * Lê uma lista de e-mails colada ou vinda de um `.csv`: separa por linha,
 * vírgula, ponto e vírgula ou espaço, ignora o cabeçalho "email" e aspas,
 * normaliza para minúsculas e guarda a ordem de chegada.
 */
export function parseInviteEmails(text: string): ParsedEmails {
  const out: ParsedEmails = { valid: [], invalid: [], duplicates: [], overLimit: [] };
  const vistos = new Set<string>();
  for (const bruto of text.split(/[\n\r,;\t ]+/)) {
    const email = bruto
      .trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase();
    if (!email || email === 'email' || email === 'e-mail') continue;
    if (!EMAIL.test(email)) {
      out.invalid.push(email);
      continue;
    }
    if (vistos.has(email)) {
      out.duplicates.push(email);
      continue;
    }
    vistos.add(email);
    if (out.valid.length >= MAX_BATCH_INVITES) out.overLimit.push(email);
    else out.valid.push(email);
  }
  return out;
}

const SKIP_REASON: Record<BatchSkipReason, string> = {
  invalid: 'e-mail inválido',
  duplicate: 'repetido na lista',
  member: 'já faz parte',
  pending_invite: 'já tem convite aberto',
};

export function batchSkipLabel(reason: BatchSkipReason): string {
  return SKIP_REASON[reason];
}

/** "1 convite enviado · 2 pulados". */
export function batchResultMessage(created: number, skipped: number): string {
  const enviados = created === 1 ? '1 convite enviado' : `${created} convites enviados`;
  if (skipped === 0) return enviados;
  return `${enviados} · ${skipped === 1 ? '1 pulado' : `${skipped} pulados`}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "24 out", no fuso de Brasília (o de quem administra, quase sempre). */
function dataCurta(iso: string): string {
  const [, m, d] = new Date(new Date(iso).getTime() - 3 * 3_600_000)
    .toISOString()
    .slice(0, 10)
    .split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

/** "Link · 3 de 10 usos · vence 24 out" ou "ana@x.com · vence 24 out". */
export function inviteSummary(invite: InviteView): string {
  const quem = invite.email ?? 'Link';
  const usos =
    invite.email !== null
      ? null
      : invite.maxUses === null
        ? `${invite.uses} ${invite.uses === 1 ? 'uso' : 'usos'}`
        : `${invite.uses} de ${invite.maxUses} usos`;
  return [quem, usos, `vence ${dataCurta(invite.expiresAt)}`].filter(Boolean).join(' · ');
}

const POOL_STATUS: Record<PoolStatus, string> = {
  PENDING: 'Aguardando o primeiro pagamento',
  ACTIVE: 'Ativos',
  PAST_DUE: 'Pagamento em atraso',
  CANCELED: 'Cancelados',
  EXPIRED: 'Encerrados',
};

/** A linha de resumo dos assentos: "3 de 5 em uso · R$ 74,50/mês". */
export function seatSummary(overview: SeatsOverview): string {
  const pool = overview.pool;
  if (!pool || pool.status === 'CANCELED' || pool.status === 'EXPIRED') {
    return `Sem assentos · ${formatBRL(overview.unitPriceCents)} por pessoa/mês`;
  }
  const uso = `${overview.assigned} de ${pool.seats} em uso`;
  if (pool.manual) return `${uso} · cortesia`;
  return `${uso} · ${formatBRL(pool.monthlyCents)}/mês`;
}

export function poolStatusLabel(status: PoolStatus): string {
  return POOL_STATUS[status];
}

/** Cabe mais alguém num assento agora? */
export function hasFreeSeat(overview: SeatsOverview): boolean {
  const pool = overview.pool;
  return (
    !!pool &&
    (pool.status === 'ACTIVE' || pool.status === 'PAST_DUE') &&
    overview.assigned < pool.seats
  );
}

/** O que muda na cobrança ao trocar a quantidade, antes de confirmar. */
export function seatChangeHint(overview: SeatsOverview, seats: number): string | null {
  const pool = overview.pool;
  if (!pool || seats === pool.seats) return null;
  const novo = formatBRL(seats * overview.unitPriceCents);
  if (seats > pool.seats) {
    return `Vale na hora: a mensalidade passa a ${novo} e sai agora uma cobrança proporcional aos dias que faltam.`;
  }
  if (seats < overview.assigned) {
    return `Há ${overview.assigned} pessoas com assento. Retire ${overview.assigned - seats} antes de reduzir.`;
  }
  return `Vale na renovação: a mensalidade passa a ${novo} no próximo ciclo.`;
}

const INVOICE_STATUS: Record<InvoiceStatus, string> = {
  PENDING: 'Em aberto',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  VOID: 'Cancelada',
};

export function invoiceStatusLabel(status: InvoiceStatus): string {
  return INVOICE_STATUS[status];
}

/** Pedidos de entrada esperando o dono, os mais antigos primeiro. */
export function pendingRequests(members: readonly PanelMember[]): PanelMember[] {
  return members.filter((m) => m.status === 'INVITED' && m.role !== 'OWNER');
}

export type MemberFilter = 'all' | 'pending' | 'team';

export function filterMembers(
  members: readonly PanelMember[],
  filter: MemberFilter,
  query = '',
): PanelMember[] {
  const q = query.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return members.filter((m) => {
    if (filter === 'pending' && m.status !== 'INVITED') return false;
    if (filter === 'team' && (m.role === 'MEMBER' || m.status !== 'ACTIVE')) return false;
    if (!q) return true;
    return m.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q);
  });
}

export const INSIGHTS_PERIODS: { value: InsightsPeriod; label: string }[] = [
  { value: 'last_30_days', label: 'Últimos 30 dias' },
  { value: 'last_90_days', label: 'Últimos 90 dias' },
  { value: 'last_12_months', label: 'Últimos 12 meses' },
];

const CUT_LABEL: Record<string, string> = {
  sessions_by_week: 'Treinos por semana',
  active_days_by_month: 'Dias ativos por mês',
  sessions_by_hour_band: 'Treinos por horário',
  members_by_recency: 'Último treino',
  members_by_churn_risk: 'Risco de parar',
  plan_adherence_by_month: 'Treinos seguindo plano (%)',
  retention_by_cohort: 'Retenção por mês de entrada (%)',
  modality_mix: 'Treinos por grupo muscular',
};

export function cutLabel(cut: string): string {
  return CUT_LABEL[cut] ?? cut;
}

/** O rótulo do eixo: semana (`2026-10-12` → "12 out"), mês (`2026-10` → "out/26") ou a faixa como veio. */
export function cellKeyLabel(key: string): string {
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (dia) return `${Number(dia[3])} ${MESES[Number(dia[2]) - 1]}`;
  const mes = /^(\d{4})-(\d{2})$/.exec(key);
  if (mes) return `${MESES[Number(mes[2]) - 1]}/${mes[1].slice(2)}`;
  return key;
}

/** O valor da célula para leitura: suprimida nunca vira 0. */
export function cellValueLabel(cell: InsightsCell): string {
  if (cell.suppressed || cell.value === null) return 'menos de 5 pessoas';
  return Number.isInteger(cell.value)
    ? String(cell.value)
    : cell.value.toFixed(1).replace('.', ',');
}
