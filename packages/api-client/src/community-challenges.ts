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

export interface MyParticipation {
  displayName: string;
  score: number;
  rank: number | null;
  medal: Medal | null;
}

export interface Challenge {
  id: string;
  title: string;
  description: string | null;
  metric: ChallengeMetric;
  /** YYYY-MM-DD no fuso da comunidade, inclusivos. */
  startDate: string;
  endDate: string;
  status: ChallengeStatus;
  endedEarly: boolean;
  participants: number;
  canManage: boolean;
  me: MyParticipation | null;
}

export interface LeaderboardEntry {
  displayName: string;
  score: number;
  rank: number;
  isMe: boolean;
  medal: Medal | null;
}

export interface ChallengeList {
  /** Hoje no fuso da comunidade: o primeiro dia que um desafio novo pode ter. */
  today: string;
  challenges: Challenge[];
}

export interface ChallengeDetail extends Challenge {
  /** `null` para quem não entrou. */
  leaderboard: LeaderboardEntry[] | null;
  suggestedDisplayName: string;
}

export interface ChallengeInput {
  title: string;
  description?: string | null;
  metric: ChallengeMetric;
  startDate: string;
  endDate: string;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const base = (groupId: string) => `/api/groups/${groupId}/challenges`;

export const challengesApi = {
  list: (groupId: string) => apiFetch<ChallengeList>(base(groupId)),
  get: (groupId: string, id: string) => apiFetch<ChallengeDetail>(`${base(groupId)}/${id}`),
  join: (groupId: string, id: string, displayName?: string) =>
    apiFetch<ChallengeDetail>(
      `${base(groupId)}/${id}/join`,
      json('POST', displayName ? { displayName } : {}),
    ),
  leave: (groupId: string, id: string) =>
    apiFetch<{ left: boolean }>(`${base(groupId)}/${id}/join`, json('DELETE')),
  create: (groupId: string, input: ChallengeInput) =>
    apiFetch<ChallengeDetail>(base(groupId), json('POST', input)),
  update: (groupId: string, id: string, input: ChallengeInput) =>
    apiFetch<ChallengeDetail>(`${base(groupId)}/${id}`, json('PATCH', input)),
  end: (groupId: string, id: string) =>
    apiFetch<ChallengeDetail>(`${base(groupId)}/${id}/end`, json('POST')),
  remove: (groupId: string, id: string) =>
    apiFetch<{ deleted: boolean }>(`${base(groupId)}/${id}`, json('DELETE')),
};

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

/** O que impede marcar o desafio, ou `null`. Mesmas regras da API. */
export function challengeProblem(input: ChallengeInput, today: string): string | null {
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
  return null;
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
