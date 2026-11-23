import { GroupType } from '@fatia/db';

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
 * Chamadas por mês, pelo plano da comunidade (decisão da #413: contar
 * chamadas, teto por plano). A academia (patrocinada) tem o da prancha; a
 * comunidade social, que não paga, um teto menor.
 */
export const API_MONTHLY_QUOTA: Record<GroupType, number> = {
  [GroupType.SPONSORED]: 10_000,
  [GroupType.SOCIAL]: 2_000,
};

export type QuotaState = 'ok' | 'near' | 'limit';

export function generateApiKey(): string {
  throw new Error('a fazer');
}

export function hashApiKey(raw: string): string {
  void raw;
  throw new Error('a fazer');
}

export function looksLikeApiKey(raw: string): boolean {
  void raw;
  throw new Error('a fazer');
}

export function usageMonth(at: Date, timezone: string): string {
  void at;
  void timezone;
  throw new Error('a fazer');
}

export function quotaRenewsOn(month: string): string {
  void month;
  throw new Error('a fazer');
}

export function quotaState(used: number, limit: number): QuotaState {
  void used;
  void limit;
  throw new Error('a fazer');
}
