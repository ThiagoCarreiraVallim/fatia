import type { GroupRole } from './community';
import type { ChallengeKind } from './community-challenges';
import type { InviteOrigin } from './community-admin';
import { inviteOriginLabel, SMALL_SAMPLE } from './community-invites';
import { apiFetch } from './http';

/**
 * O relatório do mês e as origens dos convites (#400, Pn-03, Pn-25, Ex-02).
 * Tudo aqui é apresentação: quem decide o que sai (só quem aceitou entrar nas
 * estatísticas, mínimo de 5 de cada lado) é a API. `null` é sempre "amostra
 * pequena demais", nunca zero.
 */

export interface ReportCell {
  key: string;
  value: number | null;
  suppressed: boolean;
}

export interface ReportWeek extends ReportCell {
  days: number;
}

export interface ReportChallengeRow {
  id: string;
  title: string;
  kind: ChallengeKind;
  participants: number | null;
  finished: number | null | 'running';
  reviewed: number | null;
  voided: number | null;
}

export interface MonthReport {
  month: string;
  months: string[];
  partial: boolean;
  groupName: string;
  optIn: number | null;
  riskDays: number;
  weeklySessionsGoal: number | null;
  activeMembers: {
    value: number | null;
    percent: number | null;
    deltaPts: number | null;
    delta: number | null;
  };
  sessions: { total: number | null; perActive: number | null; deltaPct: number | null };
  trainingDays: { perActive: number | null; deltaPct: number | null };
  returned: number | null;
  atRisk: number | null;
  plans: {
    sent: number | null;
    acceptedPercent: number | null;
    declined: number | null;
    noResponse: number | null;
  };
  reviews: { reviewed: number | null; withinDayPercent: number | null; medianHours: number | null };
  weeks: ReportWeek[];
  weeksAverage: number | null;
  weeksOnGoal: { hit: number; of: number } | null;
  activeByDay: ReportCell[];
  challenges: ReportChallengeRow[];
  challengeLift: number | null;
}

export type OriginsDays = 7 | 30;
export type OriginKindLabel = 'qr' | 'link' | 'list' | 'email' | 'code';

export interface OriginRow {
  key: string;
  origin: InviteOrigin | null;
  label: string | null;
  kind: OriginKindLabel;
  joined: number | null;
  activated: number | null;
  percent: number | null;
}

export interface InviteOrigins {
  days: OriginsDays;
  joined: number | null;
  activated: number | null;
  percent: number | null;
  rows: OriginRow[];
}

export interface ReportTeamMember {
  membershipId: string;
  name: string;
  role: GroupRole;
  reportEmail: boolean;
}

export interface ReportSettings {
  weeklySessionsGoal: number | null;
  reportEmailEnabled: boolean;
  emailAvailable: boolean;
  team: ReportTeamMember[];
}

const base = '/api/groups';
const json = (body: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const reportApi = {
  report: (groupId: string, month?: string) =>
    apiFetch<MonthReport>(
      `${base}/${groupId}/report${month ? `?${new URLSearchParams({ month })}` : ''}`,
    ),
  origins: (groupId: string, days: OriginsDays) =>
    apiFetch<InviteOrigins>(`${base}/${groupId}/invites/origins?days=${days}`),
  settings: (groupId: string) => apiFetch<ReportSettings>(`${base}/${groupId}/report/settings`),
  updateSettings: (
    groupId: string,
    body: { weeklySessionsGoal?: number | null; reportEmailEnabled?: boolean },
  ) =>
    apiFetch<ReportSettings>(`${base}/${groupId}/report/settings`, {
      method: 'PATCH',
      ...json(body),
    }),
  setRecipient: (groupId: string, membershipId: string, enabled: boolean) =>
    apiFetch<ReportSettings>(`${base}/${groupId}/report/recipients/${membershipId}`, {
      method: 'PUT',
      ...json({ enabled }),
    }),
};

// ---------------------------------------------------------------- textos

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const mesDe = (month: string) => MESES[Number(month.slice(5, 7)) - 1]!;

/** "outubro" no ano corrente; "dezembro de 2025" fora dele. */
function monthLabel(month: string, current: string): string {
  return month.slice(0, 4) === current.slice(0, 4)
    ? mesDe(month)
    : `${mesDe(month)} de ${month.slice(0, 4)}`;
}

/** "Relatório de outubro" (Pn-03). `current` é o mês corrente (o primeiro de `months`). */
export function reportTitle(month: string, current: string): string {
  return `Relatório de ${monthLabel(month, current)}`;
}

/** A opção do seletor de mês: o corrente avisa que vai até ontem. */
export function reportMonthOption(month: string, current: string): string {
  return month === current ? `${mesDe(month)} (até ontem)` : monthLabel(month, current);
}

/** `10.3` → "10,3"; inteiro sai sem vírgula. */
export function decimalBR(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('pt-BR') : n.toFixed(1).replace('.', ',');
}

const sinal = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

export function deltaPtsLabel(n: number | null): string | null {
  return n === null ? null : `${sinal(n)}${Math.abs(n)} pts`;
}

export function deltaPctLabel(n: number | null): string | null {
  return n === null ? null : `${sinal(n)}${Math.abs(n)}%`;
}

export function activeMembersLine(r: MonthReport): string {
  if (r.optIn === null) return 'menos de 5 aceitaram entrar nas estatísticas';
  if (r.activeMembers.value === null) {
    return `de ${r.optIn.toLocaleString('pt-BR')} que aceitaram entrar nas estatísticas`;
  }
  return `${r.activeMembers.value.toLocaleString('pt-BR')} de ${r.optIn.toLocaleString('pt-BR')} que aceitaram entrar nas estatísticas`;
}

export function sessionsLine(r: MonthReport): string {
  return r.sessions.perActive === null
    ? 'por membro ativo'
    : `${decimalBR(r.sessions.perActive)} por membro ativo`;
}

/** "81% aceitos · 4 recusados · 3 sem resposta". */
export function plansLine(p: MonthReport['plans']): string {
  if (p.sent === 0) return 'nenhum plano novo no mês';
  if (p.acceptedPercent === null) return `aceites: ${SMALL_SAMPLE}`;
  const partes = [`${p.acceptedPercent}% aceitos`];
  if (p.declined !== null)
    partes.push(`${p.declined} ${p.declined === 1 ? 'recusado' : 'recusados'}`);
  if (p.noResponse !== null) partes.push(`${p.noResponse} sem resposta`);
  return partes.join(' · ');
}

/** "em até 1 dia · mediana de 3 h". */
export function reviewsLine(r: MonthReport['reviews']): string {
  if (r.reviewed === 0) return 'nenhum treino revisado no mês';
  const partes = [r.withinDayPercent === null ? 'tempo: amostra pequena' : 'em até 1 dia'];
  if (r.medianHours !== null) partes.push(`mediana de ${r.medianHours} h`);
  return partes.join(' · ');
}

/** "3 de 4 semanas na meta da equipe"; sem meta, nada. */
export function weeksSummary(r: MonthReport): string | null {
  if (!r.weeklySessionsGoal || !r.weeksOnGoal) return null;
  return `${r.weeksOnGoal.hit} de ${r.weeksOnGoal.of} semanas na meta da equipe`;
}

const KIND_SHORT: Record<ChallengeKind, string> = {
  METRIC: 'treinos',
  PHOTO: 'check-in com foto',
  WATER: 'água',
  STEPS: 'passos',
  NUTRITION: 'nutrição',
  POINTS: 'pontos',
};

export function challengeKindShort(kind: ChallengeKind): string {
  return KIND_SHORT[kind];
}

const LESS = 'menos de 5';

export function challengeCountLabel(n: number | null): string {
  return n === null ? LESS : n.toLocaleString('pt-BR');
}

export function challengeFinishedLabel(row: ReportChallengeRow): string {
  if (row.finished === 'running') return 'em andamento';
  return challengeCountLabel(row.finished);
}

/** "23 · 4 anulados". */
export function challengeReviewedLabel(row: ReportChallengeRow): string {
  if (row.reviewed === null) return LESS;
  if (row.voided === null) return row.reviewed.toLocaleString('pt-BR');
  return `${row.reviewed.toLocaleString('pt-BR')} · ${row.voided} ${row.voided === 1 ? 'anulado' : 'anulados'}`;
}

export function challengeLiftLine(lift: number | null): string | null {
  if (lift === null) return null;
  return `Quem participa de algum desafio registra ${decimalBR(lift)}× mais dias no mês do que quem não participa.`;
}

export const ORIGINS_PERIODS: { value: OriginsDays; label: string }[] = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
];

const KIND_LABEL: Record<OriginKindLabel, string> = {
  qr: 'QR',
  link: 'link',
  list: 'lista',
  email: 'e-mail',
  code: 'código',
};

export function originKindLabel(kind: OriginKindLabel): string {
  return KIND_LABEL[kind];
}

/** "QR · recepção", "Instagram" ou só o nome, quando o link não tem origem. */
export function originRowName(row: OriginRow): string {
  if (!row.origin) return row.label ?? 'Sem nome';
  // O rótulo do QR no formulário já diz "recepção"; aqui o nome do link completa.
  const origem = row.origin === 'QR' ? 'QR' : inviteOriginLabel(row.origin);
  return row.label ? `${origem} · ${row.label}` : origem;
}
