import type { GroupRole, MembershipStatus } from './community';
import { panelHref, panelSections, activePanelSection, type PanelSection } from './community-panel';
import type { AnnouncementSettings } from './community-feed';
import { apiFetch } from './http';

/**
 * O painel base do redesign (#398): menu lateral em grupos, migalha do topo,
 * Visão geral, busca ⌘K e o comunicado no painel lateral. Vale para todas as
 * telas `Pn-*`; as próximas issues acrescentam os itens delas em `NAV`.
 * Tudo aqui é apresentação: quem decide o que cada papel vê é a API.
 */

export interface PanelCounts {
  pendingRequests: number | null;
  pendingInvites: number | null;
  openReports: number | null;
  challengeReview: number | null;
}

export type OverviewDays = 7 | 30 | 90;

export interface OverviewCell {
  key: string;
  value: number | null;
  suppressed: boolean;
}

export interface OverviewItem {
  id: string;
  title: string;
  type: 'request' | 'report' | 'review' | 'challenge' | 'plan';
  status: string;
  person: string | null;
  at: string | null;
  owner: string | null;
  section: PanelSection;
  refId: string | null;
}

export interface NewThisWeek {
  total: number;
  viaInvite: number;
  viaPage: number;
  /** Quem entrou sem origem gravada (antes da #398). */
  viaUnknown: number;
}

export interface PanelOverview {
  days: OverviewDays;
  counts: PanelCounts;
  members: { active: number; joinedLast30Days: number };
  newThisWeek: NewThisWeek;
  /** Só para quem tem `insights.read` (o dono); nulo para os outros papéis. */
  aggregates: {
    active7d: { value: number | null; percent: number | null };
    /** Nulo = esconder o cartão (menos de 5 pessoas). */
    notLoggedYet: number | null;
    activity: { workouts: OverviewCell[]; people: OverviewCell[] };
  } | null;
  items: { needsYou: OverviewItem[]; challenges: OverviewItem[]; sent: OverviewItem[] };
}

export interface PanelSearchResult {
  members: { membershipId: string; name: string; role: GroupRole; status: MembershipStatus }[];
  screens: { key: string; label: string; group: string }[];
  plans: { id: string; title: string; kind: 'WORKOUT' | 'NUTRITION'; published: boolean }[];
}

const base = '/api/groups';

export const panelApi = {
  counts: (groupId: string) => apiFetch<PanelCounts>(`${base}/${groupId}/panel/counts`),
  overview: (groupId: string, days: OverviewDays) =>
    apiFetch<PanelOverview>(`${base}/${groupId}/overview?days=${days}`),
  search: (groupId: string, q: string) =>
    apiFetch<PanelSearchResult>(
      `${base}/${groupId}/search?${new URLSearchParams({ q }).toString()}`,
    ),
};

// ---------------------------------------------------------------- menu

export type PanelNavGroupKey = 'track' | 'people' | 'content' | 'community' | 'ai';

export interface PanelNavItem {
  section: PanelSection;
  label: string;
  /** Contador do item; nulo = sem número. */
  count: number | null;
}

export interface PanelNavGroup {
  key: PanelNavGroupKey;
  label: string;
  items: PanelNavItem[];
  /** Soma dos contadores do grupo, para o grupo recolhido; nulo quando não há. */
  count: number | null;
}

/**
 * O menu na ordem do canvas (Pn-01). Só entram as telas que já existem: as
 * da prancha que ainda não têm tela (Para revisar, Relatório, Ativação
 * pendente, Agenda...) entram com as issues delas.
 */
const NAV: { key: PanelNavGroupKey; label: string; items: [PanelSection, string][] }[] = [
  {
    key: 'track',
    label: 'Acompanhar',
    items: [
      ['overview', 'Visão geral'],
      ['review', 'Para revisar'],
    ],
  },
  {
    key: 'people',
    label: 'Pessoas',
    items: [
      ['members', 'Membros'],
      ['invites', 'Convites'],
      ['seats', 'Assentos e faturas'],
    ],
  },
  {
    key: 'content',
    label: 'Conteúdo',
    items: [
      ['content', 'Planos e dicas'],
      ['exercises', 'Exercícios'],
    ],
  },
  {
    key: 'community',
    label: 'Comunidade',
    items: [
      ['moderation', 'Mural e avisos'],
      ['announcements', 'Comunicados e enquetes'],
      ['challenges', 'Desafios'],
      ['benefits', 'Benefícios'],
    ],
  },
  { key: 'ai', label: 'IA', items: [['agent', 'Agente da comunidade']] },
];

/** Fora dos grupos: no rodapé do menu. */
export const PANEL_FOOTER_SECTIONS: PanelSection[] = ['settings'];

function countOf(section: PanelSection, counts: PanelCounts | undefined): number | null {
  if (!counts) return null;
  const n =
    section === 'members'
      ? counts.pendingRequests
      : section === 'invites'
        ? counts.pendingInvites
        : section === 'moderation'
          ? counts.openReports
          : section === 'challenges'
            ? counts.challengeReview
            : null;
  return n ? n : null;
}

/** Os grupos do menu para o papel, com os contadores. Grupo sem item some. */
export function panelNav(role: GroupRole, counts?: PanelCounts): PanelNavGroup[] {
  const pode = new Set(panelSections(role).map((s) => s.section));
  return NAV.map((g) => {
    const items = g.items
      .filter(([section]) => pode.has(section))
      .map(([section, label]) => ({ section, label, count: countOf(section, counts) }));
    const soma = items.reduce((s, i) => s + (i.count ?? 0), 0);
    return { key: g.key, label: g.label, items, count: soma > 0 ? soma : null };
  }).filter((g) => g.items.length > 0);
}

const FOOTER_LABEL: Partial<Record<PanelSection, string>> = { settings: 'Configurações' };

/** "Acompanhar › Visão geral" no topo da página. */
export function panelBreadcrumb(pathname: string): { group: string | null; label: string } {
  const section = activePanelSection(pathname);
  for (const g of NAV) {
    const item = g.items.find(([s]) => s === section);
    if (item) return { group: g.label, label: item[1] };
  }
  return { group: null, label: FOOTER_LABEL[section] ?? 'Visão geral' };
}

// ---------------------------------------------------------------- Visão geral

export function newThisWeekLabel(n: NewThisWeek): string {
  if (n.total === 0) return 'Ninguém entrou ainda';
  const quantos = n.total === 1 ? '1 entrou' : `${n.total} entraram`;
  const partes = [
    n.viaInvite ? `${n.viaInvite} por convite` : null,
    n.viaPage ? `${n.viaPage} pela página` : null,
    n.viaUnknown ? `${n.viaUnknown} sem origem` : null,
  ].filter(Boolean);
  return partes.length ? `${quantos} · ${partes.join(', ')}` : quantos;
}

export function activationLabel(n: number): string {
  return n === 1 ? '1 convite sem aceite' : `${n} convites sem aceite`;
}

export function notLoggedYetLabel(n: number): string {
  return `${n} ${n === 1 ? 'pessoa' : 'pessoas'} · só o número, sem nomes`;
}

export const PANEL_ACTIVITY_RANGES: { value: OverviewDays; label: string }[] = [
  { value: 90, label: 'Últimos 3 meses' },
  { value: 30, label: 'Últimos 30 dias' },
  { value: 7, label: 'Últimos 7 dias' },
];

/** As colunas da tabela da Visão geral; Item é fixa. */
export const OVERVIEW_COLUMNS = [
  { key: 'type', label: 'Tipo' },
  { key: 'status', label: 'Status' },
  { key: 'person', label: 'Pessoa' },
  { key: 'at', label: 'Quando' },
  { key: 'owner', label: 'Responsável' },
] as const;
export type OverviewColumn = (typeof OVERVIEW_COLUMNS)[number]['key'];

const ITEM_TYPE: Record<OverviewItem['type'], string> = {
  request: 'Pedido',
  report: 'Moderação',
  review: 'Desafio',
  challenge: 'Desafio',
  plan: 'Plano',
};

export function overviewItemType(t: OverviewItem['type']): string {
  return ITEM_TYPE[t];
}

// ---------------------------------------------------------------- busca

export interface SearchEntry {
  id: string;
  kind: 'member' | 'screen' | 'plan';
  title: string;
  subtitle: string;
  href: string;
}

const ROLE_SUB: Record<GroupRole, string> = {
  OWNER: 'dono',
  PROFESSIONAL: 'profissional',
  CREATOR: 'criador',
  MEMBER: 'membro',
};

const SECTIONS = new Set<string>(
  (['OWNER'] as const).flatMap((r) => panelSections(r).map((s) => s.section)),
);

/** O resultado da busca em grupos (Membros, Telas, Planos), já com o caminho. */
export function searchEntries(
  groupId: string,
  r: PanelSearchResult,
): { group: string; items: SearchEntry[] }[] {
  const membros: SearchEntry[] = r.members.map((m) => ({
    id: `member:${m.membershipId}`,
    kind: 'member',
    title: m.name,
    subtitle: m.status === 'INVITED' ? 'pedido para entrar' : ROLE_SUB[m.role],
    href:
      m.status === 'INVITED'
        ? `${panelHref(groupId, 'members')}?filtro=pending`
        : `${panelHref(groupId, 'members')}/${m.membershipId}`,
  }));
  const telas: SearchEntry[] = r.screens
    .filter((s) => SECTIONS.has(s.key))
    .map((s) => ({
      id: `screen:${s.key}`,
      kind: 'screen',
      title: s.label,
      subtitle: s.group,
      href: panelHref(groupId, s.key as PanelSection),
    }));
  const planos: SearchEntry[] = r.plans.map((p) => ({
    id: `plan:${p.id}`,
    kind: 'plan',
    title: p.title,
    subtitle: [
      p.kind === 'WORKOUT' ? 'plano de treino' : 'plano alimentar',
      p.published ? null : 'rascunho',
    ]
      .filter(Boolean)
      .join(' · '),
    href: `${panelHref(groupId, 'content')}/plans/${p.id}`,
  }));
  return [
    { group: 'Membros', items: membros },
    { group: 'Telas', items: telas },
    { group: 'Planos', items: planos },
  ].filter((g) => g.items.length > 0);
}

export const RECENT_MAX = 5;

/** Põe o item na frente dos recentes, sem repetir, até `max`. */
export function pushRecent<T extends { id: string }>(
  list: readonly T[],
  item: T,
  max = RECENT_MAX,
): T[] {
  return [item, ...list.filter((x) => x.id !== item.id)].slice(0, max);
}

// ---------------------------------------------------------------- comunicado

const LOCK_BODY_MAX = 90;

/** A notificação como aparece na tela bloqueada, sem markdown. */
export function lockScreenPreview(p: { groupName: string; title: string; body: string }): {
  app: string;
  title: string;
  body: string;
} {
  const texto = p.body
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    app: `FATIA · ${p.groupName.toUpperCase()}`,
    title: p.title,
    body: texto.length > LOCK_BODY_MAX ? `${texto.slice(0, LOCK_BODY_MAX - 1).trimEnd()}…` : texto,
  };
}

export function pushQuotaHint(s: AnnouncementSettings): string {
  if (s.pushUsedThisWeek >= s.pushWeeklyLimit) {
    return `Limite de ${s.pushWeeklyLimit} avisos por semana atingido: este sai só no mural`;
  }
  return `${s.pushUsedThisWeek} de ${s.pushWeeklyLimit} avisos da semana usados`;
}

/**
 * "12 notificações · 10 entregues no celular · 8 e-mails". Mandadas somam
 * celular e navegador; entregues só o celular (o navegador não tem recibo).
 */
export function announcementDeliveryLine(a: {
  push: boolean;
  alsoEmail: boolean;
  pushSent: number;
  pushDelivered: number;
  emailSent: number;
}): string {
  if (!a.push && !a.alsoEmail) return 'só no mural';
  const partes: string[] = [];
  if (a.push) {
    partes.push(a.pushSent === 1 ? '1 notificação' : `${a.pushSent} notificações`);
    partes.push(
      `${a.pushDelivered} ${a.pushDelivered === 1 ? 'entregue' : 'entregues'} no celular`,
    );
  }
  if (a.alsoEmail) partes.push(a.emailSent === 1 ? '1 e-mail' : `${a.emailSent} e-mails`);
  return partes.join(' · ');
}
