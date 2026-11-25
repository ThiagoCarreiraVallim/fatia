import { createHash, randomInt } from 'node:crypto';
import { SubscriptionStatus } from '@fatia/db';
import { dateInTz } from '../progress/helpers/date-tz';

/**
 * Chaves de API da comunidade (#413, Pn-38), sem Prisma nem Nest: o formato do
 * segredo, o hash guardado e a conta da cota do mês.
 */

export const API_KEY_PREFIX = 'fatia_live_';
/** Caracteres aleatórios depois do prefixo (base62, ~190 bits). */
export const API_KEY_RANDOM_LENGTH = 32;
/** Chaves ativas por comunidade. Revogada não conta. */
export const MAX_ACTIVE_KEYS = 10;
/** Teto por chave, além da cota do mês: um laço num Zap não queima a cota em minutos. */
export const KEY_CALLS_PER_MINUTE = 60;
/** "Quase no limite" (Pn-38b) a partir daqui. */
export const NEAR_QUOTA_RATIO = 0.9;

/**
 * Chamadas por mês, por comunidade (decisão da #413: contar chamadas, teto por
 * plano). Quem paga assento tem o da prancha; quem não paga — social, ou
 * patrocinada sem assento valendo — um teto menor. O que decide é o assento
 * pago, não o tipo: o tipo muda num toque e não custa nada.
 */
export const API_MONTHLY_QUOTA_WITH_SEATS = 10_000;
export const API_MONTHLY_QUOTA_FREE = 2_000;

/** Assento pago: cobrança em dia ou atrasada ainda na tolerância. */
const PAID_POOL_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

/** O teto do mês pelo status do pacote de assentos (`null` = sem pacote). */
export function monthlyQuotaFor(poolStatus: SubscriptionStatus | null | undefined): number {
  return poolStatus && PAID_POOL_STATUSES.includes(poolStatus)
    ? API_MONTHLY_QUOTA_WITH_SEATS
    : API_MONTHLY_QUOTA_FREE;
}

export type QuotaState = 'ok' | 'near' | 'limit';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const KEY_SHAPE = new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9]{${API_KEY_RANDOM_LENGTH}}$`);

/** `fatia_live_` + 32 caracteres base62 do gerador criptográfico, sem viés. */
export function generateApiKey(): string {
  let out = '';
  for (let i = 0; i < API_KEY_RANDOM_LENGTH; i++) out += BASE62[randomInt(BASE62.length)];
  return API_KEY_PREFIX + out;
}

/**
 * O que o banco guarda. sha256 basta (sem sal nem custo): o segredo tem ~190
 * bits aleatórios, ninguém o adivinha por dicionário, e a busca é pelo hash.
 */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Filtro barato antes do banco: o que nem tem o formato não vira consulta. */
export function looksLikeApiKey(raw: string): boolean {
  return KEY_SHAPE.test(raw);
}

/** AAAA-MM no fuso da comunidade: a cota vira à meia-noite do dia 1 dela. */
export function usageMonth(at: Date, timezone: string): string {
  return dateInTz(at, timezone).slice(0, 7);
}

/** O primeiro dia do mês seguinte (AAAA-MM-DD). */
export function quotaRenewsOn(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `${next.y}-${String(next.m).padStart(2, '0')}-01`;
}

export function quotaState(used: number, limit: number): QuotaState {
  if (used >= limit) return 'limit';
  return used >= limit * NEAR_QUOTA_RATIO ? 'near' : 'ok';
}
