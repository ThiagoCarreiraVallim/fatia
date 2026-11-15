import { apiFetch } from './http';
import { dayMonth as paddedDayMonth } from './format';
import { PLAN_LEVEL_LABEL } from './content-panel';
import type { PlanLevel } from './community-content';
import type { TrainingBlock, TrainingBlockKind } from './workout';

/** "7 dez", sem o zero na frente, como nas pranchas Al-T2 e Al-T24. */
const dayMonth = (iso: string | null | undefined) => paddedDayMonth(iso).replace(/^0/, '');

/**
 * Plano de treino recebido da equipe, agenda de treinos, modelos das
 * comunidades e o bloco de semanas (#379; pranchas Al-T2, Al-T2b, Al-T23,
 * Al-T12 e Al-T24). Tipos espelham `PlanOfferService`, `AgendaService` e
 * `ContentService.listWorkoutTemplatesForMe`; o texto da tela mora aqui para o
 * PWA e o app dizerem a mesma coisa.
 */

// ---------------------------------------------------------------------------
// Tipos

export type PlanOfferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'SUPERSEDED';
export type PlanSchedule = 'CALENDAR' | 'FLEXIBLE';

export interface FieldChange {
  field: 'sets' | 'reps' | 'rest';
  before: string | null;
  after: string | null;
}

export interface OfferExercise {
  key: string;
  /** Id do catálogo, para "Como fazer". Nulo no exercício que viaja por valor. */
  exerciseId: number | null;
  name: string;
  muscleGroup: string | null;
  targetSets: number;
  targetReps: string;
  restSeconds: number | null;
  isNew: boolean;
  changes: FieldChange[];
}

export interface OfferVersion {
  id: string;
  version: number;
  status: PlanOfferStatus;
  title: string;
  schedule: PlanSchedule;
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
  weekdays: number[];
  note: string | null;
  sentAt: string;
  respondedAt: string | null;
  summary: { exercises: number; sets: number; minutes: number };
  exercises: OfferExercise[];
  removed: Array<{ key: string; name: string }>;
}

export interface PlanDiff {
  added: string[];
  removed: string[];
  changed: Array<{ key: string; fields: FieldChange[] }>;
}

export interface PlanOffer {
  id: string;
  author: { name: string } | null;
  group: { id: string; name: string } | null;
  kind: 'new' | 'update';
  shown: OfferVersion;
  accepted: { id: string; version: number; planId: string | null } | null;
  diff: (PlanDiff & { hasChanges: boolean }) | null;
  planId: string | null;
}

export interface PlanOfferSummary {
  id: string;
  versionId: string;
  title: string;
  version: number;
  kind: 'new' | 'update';
  status: PlanOfferStatus;
  schedule: PlanSchedule;
  authorName: string | null;
  groupName: string | null;
  sentAt: string;
  planId: string | null;
  href: string;
}

export type AgendaState = 'done' | 'missed' | 'today' | 'planned';

export interface AgendaItem {
  id: string;
  kind: 'planned' | 'next';
  planId: string;
  planName: string;
  order: number | null;
  state: AgendaState;
  rescheduledFrom: string | null;
  canReschedule: boolean;
  endDate: string | null;
}

export interface AgendaEnded {
  planId?: string;
  planName: string;
  authorName: string | null;
  done: number;
  total: number;
  weeks: number;
}

export interface Agenda {
  today: string;
  from: string;
  to: string;
  days: Array<{ date: string; items: AgendaItem[] }>;
  calendarPlan: {
    planId: string;
    planName: string;
    authorName: string | null;
    weekNumber: number;
    weeksTotal: number;
    startDate: string;
    endDate: string;
  } | null;
  flexible: Array<{ planId: string; planName: string }>;
  ended: (AgendaEnded & { planId: string }) | null;
  empty: boolean;
}

export interface WorkoutTemplateItem {
  id: string;
  title: string;
  level: PlanLevel | null;
  authorName: string;
  exerciseCount: number;
  setCount: number;
  adoptedPlanId: string | null;
}

export interface WorkoutTemplatesGroup {
  group: { id: string; name: string };
  templates: WorkoutTemplateItem[];
}

export interface BlockPreviewWeek {
  weekNumber: number;
  focus: 'accumulation' | 'peak' | 'deload';
  label: string;
  intensityFactor: number;
  volumeFactor: number;
  sessionsTarget: number;
  summary: string;
}

export interface BlockPreview {
  kind: TrainingBlockKind;
  kindLabel: string;
  repRange: string;
  weeksTotal: number;
  weeks: BlockPreviewWeek[];
}

// ---------------------------------------------------------------------------
// Chamadas

const respond = (versionId: string) => ({
  method: 'POST',
  body: JSON.stringify({ versionId }),
});

export const planOffersApi = {
  list: () =>
    apiFetch<{ pending: PlanOfferSummary[]; accepted: PlanOfferSummary[] }>('/api/plan-offers'),
  get: (id: string) => apiFetch<PlanOffer>(`/api/plan-offers/${id}`),
  accept: (id: string, versionId: string) =>
    apiFetch<PlanOffer>(`/api/plan-offers/${id}/accept`, respond(versionId)),
  decline: (id: string, versionId: string) =>
    apiFetch<PlanOffer>(`/api/plan-offers/${id}/decline`, respond(versionId)),
  undoDecline: (id: string, versionId: string) =>
    apiFetch<PlanOffer>(`/api/plan-offers/${id}/undo-decline`, respond(versionId)),
};

export const agendaApi = {
  range: (from: string, to: string) =>
    apiFetch<Agenda>(`/api/workout/agenda?from=${from}&to=${to}`),
  reschedule: (id: string, date: string) =>
    apiFetch<{ id: string; date: string; rescheduledFrom: string | null; planName: string }>(
      `/api/workout/agenda/${id}`,
      { method: 'PATCH', body: JSON.stringify({ date }) },
    ),
};

export const workoutTemplatesApi = {
  listMine: () => apiFetch<WorkoutTemplatesGroup[]>('/api/groups/templates'),
};

export const blockPlannerApi = {
  preview: (q: { weeks: number; kind: TrainingBlockKind; sessionsPerWeek?: number }) => {
    const qs = new URLSearchParams({ weeks: String(q.weeks), kind: q.kind });
    if (q.sessionsPerWeek) qs.set('sessionsPerWeek', String(q.sessionsPerWeek));
    return apiFetch<BlockPreview>(`/api/workout/blocks/preview?${qs.toString()}`);
  },
  latest: () => apiFetch<TrainingBlock | null>('/api/workout/blocks/latest'),
  create: (body: {
    planId?: string;
    kind?: TrainingBlockKind;
    sessionsPerWeek?: number;
    weeks?: number;
  }) =>
    apiFetch<TrainingBlock>('/api/workout/blocks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ---------------------------------------------------------------------------
// Datas (YYYY-MM-DD, sem `Date` local: o fuso do aparelho não pode mudar o dia)

const toUtc = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number) => fromUtc(toUtc(ymd) + n * 86_400_000);
/** 1 = segunda … 7 = domingo. */
const isoWeekday = (ymd: string) => {
  const d = new Date(toUtc(ymd)).getUTCDay();
  return d === 0 ? 7 : d;
};
const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'] as const;
const MONTHS_LONG = [
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
] as const;

const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] ?? null;

// ---------------------------------------------------------------------------
// Plano recebido

/** "Inferior v2": a versão aparece a partir da segunda. */
export function offerTitle(v: Pick<OfferVersion, 'title' | 'version'>): string {
  return v.version > 1 ? `${v.title} v${v.version}` : v.title;
}

/** O selo e a linha do "quando" (Al-T2 calendário, Al-T2b flexível). */
export function offerWhen(v: Pick<OfferVersion, 'schedule' | 'startDate' | 'endDate' | 'weeks'>): {
  label: string;
  sub: string;
  tone: 'calendar' | 'flexible';
} {
  if (v.schedule === 'CALENDAR' && v.startDate && v.endDate && v.weeks) {
    return {
      label: `${v.weeks} ${v.weeks === 1 ? 'semana' : 'semanas'} · ${dayMonth(v.startDate)} – ${dayMonth(v.endDate)}`,
      sub: 'as sessões entram na sua agenda',
      tone: 'calendar',
    };
  }
  return { label: 'Flexível', sub: 'sem datas · siga no seu ritmo', tone: 'flexible' };
}

/** "Academia Demo · hoje 09:12" (o remetente, embaixo do nome). */
export function offerSentLine(
  groupName: string | null,
  sentAt: string,
  now: Date,
  timezone: string,
): string {
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone, ...opts }).format(d);
  const sent = new Date(sentAt);
  const day = fmt(sent, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt(now, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const clock = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(sent);
  const when = `${day === today ? 'hoje' : dayMonth(day)} ${clock}`;
  return groupName ? `${groupName} · ${when}` : when;
}

/** "3 × 10–12" (faixa com meia-risca), ou "4 séries" sem repetições prescritas. */
export function exerciseSetsText(e: Pick<OfferExercise, 'targetSets' | 'targetReps'>): string {
  const reps = e.targetReps.trim().replace(/(\d)\s*-\s*(\d)/, '$1–$2');
  return reps ? `${e.targetSets} × ${reps}` : `${e.targetSets} séries`;
}

const FIELD_LABEL: Record<FieldChange['field'], string> = {
  sets: 'séries',
  reps: 'repetições',
  rest: 'descanso',
};

/** "séries 4 → 5 · descanso 60 s → padrão", ou nulo sem mudança. */
export function exerciseChangeText(changes: FieldChange[]): string | null {
  if (changes.length === 0) return null;
  const value = (field: FieldChange['field'], v: string | null) => {
    if (v === null || v === '') return 'padrão';
    return field === 'rest' ? `${v} s` : v;
  };
  return changes
    .map((c) => `${FIELD_LABEL[c.field]} ${value(c.field, c.before)} → ${value(c.field, c.after)}`)
    .join(' · ');
}

/** "1 novo · 1 alterado · 2 removidos" no aviso da atualização. */
export function diffSummary(d: PlanDiff): string {
  const parts: string[] = [];
  if (d.added.length) parts.push(`${d.added.length} ${d.added.length === 1 ? 'novo' : 'novos'}`);
  if (d.changed.length) {
    parts.push(`${d.changed.length} ${d.changed.length === 1 ? 'alterado' : 'alterados'}`);
  }
  if (d.removed.length) {
    parts.push(`${d.removed.length} ${d.removed.length === 1 ? 'removido' : 'removidos'}`);
  }
  return parts.length ? parts.join(' · ') : 'Sem mudança nos exercícios';
}

/**
 * O cartão depois da resposta. "Avisamos Helena" em vez de "Helena foi
 * avisada": a tela não sabe o gênero de quem enviou.
 */
export function offerAnswerCopy(
  answer: 'accepted' | 'declined',
  authorName: string | null,
  kind: 'new' | 'update',
): { title: string; body: string } {
  const who = firstName(authorName);
  const told = who ? `Avisamos ${who}.` : 'Avisamos a equipe.';
  if (answer === 'accepted') {
    return kind === 'update'
      ? { title: 'Troca aceita', body: `${told} O plano já está atualizado.` }
      : { title: 'Plano aceito', body: `${told} Ele entrou nos seus planos.` };
  }
  return kind === 'update'
    ? { title: 'Você manteve a versão atual', body: told }
    : { title: 'Recusado', body: told };
}

export type OfferStage = 'answer' | 'accepted' | 'declined' | 'superseded';

/** Em que pé está a resposta, pela versão que a tela mostra. */
export function offerStage(offer: Pick<PlanOffer, 'shown'>): OfferStage {
  switch (offer.shown.status) {
    case 'ACCEPTED':
      return 'accepted';
    case 'DECLINED':
      return 'declined';
    case 'SUPERSEDED':
      return 'superseded';
    default:
      return 'answer';
  }
}

/**
 * Os botões presos embaixo da tela (prancha Al-T2): "Recusar" + "Aceitar
 * plano" enquanto espera; aceito, só "Começar agora"; recusado, "Voltar".
 * Aceitar e recusar não perguntam antes: recusar mostra "Desfazer".
 */
export function offerActions(offer: Pick<PlanOffer, 'shown' | 'kind' | 'planId'>): {
  primary: string;
  secondary: string | null;
} {
  const stage = offerStage(offer);
  if (stage === 'answer') {
    return offer.kind === 'update'
      ? { primary: 'Aceitar troca', secondary: 'Manter a atual' }
      : { primary: 'Aceitar plano', secondary: 'Recusar' };
  }
  if (stage === 'accepted' && offer.planId) return { primary: 'Começar agora', secondary: null };
  return { primary: 'Voltar', secondary: null };
}

/** O aviso no início do Treino (Al-T1): "Helena enviou um plano" / "Inferior · toque para ver e aceitar". */
export function receivedOfferBanner(
  o: Pick<PlanOfferSummary, 'authorName' | 'kind' | 'title' | 'version'>,
): {
  title: string;
  sub: string;
} {
  const who = firstName(o.authorName) ?? 'Sua equipe';
  return o.kind === 'update'
    ? { title: `${who} atualizou um plano`, sub: `${offerTitle(o)} · toque para ver o que mudou` }
    : { title: `${who} enviou um plano`, sub: `${offerTitle(o)} · toque para ver e aceitar` };
}

// ---------------------------------------------------------------------------
// Agenda

/** A semana (segunda a domingo) que contém o dia. */
export function agendaWeek(day: string): { from: string; to: string } {
  const from = addDays(day, 1 - isoWeekday(day));
  return { from, to: addDays(from, 6) };
}

/** "10 – 16 nov", ou "29 dez – 04 jan" quando atravessa o mês. */
export function agendaRangeLabel(from: string, to: string): string {
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8, 10))} – ${dayMonth(to)}`;
  return `${dayMonth(from)} – ${dayMonth(to)}`;
}

export function agendaDayLabel(day: string): { weekday: string; day: number; long: string } {
  const weekday = WEEKDAYS[isoWeekday(day) - 1]!;
  return { weekday, day: Number(day.slice(8, 10)), long: `${weekday}, ${dayMonth(day)}` };
}

/** O rótulo à direita do intervalo (Al-T24, T24b, T24c). */
export function agendaPlanLabel(a: {
  calendarPlan: { planName: string; weekNumber: number; weeksTotal: number } | null;
  ended: { planName: string } | null;
  empty: boolean;
}): string {
  if (a.calendarPlan) {
    return `${a.calendarPlan.planName} · semana ${a.calendarPlan.weekNumber} de ${a.calendarPlan.weeksTotal}`;
  }
  if (a.ended) return 'plano terminou';
  return a.empty ? 'sem plano com datas' : '';
}

/** Título, linha de estado e ações de uma sessão da agenda. */
export function agendaItemCopy(item: AgendaItem): {
  title: string;
  subtitle: string;
  tone: AgendaState;
  open: boolean;
  reschedule: boolean;
} {
  const moved = item.rescheduledFrom ? ` · remarcado de ${dayMonth(item.rescheduledFrom)}` : '';
  if (item.kind === 'next') {
    return {
      title: item.planName,
      subtitle: item.state === 'done' ? 'feito hoje' : 'próxima sessão · no seu ritmo',
      tone: item.state,
      open: item.state !== 'done',
      reschedule: false,
    };
  }
  const subtitle = {
    done: 'feito',
    missed: 'não feito',
    today: item.order ? `hoje · sessão ${item.order}` : 'hoje',
    planned: 'planejado',
  }[item.state];
  return {
    title: item.planName,
    subtitle: `${subtitle}${moved}`,
    tone: item.state,
    open: item.state === 'today',
    // A prancha oferece "Remarcar" no que passou; a API diz se ainda cabe no plano.
    reschedule: item.state === 'missed' && item.canReschedule,
  };
}

/** Os dias em que dá para remarcar: de hoje ao fim do plano (decisão do dono, #379). */
export function rescheduleDays(today: string, endDate: string): string[] {
  const days: string[] = [];
  for (let d = today; d <= endDate; d = addDays(d, 1)) days.push(d);
  return days;
}

/** A grade do mês: semanas inteiras, de segunda a domingo. */
export function monthGrid(day: string): { from: string; to: string; label: string } {
  const first = `${day.slice(0, 8)}01`;
  const [y, m] = [Number(day.slice(0, 4)), Number(day.slice(5, 7))];
  const last = fromUtc(Date.UTC(y, m, 0));
  return {
    from: agendaWeek(first).from,
    to: agendaWeek(last).to,
    label: `${MONTHS_LONG[m - 1]} de ${y}`,
  };
}

/** Al-T24c: o plano de calendário que terminou. */
export function endedText(e: AgendaEnded): {
  title: string;
  body: string;
  action: { label: string; href: string };
} {
  const who = firstName(e.authorName);
  const next = who ? `${who} pode mandar o próximo plano.` : 'Sua equipe pode mandar o próximo.';
  return {
    title: `${e.planName} terminou`,
    body: `${e.done} de ${e.total} sessões em ${e.weeks} ${e.weeks === 1 ? 'semana' : 'semanas'}. ${next}`,
    // A prancha T24c diz "Ver o resumo do bloco", mas essa tela não existe:
    // web e app levam ao histórico de treinos.
    action: { label: 'Ver o histórico', href: '/workout/history' },
  };
}

// ---------------------------------------------------------------------------
// Bloco de semanas (Al-T12)

const pct = (f: number) => `${Math.round(f * 100)}%`;

/** As linhas e as barras do gráfico, proporcionais ao maior fator do bloco. */
export function blockWeekRows(
  weeks: Array<
    Pick<
      BlockPreviewWeek,
      'weekNumber' | 'label' | 'intensityFactor' | 'volumeFactor' | 'sessionsTarget'
    >
  >,
) {
  const maxI = Math.max(...weeks.map((w) => w.intensityFactor), 1);
  const maxV = Math.max(...weeks.map((w) => w.volumeFactor), 1);
  return weeks.map((w) => ({
    n: w.weekNumber,
    label: w.label,
    intensity: pct(w.intensityFactor),
    volume: pct(w.volumeFactor),
    sessions: `${w.sessionsTarget} ${w.sessionsTarget === 1 ? 'sessão' : 'sessões'}`,
    deload: w.label === 'Deload',
    intensityBar: w.intensityFactor / maxI,
    volumeBar: w.volumeFactor / maxV,
  }));
}

export const BLOCK_WEEK_OPTIONS = [3, 4, 5, 6] as const;

// ---------------------------------------------------------------------------
// Modelos (Al-T23)

export function templatesSubtitle(
  t: Pick<WorkoutTemplateItem, 'level' | 'authorName' | 'exerciseCount' | 'setCount'>,
): { level: string | null; rest: string } {
  const ex = `${t.exerciseCount} ${t.exerciseCount === 1 ? 'exercício' : 'exercícios'}`;
  return {
    level: t.level ? PLAN_LEVEL_LABEL[t.level] : null,
    rest: `${ex} · ${t.setCount} séries · por ${t.authorName}`,
  };
}
