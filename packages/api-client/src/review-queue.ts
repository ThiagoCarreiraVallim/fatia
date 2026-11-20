import { whatsappChatHref } from './community-invites';
import { panelHref } from './community-panel';
import { apiFetch } from './http';
import type { ShareScope } from './sharing';
import type { WorkoutCheckin, WorkoutSessionSummary } from './workout';

/**
 * "Para revisar", "Em risco" e a sessão feita no painel (#399, Pn-02, Pn-35 e
 * Pn-35b). Tudo aqui é apresentação: quem decide quem aparece (só quem deu
 * vínculo a quem olha) e o que se lê é a API.
 */

/** `PLAN_ENDED`: plano com fim que terminou (#403, Pn-30). */
export type ReviewKind = 'WORKOUT' | 'GOAL' | 'PLAN_RESPONSE' | 'PLAN_ENDED';

export interface PanelReviewItem {
  kind: ReviewKind;
  refId: string;
  membershipId: string;
  name: string;
  at: string;
  /** Plano (nulo no treino livre), meta ou plano mandado. */
  title: string | null;
  durationMinutes: number | null;
  sets: number | null;
  answer: 'ACCEPTED' | 'DECLINED' | null;
  shares: ShareScope[];
  whatsapp: string | null;
  seenAt: string | null;
  myFeedback: boolean;
}

export interface PanelReviewQueue {
  windowDays: number;
  items: PanelReviewItem[];
}

export type RiskSignal = 'inactive' | 'never' | 'no_workout';

export interface AtRiskRow {
  membershipId: string;
  name: string;
  signal: RiskSignal;
  level: 'attention' | 'gone';
  days: number;
  lastAt: string | null;
  shares: ShareScope[];
  whatsapp: string | null;
}

export interface AtRiskView {
  riskDays: number;
  digest: boolean;
  canConfigure: boolean;
  rows: AtRiskRow[];
}

export type SessionReaction = 'STRONG' | 'FIRE' | 'CLAP' | 'HEART';

export interface ReviewFeedback {
  id: string;
  authorName: string | null;
  reaction: SessionReaction | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
}

/** O detalhe da sessão para a equipe: o mesmo resumo do "Treino feito!". */
export type ReviewSessionSummary = Omit<
  WorkoutSessionSummary,
  'checkin' | 'questions' | 'savedPlanId' | 'feedback'
>;

export type ReviewSessionView =
  | {
      shared: true;
      membershipId: string;
      name: string;
      whatsapp: string | null;
      summary: ReviewSessionSummary;
      checkin: WorkoutCheckin | null;
      feedback: ReviewFeedback[];
      seenAt: string | null;
    }
  | { shared: false; name: string };

export interface SessionFeedbackInput {
  reaction?: SessionReaction | null;
  body?: string | null;
}

const KIND_PARAM: Record<ReviewKind, string> = {
  WORKOUT: 'workout',
  GOAL: 'goal',
  PLAN_RESPONSE: 'plan',
  PLAN_ENDED: 'plan-ended',
};

const base = (groupId: string) => `/api/groups/${groupId}`;
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const reviewApi = {
  queue: (groupId: string) => apiFetch<PanelReviewQueue>(`${base(groupId)}/review`),
  markSeen: (groupId: string, kind: ReviewKind, refId: string) =>
    apiFetch<{ seenAt: string }>(`${base(groupId)}/review/${KIND_PARAM[kind]}/${refId}/seen`, {
      method: 'POST',
    }),
  session: (groupId: string, sessionId: string) =>
    apiFetch<ReviewSessionView>(`${base(groupId)}/review/sessions/${sessionId}`),
  sendFeedback: (groupId: string, sessionId: string, input: SessionFeedbackInput) =>
    apiFetch<ReviewFeedback>(
      `${base(groupId)}/review/sessions/${sessionId}/feedback`,
      json('POST', input),
    ),
  atRisk: (groupId: string) => apiFetch<AtRiskView>(`${base(groupId)}/at-risk`),
  setRiskDays: (groupId: string, riskDays: number) =>
    apiFetch<{ riskDays: number }>(
      `${base(groupId)}/at-risk/settings`,
      json('PATCH', { riskDays }),
    ),
  setDigest: (groupId: string, enabled: boolean) =>
    apiFetch<{ digest: boolean }>(`${base(groupId)}/at-risk/digest`, json('PUT', { enabled })),
};

// ---------------------------------------------------------------- fila

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const KIND_LABEL: Record<ReviewKind, string> = {
  WORKOUT: 'treino',
  GOAL: 'meta',
  PLAN_RESPONSE: 'plano',
  PLAN_ENDED: 'plano',
};

/** A etiqueta "Tipo" da linha. */
export function reviewKindLabel(item: Pick<PanelReviewItem, 'kind'>): string {
  return KIND_LABEL[item.kind];
}

/** "O que aconteceu": "Inferior v2 · 52 min · 19 séries", "Recusou “Cutting”"... */
export function reviewLine(item: PanelReviewItem): string {
  if (item.kind === 'GOAL') return `Concluiu a meta “${item.title ?? ''}”`;
  if (item.kind === 'PLAN_RESPONSE') {
    return `${item.answer === 'ACCEPTED' ? 'Aceitou' : 'Recusou'} “${item.title ?? ''}”`;
  }
  if (item.kind === 'PLAN_ENDED') return `Terminou “${item.title ?? ''}”`;
  return [
    item.title ?? 'Treino livre',
    item.durationMinutes !== null ? `${item.durationMinutes} min` : null,
    // Sessão sem série (só o tempo) não diz "0 séries".
    item.sets ? plural(item.sets, 'série', 'séries') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const SHARE_SHORT: [ShareScope, string][] = [
  ['WORKOUT', 'treino'],
  ['NUTRITION', 'alimentação'],
  ['BODY', 'corpo'],
  ['HABITS', 'hábitos'],
  ['GOALS', 'metas'],
  ['MEAL_PHOTOS', 'fotos'],
];

/** A coluna "Compartilha": o que a pessoa libera para quem olha. */
export function sharesLine(scopes: readonly ShareScope[]): string {
  const out = SHARE_SHORT.filter(([s]) => scopes.includes(s)).map(([, l]) => l);
  return out.length ? out.join(', ') : 'nada';
}

/** As abas "Para revisar" e "Revisados", pelo "Visto" de quem olha. */
export function splitReview(items: readonly PanelReviewItem[]): {
  open: PanelReviewItem[];
  seen: PanelReviewItem[];
} {
  return {
    open: items.filter((i) => i.seenAt === null),
    seen: items.filter((i) => i.seenAt !== null),
  };
}

export type ReviewFilter = 'all' | 'workouts' | 'plans';

/**
 * Os filtros da prancha que já têm o que mostrar. Avaliações (#383),
 * questionários (#391), alimentação e desafios entram com as issues deles.
 */
export function reviewFiltersFor(): { key: ReviewFilter; label: string }[] {
  return [
    { key: 'all', label: 'Tudo' },
    { key: 'workouts', label: 'Treinos' },
    { key: 'plans', label: 'Respostas e planos' },
  ];
}

export function filterReview(
  items: readonly PanelReviewItem[],
  filter: ReviewFilter,
): PanelReviewItem[] {
  if (filter === 'workouts') return items.filter((i) => i.kind === 'WORKOUT' || i.kind === 'GOAL');
  if (filter === 'plans') {
    return items.filter((i) => i.kind === 'PLAN_RESPONSE' || i.kind === 'PLAN_ENDED');
  }
  return [...items];
}

/** Abrir a linha: o treino abre a sessão (Pn-35); o resto, a ficha (#402). */
export function reviewAction(
  groupId: string,
  item: PanelReviewItem,
): { label: string; href: string } {
  if (item.kind === 'WORKOUT') {
    return { label: 'Ver sessão', href: `${panelHref(groupId, 'review')}/sessions/${item.refId}` };
  }
  return { label: 'Abrir ficha', href: `${panelHref(groupId, 'members')}/${item.membershipId}` };
}

/**
 * O link do WhatsApp com o número e o texto pronto (#338, etapa 1). O número
 * segue a regra de `whatsappChatHref` (#401): sem DDI, assume o Brasil; curto
 * demais, nulo.
 */
export function whatsappTextHref(phone: string, text: string): string | null {
  const chat = whatsappChatHref(phone);
  return chat ? `${chat}?text=${encodeURIComponent(text)}` : null;
}

/** O texto pronto da linha da fila. Termina em espaço para quem escreve continuar. */
export function reviewWhatsappText(item: PanelReviewItem): string {
  const oi = `Oi, ${firstName(item.name)}!`;
  if (item.kind === 'GOAL') return `${oi} Parabéns por concluir a meta “${item.title ?? ''}”! `;
  if (item.kind === 'PLAN_RESPONSE') {
    return item.answer === 'ACCEPTED'
      ? `${oi} Vi que você aceitou “${item.title ?? ''}”. Qualquer dúvida, me chama. `
      : `${oi} Vi que você recusou “${item.title ?? ''}”. Quer conversar sobre o plano? `;
  }
  if (item.kind === 'PLAN_ENDED') {
    return `${oi} Você terminou “${item.title ?? ''}”! Vamos montar o próximo? `;
  }
  return `${oi} Vi seu treino no Fatia. `;
}

// ---------------------------------------------------------------- em risco

/** As opções do limite, no mesmo intervalo da API (3 a 60 dias). */
export const RISK_DAYS_OPTIONS = [3, 5, 7, 10, 14, 21, 30, 45, 60] as const;

/** As opções com o valor atual, mesmo fora da lista (gravado pela API ou pelo MCP). */
export function riskDaysOptions(current: number): number[] {
  const out: number[] = [...RISK_DAYS_OPTIONS];
  if (!out.includes(current)) out.push(current);
  return out.sort((a, b) => a - b);
}

/**
 * A aba Em risco como caminho próprio: é para onde o aviso diário leva, e o
 * toque no aviso só aceita caminho sem `?` (`notificationTarget`).
 */
export function riskAtRiskHref(groupId: string): string {
  return `${panelHref(groupId, 'review')}/at-risk`;
}

/** A etiqueta "Tipo" do em risco. */
export function riskKindLabel(row: Pick<AtRiskRow, 'signal' | 'level'>): string {
  if (row.signal === 'never') return 'não começou';
  if (row.level === 'gone') return 'sumiu';
  return row.signal === 'no_workout' ? 'sem treino' : 'parado';
}

/** O "Sinal" do em risco. */
export function riskLine(row: AtRiskRow): string {
  const dias = plural(row.days, 'dia', 'dias');
  if (row.signal === 'never') return `Nada registrado desde que entrou, há ${dias}`;
  if (row.signal === 'no_workout')
    return `Sem treinar há ${dias} · segue registrando outras coisas`;
  return `Último registro há ${dias}`;
}

export function riskWhatsappText(row: Pick<AtRiskRow, 'name'>): string {
  return `Oi, ${firstName(row.name)}! Tudo bem? Senti sua falta por aqui. Posso te ajudar a voltar ao ritmo? `;
}

// ---------------------------------------------------------------- sessão feita

export const SESSION_REACTIONS: { key: SessionReaction; emoji: string; label: string }[] = [
  { key: 'STRONG', emoji: '💪', label: 'Força' },
  { key: 'FIRE', emoji: '🔥', label: 'Pegou fogo' },
  { key: 'CLAP', emoji: '👏', label: 'Palmas' },
  { key: 'HEART', emoji: '❤️', label: 'Coração' },
];

export function reactionEmoji(r: SessionReaction): string {
  return SESSION_REACTIONS.find((x) => x.key === r)?.emoji ?? '';
}

export const FEEDBACK_BODY_MAX = 500;

/** O tamanho do comentário como a API e o banco contam: code points, sem as pontas. */
export function feedbackBodyLength(body: string): number {
  return [...body.trim()].length;
}

/** "Como foi": "cansaço 3 de 5 · sem dor", "dor no joelho", "pulou as perguntas". */
export function checkinLine(
  c: Pick<WorkoutCheckin, 'skipped' | 'fatigue' | 'pain' | 'painLocation'> | null,
): string | null {
  if (!c) return null;
  if (c.skipped) return 'pulou as perguntas';
  const partes = [
    c.fatigue !== null ? `cansaço ${c.fatigue} de 5` : null,
    c.pain === true ? (c.painLocation ? `dor no ${c.painLocation}` : 'sentiu dor') : null,
    c.pain === false ? 'sem dor' : null,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
}

/** Quem mandou o comentário, no treino do aluno: "Helena Prado · Academia Demo". */
export function sessionFeedbackByline(f: { authorName: string | null; groupName: string }): string {
  return `${f.authorName ?? 'Equipe'} · ${f.groupName}`;
}
