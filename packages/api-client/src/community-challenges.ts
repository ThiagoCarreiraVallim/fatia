import { apiFetch } from './http';

/**
 * Desafios da comunidade (Fase 8a, ADR 027): a equipe marca, o membro entra com
 * um apelido e vê o ranking — só quem entrou vê. Os de nutrição contam dias em
 * que cada pessoa bateu a PRÓPRIA meta, nunca quanto comeu. Aqui ficam os
 * tipos, os limites e os textos, iguais na web e no app.
 */

/** Limites iguais aos da API (`challenge.service.ts`). */
export const CHALLENGE_TITLE_MIN = 3;
export const CHALLENGE_TITLE_MAX = 80;
export const CHALLENGE_DESCRIPTION_MAX = 1000;
export const CHALLENGE_MAX_DAYS = 90;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;

export const CHALLENGE_METRICS = [
  'ACTIVE_DAYS',
  'WORKOUT_SESSIONS',
  'STEPS',
  'WATER_ML',
  'STREAK_DAYS',
  'KCAL_IN_RANGE_DAYS',
  'PROTEIN_TARGET_DAYS',
] as const;
export type ChallengeMetric = (typeof CHALLENGE_METRICS)[number];
export type ChallengeStatus = 'upcoming' | 'running' | 'ended';
export type Medal = 'gold' | 'silver' | 'bronze';

/**
 * Tipos do redesign (#395, ADR 044 e 047). `METRIC` é o desafio de antes
 * (treinos, dias ativos, sequência). Os outros contam dias, ou pontos por dia.
 */
export const CHALLENGE_KINDS = [
  'PHOTO',
  'METRIC',
  'WATER',
  'STEPS',
  'NUTRITION',
  'POINTS',
] as const;
export type ChallengeKind = (typeof CHALLENGE_KINDS)[number];

export const POINT_ITEMS = ['workout', 'water', 'steps', 'protein', 'kcal'] as const;
export type PointItem = (typeof POINT_ITEMS)[number];
export type PointsTable = Partial<Record<PointItem, number>>;
export const POINT_VALUE_MAX = 5;

/**
 * Passos só contam vindos do Apple Saúde, do Health Connect ou de relógio, e o
 * app ainda não sincroniza nenhum (ADR 047 §7): até a sync de saúde chegar, não
 * se cria desafio de passos nem item de passos nos pontos. Os que já existem
 * seguem aparecendo e se editam sem perder os passos. A API confere o mesmo.
 */
export const STEPS_SYNC_AVAILABLE = false;
export const STEPS_CLOSED_TEXT =
  'Desafio de passos volta quando o app sincronizar com o Apple Saúde ou o Health Connect.';
/** Os tipos que a equipe pode escolher num desafio novo. */
export const CREATABLE_CHALLENGE_KINDS: readonly ChallengeKind[] = CHALLENGE_KINDS.filter(
  (k) => STEPS_SYNC_AVAILABLE || k !== 'STEPS',
);
/** Os itens que a tabela de pontos de um desafio novo oferece. */
export const CREATABLE_POINT_ITEMS: readonly PointItem[] = POINT_ITEMS.filter(
  (i) => STEPS_SYNC_AVAILABLE || i !== 'steps',
);

/** Se o desafio conta passos: o tipo de passos, o de antes ou o item nos pontos. */
export function challengeUsesSteps(c: Pick<Challenge, 'kind' | 'metric' | 'rules'>): boolean {
  if (c.kind === 'STEPS' || c.metric === 'STEPS') return true;
  return c.kind === 'POINTS' && (c.rules.pointsTable?.steps ?? 0) > 0;
}

function inputUsesSteps(input: ChallengeInput): boolean {
  const kind = input.kind ?? 'METRIC';
  if (kind === 'STEPS' || input.metric === 'STEPS') return true;
  return kind === 'POINTS' && (input.pointsTable?.steps ?? 0) > 0;
}

/** As fontes de passos do banco. `MANUAL` nunca conta em desafio. */
export const STEP_SOURCES = [
  'APPLE_HEALTH',
  'HEALTH_CONNECT',
  'GARMIN',
  'FITBIT',
  'STRAVA',
  'GOOGLE_FIT',
  'WEBHOOK',
  'MANUAL',
] as const;
export type StepSource = (typeof STEP_SOURCES)[number];
export const STEP_SOURCE_LABEL: Record<StepSource, string> = {
  APPLE_HEALTH: 'Apple Saúde',
  HEALTH_CONNECT: 'Health Connect',
  GARMIN: 'Garmin',
  FITBIT: 'Fitbit',
  STRAVA: 'Strava',
  GOOGLE_FIT: 'Google Fit',
  WEBHOOK: 'Integração',
  MANUAL: 'Digitado à mão',
};

/** Métricas que o tipo `METRIC` ainda cria (Pn-13: treinos, dias ativos, sequência). */
export const METRIC_KIND_METRICS = ['WORKOUT_SESSIONS', 'ACTIVE_DAYS', 'STREAK_DAYS'] as const;
export const NUTRITION_METRICS = ['PROTEIN_TARGET_DAYS', 'KCAL_IN_RANGE_DAYS'] as const;

export interface ChallengeRules {
  waterGoalMl: number | null;
  stepsGoal: number | null;
  dailyCap: number | null;
  allowedStepSources: StepSource[];
  pointsTable: PointsTable | null;
  maxPointsPerDay: number | null;
  checkin: { minWorkoutMinutes: number; windowHours: number } | null;
}

export interface MyParticipation {
  displayName: string;
  score: number;
  rank: number | null;
  medal: Medal | null;
  /** Dias seguidos com ponto. */
  streak: number;
  /** Itens meus esperando a equipe. */
  pendingReview: number;
}

export interface Challenge {
  id: string;
  title: string;
  description: string | null;
  kind: ChallengeKind;
  metric: ChallengeMetric;
  /** YYYY-MM-DD no fuso da comunidade, inclusivos. */
  startDate: string;
  endDate: string;
  totalDays: number;
  status: ChallengeStatus;
  endedEarly: boolean;
  /** Encerrado, mas o pódio espera a fila de revisão (até 24 h). */
  resultPending: boolean;
  participants: number;
  rules: ChallengeRules;
  /** Entrar pede o aceite da foto de check-in (ADR 047). */
  needsPhotoConsent: boolean;
  /** Pediu "Me avise quando começar". */
  watching: boolean;
  canManage: boolean;
  /** Pode abrir a fila "Para revisar". */
  canReview: boolean;
  me: MyParticipation | null;
}

export interface LeaderboardEntry {
  displayName: string;
  score: number;
  rank: number;
  isMe: boolean;
  medal: Medal | null;
  streak: number;
}

export interface ChallengeList {
  /** Hoje no fuso da comunidade: o primeiro dia que um desafio novo pode ter. */
  today: string;
  challenges: Challenge[];
}

export interface TodayItem {
  item: PointItem;
  points: number;
  done: boolean;
  /** O valor de hoje da própria pessoa (ml, passos). */
  value: number | null;
  goal: number | null;
}

export interface ChallengeToday {
  date: string;
  points: number;
  maxPoints: number | null;
  items: TodayItem[];
  checkedInAt: string | null;
}

/** Uma linha da atividade. Foto e motivo só na linha da própria pessoa (ADR 044). */
export interface ActivityItem {
  id: string;
  type: 'checkin' | 'day';
  displayName: string;
  isMe: boolean;
  date: string;
  at: string | null;
  points: number;
  parts: PointItem[];
  status: 'valid' | 'review' | 'voided';
  reason: string | null;
  photoUrl: string | null;
  canFlag: boolean;
  flaggedByMe: boolean;
}

export interface ChallengeDetail extends Challenge {
  /** Quem é da comunidade vê; `null` só nos de antes que somavam ml ou passos. */
  leaderboard: LeaderboardEntry[] | null;
  suggestedDisplayName: string;
  /** Seus pontos de hoje (só quem participa, em andamento). */
  today: ChallengeToday | null;
  activity: ActivityItem[];
}

export interface ChallengeInput {
  title: string;
  description?: string | null;
  /** Ausente = `METRIC`. */
  kind?: ChallengeKind;
  /** `METRIC`: treinos, dias ativos ou sequência; `NUTRITION`: proteína ou kcal. */
  metric?: ChallengeMetric;
  startDate: string;
  endDate: string;
  pointsTable?: PointsTable;
  maxPointsPerDay?: number;
  waterGoalMl?: number;
  stepsGoal?: number;
  dailyCap?: number;
  allowedStepSources?: StepSource[];
  /** "Avisar todos por push" (#372). Ausente = avisa. Só na criação. */
  notify?: boolean;
}

export type CheckinBlock =
  | 'not_participant'
  | 'not_running'
  | 'no_photo_checkin'
  | 'no_workout'
  | 'too_short'
  | 'late_logged'
  | 'already_today'
  /** O treino já liberou um check-in neste desafio (#395). */
  | 'workout_used';

export interface CheckinWorkout {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  sets: number;
  deadline: string;
}

export interface CheckinEligibility {
  eligible: boolean;
  reason: CheckinBlock | null;
  workout: CheckinWorkout | null;
  checkedInAt: string | null;
  rules: { minWorkoutMinutes: number; windowHours: number };
}

export interface CheckinReviewItem {
  id: string;
  challengeId: string;
  challengeTitle: string;
  challengeKind: ChallengeKind;
  type: 'photo' | 'water' | 'steps';
  displayName: string;
  date: string;
  capturedAt: string | null;
  source: 'system' | 'member';
  why: string | null;
  flags: number;
  /** A foto de prova: só a equipe que revisa vê (ADR 044). */
  photoUrl: string | null;
  caption: string | null;
  workoutLinked: boolean;
  points: number;
}

export interface ReviewQueue {
  items: CheckinReviewItem[];
  /** Quantos esperam ao todo, em todas as páginas. */
  open: number;
  /** O teto de sinalizações de membros abertas por desafio. */
  limit: number;
  /** A próxima página (#395); nulo quando acabou. */
  nextCursor: string | null;
}

/** Frases da prancha Cm-18 para cada motivo de não liberar o check-in. */
export const CHECKIN_BLOCK_TEXT: Record<CheckinBlock, string> = {
  not_participant: 'Entre no desafio para fazer check-in.',
  not_running: 'O check-in vale só enquanto o desafio está em andamento.',
  no_photo_checkin: 'Este desafio não tem check-in com foto.',
  no_workout: 'O check-in fica liberado até 2 h depois de terminar um treino registrado.',
  too_short: 'O desafio pede pelo menos 20 min de treino. Este não conta.',
  late_logged: 'Treino lançado depois de feito não conta para o check-in.',
  already_today: 'Um check-in por dia. Volte amanhã depois do treino.',
  workout_used: 'Este treino já valeu um check-in neste desafio. Faça o próximo treino.',
};

/** O selo curto do treino na câmera (Cm-18): "conta", "curto demais"… */
export const CHECKIN_BLOCK_TAG: Record<CheckinBlock, string> = {
  not_participant: 'fora do desafio',
  not_running: 'fora do prazo',
  no_photo_checkin: 'sem check-in',
  no_workout: 'sem treino',
  too_short: 'curto demais',
  late_logged: 'lançado depois',
  already_today: 'já contou hoje',
  workout_used: 'já valeu',
};

/** Versão do texto de aceite mostrado na entrada (a API grava a dela). */
export const PHOTO_CONSENT_TEXT =
  'Este desafio tem check-in com foto. A foto é prova: só você e a equipe que revisa veem, ' +
  'nunca os outros participantes. Foto de corpo é anulada. Ela é apagada 30 dias depois do fim, ' +
  'ou na hora se você sair do desafio ou da comunidade.';

export const REVIEW_REASON_MIN = 3;
export const REVIEW_REASON_MAX = 280;
export const CHECKIN_CAPTION_MAX = 140;

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const base = (groupId: string) => `/api/groups/${groupId}/challenges`;

export const challengesApi = {
  list: (groupId: string) => apiFetch<ChallengeList>(base(groupId)),
  get: (groupId: string, id: string) => apiFetch<ChallengeDetail>(`${base(groupId)}/${id}`),
  join: (
    groupId: string,
    id: string,
    displayName?: string,
    opts: { acceptPhotoTerms?: boolean } = {},
  ) =>
    apiFetch<ChallengeDetail>(
      `${base(groupId)}/${id}/join`,
      json('POST', {
        ...(displayName ? { displayName } : {}),
        ...(opts.acceptPhotoTerms ? { acceptPhotoTerms: true } : {}),
      }),
    ),
  leave: (groupId: string, id: string) =>
    apiFetch<{ left: boolean }>(`${base(groupId)}/${id}/join`, json('DELETE')),
  watch: (groupId: string, id: string, on: boolean) =>
    apiFetch<{ watching: boolean }>(`${base(groupId)}/${id}/watch`, json('POST', { on })),
  create: (groupId: string, input: ChallengeInput) =>
    apiFetch<ChallengeDetail>(base(groupId), json('POST', input)),
  update: (groupId: string, id: string, input: ChallengeInput) =>
    apiFetch<ChallengeDetail>(`${base(groupId)}/${id}`, json('PATCH', input)),
  end: (groupId: string, id: string) =>
    apiFetch<ChallengeDetail>(`${base(groupId)}/${id}/end`, json('POST')),
  remove: (groupId: string, id: string) =>
    apiFetch<{ deleted: boolean }>(`${base(groupId)}/${id}`, json('DELETE')),
  /** O que a câmera mostra antes da foto (Cm-18). */
  eligibility: (groupId: string, id: string) =>
    apiFetch<CheckinEligibility>(`${base(groupId)}/${id}/checkins/eligibility`),
  /** A foto vem de `POST /media/uploads` com `purpose: 'challenge_checkin'`. */
  checkin: (
    groupId: string,
    id: string,
    input: { photoFileId: string; workoutSessionId?: string; caption?: string },
  ) => apiFetch<ChallengeDetail>(`${base(groupId)}/${id}/checkins`, json('POST', input)),
  flag: (groupId: string, id: string, checkinId: string) =>
    apiFetch<{ flagged: boolean }>(
      `${base(groupId)}/${id}/checkins/${checkinId}/flag`,
      json('POST'),
    ),
  reviewQueue: (groupId: string, challengeId?: string, cursor?: string) => {
    const q = new URLSearchParams();
    if (challengeId) q.set('challengeId', challengeId);
    if (cursor) q.set('cursor', cursor);
    const query = q.toString();
    return apiFetch<ReviewQueue>(`${base(groupId)}/review${query ? `?${query}` : ''}`);
  },
  resolve: (
    groupId: string,
    id: string,
    checkinId: string,
    input: { decision: 'valid' | 'void'; reason?: string },
  ) =>
    apiFetch<{ id: string; status: 'valid' | 'voided' }>(
      `${base(groupId)}/${id}/review/${checkinId}/resolve`,
      json('POST', input),
    ),
};

interface KindInfo {
  label: string;
  /** O que conta, numa frase (Pn-13 e Cm-08). */
  explain: string;
  /** Nome do ícone do DS (camera, drop, steps, apple, trophy, flame). */
  icon: 'camera' | 'drop' | 'steps' | 'apple' | 'trophy' | 'flame';
}

export const KIND_INFO: Record<ChallengeKind, KindInfo> = {
  PHOTO: {
    label: 'Check-in com foto',
    explain: 'Foto na hora, pelo app, depois de um treino registrado de 20 min ou mais.',
    icon: 'camera',
  },
  METRIC: {
    label: 'Treinos, dias ativos ou sequência',
    explain: 'Sessões concluídas, dias com treino, passos ou água, ou dias seguidos com registro.',
    icon: 'flame',
  },
  WATER: {
    label: 'Água',
    explain: 'Dias em que a pessoa chega à meta de água. Os outros veem só os dias, nunca os ml.',
    icon: 'drop',
  },
  STEPS: {
    label: 'Passos',
    explain: 'Dias com a meta de passos, do celular ou relógio. Passos à mão não contam.',
    icon: 'steps',
  },
  NUTRITION: {
    label: 'Nutrição',
    explain:
      'Dias na proteína ou na faixa de calorias da própria meta. Ninguém vê o que o outro comeu.',
    icon: 'apple',
  },
  POINTS: {
    label: 'Pontos (misto)',
    explain: 'Treino, água, passos e nutrição valem pontos, com máximo por dia.',
    icon: 'trophy',
  },
};

export const POINT_ITEM_INFO: Record<PointItem, { label: string; explain: string }> = {
  workout: { label: 'Treino com check-in', explain: 'foto na hora, treino de 20 min ou mais' },
  water: { label: 'Água na meta', explain: 'até o teto do dia' },
  steps: { label: 'Passos na meta', explain: 'do celular ou relógio' },
  protein: { label: 'Proteína na meta', explain: 'a meta de cada pessoa' },
  kcal: { label: 'Dia na faixa de calorias', explain: 'dentro da faixa, nunca abaixo' },
};

const AUTO_ITEM_NAME: Partial<Record<PointItem, string>> = {
  water: 'água',
  steps: 'passos',
  protein: 'proteína',
  kcal: 'calorias',
};

/**
 * A nota de "Seus pontos de hoje": o máximo do dia e os itens que entram
 * sozinhos, só os que a tabela tem (o treino precisa do check-in).
 */
export function pointsDayNote(table: PointsTable, maxPoints: number): string {
  const auto = POINT_ITEMS.filter((i) => (table[i] ?? 0) > 0 && AUTO_ITEM_NAME[i]).map(
    (i) => AUTO_ITEM_NAME[i]!,
  );
  const max = `Máximo de ${maxPoints} pontos por dia.`;
  if (auto.length === 0) return max;
  const lista = auto.length === 1 ? auto[0] : `${auto.slice(0, -1).join(', ')} e ${auto.at(-1)}`;
  return `${max} Os pontos de ${lista} entram sozinhos.`;
}

/** Soma da tabela: o máximo que um dia completo daria. */
export function maxPointsOf(table: PointsTable): number {
  return POINT_ITEMS.reduce((s, i) => s + (table[i] ?? 0), 0);
}

/** "8 dias", "86 pts"; o tipo de antes usa a unidade da métrica. */
export function challengeScoreLabel(c: Pick<Challenge, 'kind' | 'metric'>, score: number): string {
  if (c.kind === 'METRIC') return scoreLabel(c.metric, score);
  if (c.kind === 'POINTS') return `${score.toLocaleString('pt-BR')} pts`;
  return `${score.toLocaleString('pt-BR')} ${score === 1 ? 'dia' : 'dias'}`;
}

/** As seções da lista (Cm-08). */
export function challengeSections<C extends Pick<Challenge, 'status' | 'me'>>(list: C[]) {
  return {
    mine: list.filter((c) => c.status !== 'ended' && c.me),
    browse: list.filter((c) => c.status === 'running' && !c.me),
    upcoming: list.filter((c) => c.status === 'upcoming' && !c.me),
    ended: list.filter((c) => c.status === 'ended'),
  };
}

/** O que impede as regras do tipo, ou `null`. Mesmas regras da API. */
export function challengeKindProblem(
  input: ChallengeInput,
  opts: ChallengeProblemOptions = {},
): string | null {
  const kind = input.kind ?? 'METRIC';
  if (
    kind === 'METRIC' &&
    !(METRIC_KIND_METRICS as readonly string[]).includes(input.metric ?? '')
  ) {
    return 'Escolha treinos, dias ativos ou sequência.';
  }
  if (
    kind === 'NUTRITION' &&
    input.metric &&
    !(NUTRITION_METRICS as readonly string[]).includes(input.metric)
  ) {
    return 'Nutrição conta dias na proteína ou na faixa de calorias.';
  }
  if (kind === 'POINTS' && maxPointsOf(input.pointsTable ?? {}) === 0) {
    return 'A tabela de pontos precisa de pelo menos um item.';
  }
  if ((input.allowedStepSources ?? []).includes('MANUAL')) {
    return 'Passos digitados à mão nunca contam em desafio.';
  }
  if (
    input.waterGoalMl !== undefined &&
    input.dailyCap !== undefined &&
    input.dailyCap < input.waterGoalMl
  ) {
    return 'O teto do dia não pode ser menor que a meta de água.';
  }
  if (!STEPS_SYNC_AVAILABLE && !opts.keepsSteps && inputUsesSteps(input)) {
    return STEPS_CLOSED_TEXT;
  }
  return null;
}

interface MetricInfo {
  label: string;
  /** Uma frase para a escolha da equipe e para a tela de entrada. */
  explain: string;
  /** Unidade da pontuação, no singular e no plural. */
  unit: [string, string];
  /** Conta dias contra a meta da própria pessoa (ADR 027). */
  usesOwnGoal: boolean;
}

export const METRIC_INFO: Record<ChallengeMetric, MetricInfo> = {
  ACTIVE_DAYS: {
    label: 'Dias ativos',
    explain: 'Conta os dias com treino concluído, passos ou água registrados.',
    unit: ['dia', 'dias'],
    usesOwnGoal: false,
  },
  WORKOUT_SESSIONS: {
    label: 'Treinos concluídos',
    explain: 'Conta as sessões de treino concluídas durante o desafio.',
    unit: ['treino', 'treinos'],
    usesOwnGoal: false,
  },
  STEPS: {
    label: 'Passos',
    explain: 'Soma os passos de cada dia do desafio.',
    unit: ['passo', 'passos'],
    usesOwnGoal: false,
  },
  WATER_ML: {
    label: 'Água',
    explain: 'Soma a água registrada durante o desafio.',
    unit: ['ml', 'ml'],
    usesOwnGoal: false,
  },
  STREAK_DAYS: {
    label: 'Sequência de registros',
    explain:
      'A maior sequência de dias seguidos com algum registro: refeição, treino, passos ou água.',
    unit: ['dia seguido', 'dias seguidos'],
    usesOwnGoal: false,
  },
  KCAL_IN_RANGE_DAYS: {
    label: 'Calorias na meta',
    explain:
      'Conta os dias em que cada pessoa ficou dentro da própria faixa de calorias. Ninguém vê quanto o outro comeu.',
    unit: ['dia na meta', 'dias na meta'],
    usesOwnGoal: true,
  },
  PROTEIN_TARGET_DAYS: {
    label: 'Proteína na meta',
    explain:
      'Conta os dias em que cada pessoa chegou ao próprio mínimo de proteína. Ninguém vê quanto o outro comeu.',
    unit: ['dia na meta', 'dias na meta'],
    usesOwnGoal: true,
  },
};

/** "1.234 passos", "1 dia na meta". */
export function scoreLabel(metric: ChallengeMetric, score: number): string {
  const [um, varios] = METRIC_INFO[metric].unit;
  return `${score.toLocaleString('pt-BR')} ${score === 1 ? um : varios}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function curta(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

/** "12 out a 18 out", ou "12 out" quando é um dia só. */
export function challengePeriod(c: Pick<Challenge, 'startDate' | 'endDate'>): string {
  return c.startDate === c.endDate
    ? curta(c.startDate)
    : `${curta(c.startDate)} a ${curta(c.endDate)}`;
}

/** O selo de estado: "Em andamento", "Começa 12 out", "Encerrado". */
export function challengeStatusLabel(c: Pick<Challenge, 'status' | 'startDate'>): string {
  if (c.status === 'running') return 'Em andamento';
  if (c.status === 'upcoming') return `Começa ${curta(c.startDate)}`;
  return 'Encerrado';
}

export const MEDAL_LABEL: Record<Medal, string> = {
  gold: 'Ouro',
  silver: 'Prata',
  bronze: 'Bronze',
};

/** "1º lugar", "2º lugar"; sem posição, nada. */
export function rankLabel(rank: number | null): string | null {
  return rank === null ? null : `${rank}º lugar`;
}

/** "3 participantes". */
export function participantsLabel(n: number): string {
  return n === 1 ? '1 participante' : `${n} participantes`;
}

/** `2026-10-18` + 3 → `2026-10-21`, sem fuso no meio. */
export function addDaysToIso(ymd: string, days: number): string {
  const [a, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + days)).toISOString().slice(0, 10);
}

function diasEntre(inicio: string, fim: string): number {
  const ms = Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export interface ChallengeProblemOptions {
  /** Editando um desafio que já contava passos: segue podendo contar. */
  keepsSteps?: boolean;
}

/** O que impede marcar o desafio, ou `null`. Mesmas regras da API. */
export function challengeProblem(
  input: ChallengeInput,
  today: string,
  opts: ChallengeProblemOptions = {},
): string | null {
  const titulo = input.title.trim();
  if (titulo.length < CHALLENGE_TITLE_MIN) return 'Dê um título ao desafio.';
  if (titulo.length > CHALLENGE_TITLE_MAX)
    return `O título tem até ${CHALLENGE_TITLE_MAX} caracteres.`;
  if ((input.description ?? '').trim().length > CHALLENGE_DESCRIPTION_MAX) {
    return `A descrição tem até ${CHALLENGE_DESCRIPTION_MAX} caracteres.`;
  }
  if (!input.startDate || !input.endDate) return 'Escolha o início e o fim.';
  if (input.startDate < today) return 'O desafio não pode começar no passado.';
  if (input.endDate < input.startDate) return 'O fim tem de ser no dia do início ou depois.';
  if (diasEntre(input.startDate, input.endDate) > CHALLENGE_MAX_DAYS) {
    return `Um desafio dura no máximo ${CHALLENGE_MAX_DAYS} dias.`;
  }
  return challengeKindProblem(input, opts);
}

/** O que impede entrar com este apelido, ou `null`. */
export function displayNameProblem(name: string): string | null {
  const nome = name.trim();
  if (nome.length < DISPLAY_NAME_MIN) return 'Escolha um apelido.';
  if (nome.length > DISPLAY_NAME_MAX) return `O apelido tem até ${DISPLAY_NAME_MAX} caracteres.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(nome))
    return 'O apelido não pode ter quebra de linha nem < ou >.';
  return null;
}
