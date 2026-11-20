import { apiFetch } from './http';
import type { PlanTemplate, TemplateKind } from './community-content';
import { PLAN_LEVEL_LABEL } from './content-panel';
import { dayMonth } from './format';
import type { ChipTone } from './seats-panel';

/**
 * A biblioteca da equipe e o "Enviar para alunos" (#405, pranchas Pn-08,
 * Pn-08b, Pn-08c, Pn-08d e Pn-18). Textos e regras de tela, iguais na web e no
 * app; quem decide quem recebe é a API (`groups/:id/sends`).
 */

// ---------------------------------------------------------------- tipos

/** "Com quem": pessoas distintas com cópia; abaixo de 5, sem número. */
export interface TemplateReach {
  band: 'none' | 'few' | 'many';
  count: number | null;
}

export type LibraryFilter = 'all' | 'community' | 'team' | 'drafts';

export interface SendRecipient {
  membershipId: string;
  name: string;
  /** "Acompanhados por mim" (#404). */
  accompaniedByMe: boolean;
  /** Tem plano esperando resposta ou em andamento nesta comunidade. */
  hasPlan: boolean;
  /**
   * Já tem este modelo de quem envia: o envio vira versão nova ("o que
   * mudou"). O mesmo modelo mandado por outra pessoa da equipe não conta.
   */
  alreadyHas: boolean;
  /** Segue um plano flexível sem fim: "depois do plano atual" não vale para ela. */
  openEnded: boolean;
}

export type SendStart = 'TODAY' | 'AFTER_CURRENT' | 'DATE';
export type SendKind = 'WORKOUT' | 'NUTRITION' | 'HABIT' | 'QUESTIONNAIRE' | 'RECOMMENDATION';

export interface SendPlansInput {
  templateId: string;
  membershipIds: string[];
  schedule?: 'CALENDAR' | 'FLEXIBLE';
  start?: SendStart;
  startDate?: string;
  weeks?: number;
  weekdays?: number[];
  endDate?: string;
  note?: string;
  changeNote?: string;
}

export interface SendResult {
  results: Array<{ membershipId: string; id: string; version: number; kind: 'new' | 'update' }>;
}

export type SentStatus = 'SENT' | 'ACCEPTED' | 'DECLINED' | 'SUPERSEDED' | 'REVOKED' | 'ENDED';

export interface SentItem {
  id: string;
  kind: 'WORKOUT' | 'NUTRITION';
  title: string;
  version: number;
  changeNote: string | null;
  name: string;
  membershipId: string | null;
  sentAt: string;
  status: SentStatus;
  schedule: 'CALENDAR' | 'FLEXIBLE' | null;
  startDate: string | null;
  endDate: string | null;
  /** Só com Treino liberado para quem olha. */
  progress: { done: number; planned: number | null; percent: number | null } | null;
  /** Aceito sem Treino liberado: "sem progresso", sem o motivo. */
  noProgress: boolean;
  canRevoke: boolean;
}

const base = '/api/groups';
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const sendsApi = {
  recipients: (groupId: string, templateId?: string) =>
    apiFetch<{ recipients: SendRecipient[] }>(
      `${base}/${groupId}/sends/recipients${
        templateId ? `?${new URLSearchParams({ templateId }).toString()}` : ''
      }`,
    ),
  list: (groupId: string) => apiFetch<{ items: SentItem[] }>(`${base}/${groupId}/sends`),
  send: (groupId: string, input: SendPlansInput) =>
    apiFetch<SendResult>(`${base}/${groupId}/sends`, json('POST', input)),
  revoke: (groupId: string, id: string) =>
    apiFetch<{ id: string; status: 'REVOKED' }>(
      `${base}/${groupId}/sends/${id}/revoke`,
      json('POST'),
    ),
};

// ---------------------------------------------------------------- biblioteca

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function withWhomLabel(r: TemplateReach | undefined): string {
  if (!r) return '—';
  if (r.band === 'many' && r.count !== null) return plural(r.count, 'pessoa', 'pessoas');
  return r.band === 'few' ? 'menos de 5' : 'ninguém ainda';
}

/** A coluna "Na comunidade" (Pn-08): o rascunho não publica. */
export function communityToggleLabel(t: Pick<PlanTemplate, 'draft' | 'publishedAt'>): {
  label: string;
  hint: string;
  disabled: boolean;
} {
  if (t.draft) return { label: 'termine antes', hint: 'rascunho', disabled: true };
  return t.publishedAt
    ? { label: 'publicado', hint: 'membros podem adotar', disabled: false }
    : { label: 'não', hint: 'só a equipe envia', disabled: false };
}

export const LIBRARY_FILTERS: { key: LibraryFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'community', label: 'Na comunidade' },
  { key: 'team', label: 'Só da equipe' },
  { key: 'drafts', label: 'Rascunhos' },
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterLibrary(
  lista: PlanTemplate[],
  f: { kind: TemplateKind; filter: LibraryFilter; query?: string; author?: string | null },
): PlanTemplate[] {
  const q = semAcento(f.query?.trim() ?? '');
  return lista.filter((t) => {
    if (t.kind !== f.kind) return false;
    if (f.filter === 'community' && !t.publishedAt) return false;
    if (f.filter === 'team' && (t.publishedAt || t.draft)) return false;
    if (f.filter === 'drafts' && !t.draft) return false;
    if (f.author && t.authorName !== f.author) return false;
    return !q || semAcento(t.title).includes(q);
  });
}

export function libraryCounts(lista: PlanTemplate[]): Record<TemplateKind, number> {
  return {
    WORKOUT: lista.filter((t) => t.kind === 'WORKOUT').length,
    NUTRITION: lista.filter((t) => t.kind === 'NUTRITION').length,
  };
}

export function libraryAuthors(lista: PlanTemplate[]): string[] {
  return [...new Set(lista.map((t) => t.authorName))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** A coluna "Formato": "6 exercícios · intermediário", "5 refeições · 1700–1900 kcal". */
export function libraryFormat(
  t: Pick<PlanTemplate, 'kind' | 'exercises' | 'meals' | 'goals' | 'level'>,
): string {
  const partes: string[] = [];
  if (t.kind === 'WORKOUT') partes.push(plural(t.exercises.length, 'exercício', 'exercícios'));
  else {
    if (t.meals.length) partes.push(plural(t.meals.length, 'refeição', 'refeições'));
    if (t.goals) partes.push(`${t.goals.kcalMin}–${t.goals.kcalMax} kcal`);
  }
  if (t.level) partes.push(PLAN_LEVEL_LABEL[t.level].toLowerCase());
  return partes.join(' · ') || '—';
}

export function canSendTemplate(t: Pick<PlanTemplate, 'draft'>): boolean {
  return !t.draft;
}

// ---------------------------------------------------------------- enviar

/**
 * O que se envia (Pn-18). Hábito, questionário e recomendação são dado novo
 * que nasce com as issues deles (decisão adotada da #405): ficam à vista,
 * desligados, dizendo quando chegam.
 */
export const SEND_KINDS: Array<{ key: SendKind; label: string; enabled: boolean; soon?: string }> =
  [
    { key: 'WORKOUT', label: 'Plano de treino', enabled: true },
    { key: 'NUTRITION', label: 'Plano alimentar', enabled: true },
    {
      key: 'HABIT',
      label: 'Hábito',
      enabled: false,
      soon: 'Chega junto com os hábitos da semana.',
    },
    {
      key: 'QUESTIONNAIRE',
      label: 'Questionário',
      enabled: false,
      soon: 'Chega junto com os questionários.',
    },
    {
      key: 'RECOMMENDATION',
      label: 'Recomendação',
      enabled: false,
      soon: 'Chega junto com as recomendações em Para você.',
    },
  ];

export const SEND_STARTS: { key: SendStart; label: string }[] = [
  { key: 'TODAY', label: 'Hoje' },
  { key: 'AFTER_CURRENT', label: 'Depois do plano atual' },
  { key: 'DATE', label: 'Escolher data' },
];

const primeiro = (n: string) => n.trim().split(/\s+/)[0] ?? n;

export function sendButtonLabel(names: string[]): string {
  if (names.length === 0) return 'Escolha para quem';
  if (names.length === 1) return `Enviar para ${primeiro(names[0]!)}`;
  return `Enviar para ${names.length} pessoas`;
}

/** Os grupos do painel "Enviar" (Pn-08b): todos, quem eu acompanho e sem plano. */
export function recipientFilters(
  lista: SendRecipient[],
): Array<{ key: 'all' | 'mine' | 'noPlan'; label: string; count: number; ids: string[] }> {
  const grupo = (
    key: 'all' | 'mine' | 'noPlan',
    label: string,
    f: (r: SendRecipient) => boolean,
  ) => {
    const ids = lista.filter(f).map((r) => r.membershipId);
    return { key, label, count: ids.length, ids };
  };
  return [
    grupo('all', 'Todos', () => true),
    grupo('mine', 'Que eu acompanho', (r) => r.accompaniedByMe),
    grupo('noPlan', 'Sem plano', (r) => !r.hasPlan),
  ];
}

export function validateSendForm(f: {
  kind: TemplateKind;
  templateId: string | null;
  membershipIds: string[];
  schedule: 'CALENDAR' | 'FLEXIBLE';
  start: SendStart;
  startDate?: string | null;
  weeks?: number | null;
  weekdays: number[];
}): string | null {
  if (!f.templateId) return 'Escolha o plano.';
  if (f.membershipIds.length === 0) return 'Escolha para quem enviar.';
  if (f.kind === 'WORKOUT' && f.schedule === 'CALENDAR') {
    if (!f.weeks || f.weeks < 1) return 'Diga quantas semanas.';
    if (f.weekdays.length === 0) return 'Escolha os dias da semana.';
    if (f.start === 'DATE' && !f.startDate) return 'Escolha o dia de começar.';
  }
  return null;
}

/** "Como chega para Ana" (Pn-18): o cartão de Para você. */
export function sendPreview(p: { kind: TemplateKind; title: string; changeNote: string | null }): {
  eyebrow: string;
  title: string;
  body: string;
  button: string;
} {
  const note = p.changeNote?.trim();
  if (p.kind === 'NUTRITION') {
    return {
      eyebrow: 'PLANO ALIMENTAR',
      title: p.title,
      body: note || 'Metas do dia e refeições do plano. Aceitar troca as metas.',
      button: note ? 'Ver o que mudou' : 'Ver plano',
    };
  }
  return {
    eyebrow: 'PLANO NOVO',
    title: p.title,
    body: note || 'Toque para ver os exercícios e aceitar.',
    button: note ? 'Ver o que mudou' : 'Ver plano',
  };
}

export function sendSuccessToast(r: SendResult): string {
  const novas = r.results.filter((x) => x.kind === 'update').length;
  if (novas === 0) return 'Enviado · cada pessoa aceita no app';
  return `Enviado · ${novas} ${novas === 1 ? 'recebeu' : 'receberam'} a versão nova`;
}

// ---------------------------------------------------------------- enviados

const STATUS: Record<SentStatus, { label: string; tone: ChipTone }> = {
  SENT: { label: 'enviado', tone: 'info' },
  ACCEPTED: { label: 'aceito', tone: 'ok' },
  DECLINED: { label: 'recusado', tone: 'warn' },
  SUPERSEDED: { label: 'substituído', tone: 'muted' },
  REVOKED: { label: 'cancelado', tone: 'muted' },
  ENDED: { label: 'terminou', tone: 'neutral' },
};

export function sentStatus(s: SentStatus): { label: string; tone: ChipTone } {
  return STATUS[s];
}

/** "Ana Dias · 30 set · v2 · 10 nov – 07 dez". */
export function sentLine(i: SentItem): string {
  const partes = [i.name, dayMonth(i.sentAt.slice(0, 10))];
  if (i.version > 1) partes.push(`v${i.version}`);
  if (i.schedule === 'CALENDAR' && i.startDate) {
    partes.push(
      i.endDate ? `${dayMonth(i.startDate)} – ${dayMonth(i.endDate)}` : dayMonth(i.startDate),
    );
  } else if (i.schedule === 'FLEXIBLE') {
    partes.push(i.endDate ? `flexível até ${dayMonth(i.endDate)}` : 'flexível');
  }
  return partes.join(' · ');
}

export function sentProgressLine(i: SentItem): string | null {
  if (i.noProgress) return 'sem progresso';
  const p = i.progress;
  if (!p) return null;
  if (p.planned) return `${p.percent ?? 0}% · sessão ${p.done} de ${p.planned}`;
  return plural(p.done, 'treino feito', 'treinos feitos');
}
