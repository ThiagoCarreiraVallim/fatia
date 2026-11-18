import type { StepSource } from '@fatia/db';
import { addDaysIso, dayBoundsInTz } from '../progress/helpers/date-tz';
import type { ChallengeMetric } from './challenge-metric';

/**
 * Dias e pontos dos desafios do redesign (#395, ADR 044 e 047).
 *
 * Tudo aqui é função pura. O que entra são os registros **de cada pessoa sobre
 * ela mesma**, e o que sai é um conjunto de **datas**: que dias bateram a meta,
 * e que dias parecem fora do padrão. Nenhuma quantidade (ml, passos, gramas)
 * atravessa para o placar — o placar recebe dias e pontos por dia.
 */

export const CHALLENGE_KINDS = [
  'METRIC',
  'PHOTO',
  'WATER',
  'STEPS',
  'NUTRITION',
  'POINTS',
] as const;
export type ChallengeKindName = (typeof CHALLENGE_KINDS)[number];

/** O que pode valer ponto num dia. Nunca corpo; nutrição só como dia na própria meta. */
export const POINT_ITEMS = ['workout', 'water', 'steps', 'protein', 'kcal'] as const;
export type PointItem = (typeof POINT_ITEMS)[number];
export type PointsTable = Partial<Record<PointItem, number>>;
/** O que valeu num dia: os itens de ponto. */
export type DayPart = PointItem;

export const POINT_VALUE_MAX = 5;
export const DEFAULT_WATER_GOAL_ML = 2500;
export const DEFAULT_STEPS_GOAL = 10_000;
/** Acima disto, a água do dia não soma (prancha Cm-17b: "até 4 L"). */
export const DEFAULT_DAILY_CAP_ML = 4000;
export const DEFAULT_MAX_POINTS_PER_DAY = 6;
/** O registro do dia vale até as 3 h da manhã seguinte (Cm-17b, Cm-17 passos). */
export const LATE_GRACE_MS = 3 * 60 * 60 * 1000;

/** Água: a meta de uma vez, perto da meia-noite, em pelo menos tantos dias. */
const WATER_BURST_SHARE = 0.8;
const WATER_BURST_MIN_DAYS = 3;
/** Passos: salto de tantos passos entre duas leituras com até tantos minutos. */
const STEPS_JUMP = 10_000;
const STEPS_JUMP_WINDOW_MS = 15 * 60 * 1000;

export interface WaterEntry {
  date: string;
  ml: number;
  loggedAt: Date;
}

export interface StepEntry {
  date: string;
  steps: number;
  source: StepSource;
  loggedAt: Date;
}

export interface DayFacts {
  /** Dias que bateram a meta. */
  met: Set<string>;
  /** Dias fora do padrão, com o motivo — sem número de ninguém. */
  suspicious: Map<string, string>;
}

/** Tabela de pontos vinda do banco (JSON): só itens conhecidos, inteiros de 0 a 5. */
export function parsePointsTable(json: unknown): PointsTable {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  const tabela: PointsTable = {};
  for (const item of POINT_ITEMS) {
    const v = (json as Record<string, unknown>)[item];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= POINT_VALUE_MAX) {
      tabela[item] = v;
    }
  }
  return tabela;
}

/**
 * Pontos de um dia. Foto, água, passos e nutrição valem 1 por dia na meta; o
 * tipo pontos soma a tabela e para no teto do dia ("treinar duas vezes não
 * dobra"). `METRIC` não pontua por dia (é o desafio de antes).
 */
export function dayPoints(
  kind: ChallengeKindName,
  parts: ReadonlySet<DayPart>,
  table: PointsTable,
  maxPerDay: number,
  metric: ChallengeMetric,
): number {
  switch (kind) {
    case 'PHOTO':
      return parts.has('workout') ? 1 : 0;
    case 'WATER':
      return parts.has('water') ? 1 : 0;
    case 'STEPS':
      return parts.has('steps') ? 1 : 0;
    case 'NUTRITION':
      return parts.has(metric === 'KCAL_IN_RANGE_DAYS' ? 'kcal' : 'protein') ? 1 : 0;
    case 'POINTS': {
      let soma = 0;
      for (const p of parts) soma += table[p] ?? 0;
      return Math.min(soma, maxPerDay);
    }
    case 'METRIC':
      return 0;
    default: {
      const naoTratado: never = kind;
      throw new Error(`Tipo de desafio sem pontos: ${String(naoTratado)}`);
    }
  }
}

/**
 * Dias seguidos com ponto, contando para trás a partir de hoje (ou de ontem, se
 * hoje ainda não pontuou: "4 dias seguidos · hoje ainda não"). Desafio
 * encerrado conta a partir do último dia.
 */
export function currentStreak(
  days: ReadonlySet<string>,
  first: string,
  last: string,
  today: string,
): number {
  let dia = today < last ? today : last;
  if (!days.has(dia)) dia = addDaysIso(dia, -1);
  let n = 0;
  while (dia >= first && days.has(dia)) {
    n += 1;
    dia = addDaysIso(dia, -1);
  }
  return n;
}

/** O prazo para o registro de um dia entrar: a virada do dia + 3 h, no fuso da pessoa. */
export function dayDeadline(date: string, timezone: string): Date {
  return new Date(dayBoundsInTz(date, timezone).end.getTime() + LATE_GRACE_MS);
}

function localHour(instant: Date, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(instant)
      .find((p) => p.type === 'hour')?.value ?? '0',
  );
}

/**
 * Dias com a água na meta. Água é soma por dia (cada copo é um registro), até o
 * teto do dia; o registro lançado depois do prazo do dia não entra ("lançar
 * dias passados não conta").
 *
 * Fora do padrão: a meta registrada de uma vez, entre 23 h e 3 h, em
 * `WATER_BURST_MIN_DAYS` dias ou mais do desafio (Cm-17b: "os 2,5 L lançados de
 * uma vez, perto da meia-noite, todo dia").
 */
export function waterDays(
  logs: readonly WaterEntry[],
  opts: { goal: number; cap: number; timezone: string },
): DayFacts {
  const porDia = new Map<string, WaterEntry[]>();
  for (const log of logs) {
    if (log.loggedAt > dayDeadline(log.date, opts.timezone)) continue;
    const lista = porDia.get(log.date) ?? [];
    lista.push(log);
    porDia.set(log.date, lista);
  }
  const met = new Set<string>();
  const rajadas: string[] = [];
  for (const [dia, lista] of porDia) {
    const total = Math.min(
      lista.reduce((s, l) => s + l.ml, 0),
      opts.cap,
    );
    if (total < opts.goal) continue;
    met.add(dia);
    const deUmaVez = lista.some((l) => {
      const h = localHour(l.loggedAt, opts.timezone);
      return l.ml >= opts.goal * WATER_BURST_SHARE && (h >= 23 || h < 3);
    });
    if (deUmaVez) rajadas.push(dia);
  }
  const suspicious = new Map<string, string>();
  if (rajadas.length >= WATER_BURST_MIN_DAYS) {
    for (const dia of rajadas) {
      suspicious.set(dia, 'Meta de água registrada de uma vez perto da meia-noite, vários dias');
    }
  }
  return { met, suspicious };
}

/** As fontes que valem: a lista do desafio (vazia = todas), nunca `MANUAL`. */
export function acceptedStepSource(source: StepSource, allowed: readonly StepSource[]): boolean {
  if (source === 'MANUAL') return false;
  return allowed.length === 0 || allowed.includes(source);
}

/**
 * Dias com os passos na meta. O valor do dia é o MAIOR registro (ADR 007), só
 * das fontes aceitas, e só o que chegou até o prazo do dia ("sincroniza até as
 * 3h"). Fora do padrão: um salto de 10 mil passos em até 15 minutos.
 */
export function stepDays(
  logs: readonly StepEntry[],
  opts: { goal: number; allowed: readonly StepSource[]; timezone: string },
): DayFacts {
  const porDia = new Map<string, StepEntry[]>();
  for (const log of logs) {
    if (!acceptedStepSource(log.source, opts.allowed)) continue;
    if (log.loggedAt > dayDeadline(log.date, opts.timezone)) continue;
    const lista = porDia.get(log.date) ?? [];
    lista.push(log);
    porDia.set(log.date, lista);
  }
  const met = new Set<string>();
  const suspicious = new Map<string, string>();
  for (const [dia, lista] of porDia) {
    const maior = Math.max(...lista.map((l) => l.steps));
    if (maior < opts.goal) continue;
    met.add(dia);
    const ordem = [...lista].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
    for (let i = 1; i < ordem.length; i++) {
      const salto = ordem[i]!.steps - ordem[i - 1]!.steps;
      const tempo = ordem[i]!.loggedAt.getTime() - ordem[i - 1]!.loggedAt.getTime();
      if (salto >= STEPS_JUMP && tempo <= STEPS_JUMP_WINDOW_MS) {
        suspicious.set(dia, 'Salto grande de passos em poucos minutos');
        break;
      }
    }
  }
  return { met, suspicious };
}
