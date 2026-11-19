import type { GroupRole } from './community';
import { accessLogLine, relativeStamp } from './community-home';
import { dayMonth, formatDecimal, formatInteger, MONTHS_SHORT } from './format';
import { apiFetch } from './http';
import type { ShareScope } from './sharing';

export type MemberPlanStatus = 'PENDING' | 'DECLINED' | 'SCHEDULED' | 'ACTIVE' | 'ENDED';

export interface MemberWorkoutPlan {
  offerId: string;
  title: string;
  status: MemberPlanStatus;
  updatePending: boolean;
  version: number;
  schedule: 'CALENDAR' | 'FLEXIBLE';
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
  weekNumber: number | null;
  sessionsDone: number | null;
  sessionsPlanned: number | null;
  authorName: string | null;
  canRemove: boolean;
  sentAt: string;
  note: string | null;
  sourceTemplateId: string | null;
  position: number | null;
}

export interface MemberNutritionPlan {
  id: string;
  title: string;
  status: 'SENT' | 'ACCEPTED' | 'SUPERSEDED';
  version: number;
  kcalMin: number;
  kcalMax: number;
  authorName: string | null;
  sentAt: string;
  acceptedAt: string | null;
}

export interface MemberAccessEntry {
  at: string;
  /** `null` na abertura da ficha. */
  scope: ShareScope | null;
  action: string;
  denied: boolean;
  professionalName: string | null;
  isMe: boolean;
}

export interface MemberNote {
  id: string;
  text: string;
  authorName: string | null;
  isMine: boolean;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MyMemberNote {
  id: string;
  text: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberAgendaItem {
  kind: 'planned' | 'weighin';
  title: string;
  state: 'planned' | 'done' | 'missed' | 'today' | null;
  weightKg: number | null;
  planOrder: number | null;
}

export interface MemberAgenda {
  today: string;
  from: string;
  to: string;
  timezone: string;
  showsDone: boolean;
  showsWeighins: boolean;
  days: Array<{ date: string; items: MemberAgendaItem[] }>;
}

export interface MemberFile {
  membershipId: string;
  groupId: string;
  name: string;
  role: GroupRole;
  joinedAt: string | null;
  timezone: string;
  proByGroup: boolean;
  followedBy: string[];
  grantedToMe: ShareScope[];
  canSendPlans: boolean;
  canManagePlans: boolean;
  canWriteNotes: boolean;
  plans: {
    workout: MemberWorkoutPlan[];
    nutrition: MemberNutritionPlan[];
    reorderedBySubject: boolean;
  };
  week: {
    workouts: { done: number; target: number } | null;
    nutrition: {
      kcalAvg: number | null;
      daysLogged: number;
      kcalMin: number | null;
      kcalMax: number | null;
      proteinMinG: number | null;
      proteinDays: number | null;
    } | null;
    body: { currentWeightKg: number | null; deltaKg: number; sinceDays: number } | null;
  };
  nextDays: MemberAgenda['days'];
  notes: MemberNote[];
  accessLog: MemberAccessEntry[];
}

export interface SendMemberPlanInput {
  templateId?: string;
  planId?: string;
  schedule: 'CALENDAR' | 'FLEXIBLE';
  startDate?: string;
  weeks?: number;
  weekdays?: number[];
  note?: string;
}

export type FileTabKey =
  'summary' | 'plans' | 'workout' | 'nutrition' | 'photos' | 'body' | 'habits' | 'agenda';

export interface FileTab {
  key: FileTabKey;
  label: string;
  locked: boolean;
}

/**
 * A ficha da pessoa no painel (#402, Pn-05, Pn-05p, Pn-05d). Tipos espelham
 * `MemberFileService`; o texto da tela mora aqui para o painel e testes.
 */

/** "7 dez", sem o zero, como nas pranchas. */
const shortDay = (iso: string | null | undefined) => dayMonth(iso).replace(/^0/, '');
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const STATUS: Record<MemberPlanStatus, { label: string; tone: string }> = {
  ACTIVE: { label: 'ativo', tone: 'active' },
  PENDING: { label: 'aguardando aceite', tone: 'pending' },
  SCHEDULED: { label: 'agendado', tone: 'scheduled' },
  ENDED: { label: 'terminado', tone: 'ended' },
  DECLINED: { label: 'recusado', tone: 'ended' },
};

export function memberPlanStatus(s: MemberPlanStatus): { label: string; tone: string } {
  return STATUS[s];
}

/** Coluna "Quando" (Pn-05p). */
export function memberPlanWhen(p: MemberWorkoutPlan): string {
  if (p.schedule === 'FLEXIBLE' || !p.startDate) return 'sem datas';
  if (p.status === 'SCHEDULED') return `começa ${shortDay(p.startDate)}`;
  return `${shortDay(p.startDate)} – ${shortDay(p.endDate)}`;
}

/** Coluna "Andamento": sessões feitas só aparecem com Treino liberado (a API manda nulo). */
export function memberPlanProgress(p: MemberWorkoutPlan, subjectName: string): string {
  if (p.status === 'PENDING') return `${firstName(subjectName)} ainda não aceitou`;
  if (p.status === 'DECLINED') return `${firstName(subjectName)} recusou`;
  const parts: string[] = [];
  if (p.weekNumber !== null && p.weeks !== null) parts.push(`semana ${p.weekNumber} de ${p.weeks}`);
  if (p.sessionsDone !== null) {
    parts.push(
      p.sessionsPlanned !== null
        ? `${p.sessionsDone} de ${p.sessionsPlanned} sessões`
        : `${p.sessionsDone} ${p.sessionsDone === 1 ? 'sessão feita' : 'sessões feitas'}`,
    );
  }
  if (p.updatePending) parts.push('versão nova esperando aceite');
  return parts.join(' · ') || '—';
}

/** Sobe (-1) ou desce (+1) um id na lista, sem sair das pontas. */
export function moveId(ids: string[], id: string, delta: number): string[] {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = ids.slice();
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

const TABS: Array<{ key: FileTabKey; label: string; scopes: ShareScope[] | null }> = [
  { key: 'summary', label: 'Resumo', scopes: null },
  { key: 'plans', label: 'Planos', scopes: null },
  { key: 'workout', label: 'Treino', scopes: ['WORKOUT'] },
  { key: 'nutrition', label: 'Alimentação', scopes: ['NUTRITION'] },
  { key: 'photos', label: 'Fotos das refeições', scopes: ['MEAL_PHOTOS'] },
  { key: 'body', label: 'Corpo e avaliações', scopes: ['BODY'] },
  { key: 'habits', label: 'Hábitos e metas', scopes: ['HABITS', 'GOALS'] },
  { key: 'agenda', label: 'Agenda', scopes: null },
];

/** As abas da ficha. Resumo, Planos e Agenda são da equipe e nunca têm cadeado. */
export function fileTabs(granted: ShareScope[]): FileTab[] {
  return TABS.map((t) => ({
    key: t.key,
    label: t.label,
    locked: t.scopes !== null && !t.scopes.some((s) => granted.includes(s)),
  }));
}

/** O cadeado (Pn-05): sem resumo nem número. */
export function lockedCopy(name: string, label: string): { title: string; body: string } {
  return {
    title: `${firstName(name)} não compartilha ${label}`,
    body: 'Só ela pode ligar, no app, em Comunidade → Sobre. Você não vê nem o resumo.',
  };
}

/** "Esta semana" e "Corpo" do resumo: só os cartões da categoria liberada. */
export function memberWeekCards(
  w: MemberFile['week'],
): Array<{ key: string; label: string; value: string; sub: string }> {
  const cards: Array<{ key: string; label: string; value: string; sub: string }> = [];
  if (w.workouts) {
    cards.push({
      key: 'workouts',
      label: 'Treinos',
      value: `${w.workouts.done} de ${w.workouts.target}`,
      sub: 'nesta semana',
    });
  }
  if (w.nutrition) {
    const n = w.nutrition;
    const band =
      n.kcalMin !== null && n.kcalMax !== null
        ? `faixa ${formatInteger(n.kcalMin)}–${formatInteger(n.kcalMax)}`
        : null;
    cards.push({
      key: 'kcal',
      label: 'Calorias · média 7 dias',
      value: n.kcalAvg === null ? '—' : `${formatInteger(n.kcalAvg)} kcal`,
      sub:
        n.daysLogged === 0
          ? 'nenhum dia registrado'
          : [`${n.daysLogged} ${n.daysLogged === 1 ? 'dia registrado' : 'dias registrados'}`, band]
              .filter(Boolean)
              .join(' · '),
    });
    if (n.proteinMinG !== null && n.proteinDays !== null && n.daysLogged > 0) {
      cards.push({
        key: 'protein',
        label: `Proteína acima de ${formatInteger(n.proteinMinG)} g`,
        value: `${n.proteinDays} de ${n.daysLogged} dias`,
        sub: 'nos dias registrados',
      });
    }
  }
  if (w.body) {
    const b = w.body;
    const delta =
      b.deltaKg === 0
        ? 'sem variação'
        : `${b.deltaKg > 0 ? '+' : '−'}${formatDecimal(Math.abs(b.deltaKg))} kg em ${b.sinceDays} dias`;
    cards.push({
      key: 'weight',
      label: 'Peso',
      value: b.currentWeightKg === null ? '—' : `${formatDecimal(b.currentWeightKg)} kg`,
      sub: b.currentWeightKg === null ? `sem pesagem em ${b.sinceDays} dias` : delta,
    });
  }
  return cards;
}

/** "Membro desde set · acompanhada por Helena Prado". */
export function fileFollowLine(f: Pick<MemberFile, 'joinedAt' | 'followedBy'>): string {
  const parts: string[] = [];
  if (f.joinedAt) parts.push(`Membro desde ${MONTHS_SHORT[new Date(f.joinedAt).getUTCMonth()]}`);
  parts.push(
    f.followedBy.length > 0
      ? `acompanhada por ${f.followedBy.join(', ')}`
      : 'Ninguém da equipe acompanha',
  );
  return parts.join(' · ');
}

/** Uma linha do "Histórico de acesso à ficha": "Você" para quem olha. */
export function fileAccessLine(e: MemberAccessEntry, now: Date, tz: string): string {
  if (e.scope === null) {
    const quem = e.isMe ? 'Você' : (e.professionalName ?? 'Alguém que saiu do Fatia');
    return `${quem} abriu a ficha · ${relativeStamp(new Date(e.at), now, tz)}`;
  }
  return accessLogLine(
    {
      at: e.at,
      scope: e.scope,
      denied: e.denied,
      action: e.action,
      professionalName: e.isMe ? 'Você' : e.professionalName,
      groupId: null,
    },
    now,
    tz,
  );
}

const base = '/api/groups';
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const member = (g: string, m: string) => `${base}/${g}/members/${m}`;

export const memberFileApi = {
  file: (groupId: string, membershipId: string) =>
    apiFetch<MemberFile>(`${member(groupId, membershipId)}/file`),
  agenda: (groupId: string, membershipId: string, from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return apiFetch<MemberAgenda>(`${member(groupId, membershipId)}/agenda${qs ? `?${qs}` : ''}`);
  },
  sendPlan: (groupId: string, membershipId: string, input: SendMemberPlanInput) =>
    apiFetch<{ id: string; versionId: string; version: number }>(
      `${member(groupId, membershipId)}/plans`,
      json('POST', input),
    ),
  removePlan: (
    groupId: string,
    membershipId: string,
    offerId: string,
    opts: { notify: boolean; endToday: boolean },
  ) =>
    apiFetch<{ offerId: string; result: 'removed' | 'ended' }>(
      `${member(groupId, membershipId)}/plans/${offerId}?${new URLSearchParams({
        notify: String(opts.notify),
        endToday: String(opts.endToday),
      }).toString()}`,
      { method: 'DELETE' },
    ),
  reorderPlans: (groupId: string, membershipId: string, offerIds: string[]) =>
    apiFetch<{ offerIds: string[] }>(
      `${member(groupId, membershipId)}/plans/order`,
      json('PUT', { offerIds }),
    ),
  createNote: (groupId: string, membershipId: string, text: string) =>
    apiFetch<MemberNote>(`${member(groupId, membershipId)}/notes`, json('POST', { text })),
  updateNote: (groupId: string, membershipId: string, noteId: string, text: string) =>
    apiFetch<MemberNote>(
      `${member(groupId, membershipId)}/notes/${noteId}`,
      json('PATCH', { text }),
    ),
  removeNote: (groupId: string, membershipId: string, noteId: string) =>
    apiFetch<void>(`${member(groupId, membershipId)}/notes/${noteId}`, { method: 'DELETE' }),
};

/** As anotações da equipe sobre quem está logado, numa comunidade (só leitura). */
export const myNotesApi = {
  list: (groupId: string) => apiFetch<MyMemberNote[]>(`${base}/${groupId}/my-notes`),
};

/** A ordem dos planos no app: o primeiro é o treino de hoje. */
export const planOrderApi = {
  get: () => apiFetch<{ planIds: string[]; customized: boolean }>('/api/workout/plans/order'),
  set: (planIds: string[]) =>
    apiFetch<{ planIds: string[]; customized: boolean }>(
      '/api/workout/plans/order',
      json('PUT', { planIds }),
    ),
};

/**
 * A lista do app (#402) mistura planos e circuitos, mas cada aba reordena só
 * os seus: move dentro do subconjunto e põe o resto depois, na ordem de antes.
 */
export function moveWithin(all: string[], subset: string[], id: string, delta: number): string[] {
  const inSubset = all.filter((x) => subset.includes(x));
  const moved = moveId(inSubset, id, delta);
  if (moved === inSubset) return all;
  return [...moved, ...all.filter((x) => !subset.includes(x))];
}
