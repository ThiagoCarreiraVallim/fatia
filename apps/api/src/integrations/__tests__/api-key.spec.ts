import { GroupType } from '@fatia/db';
import {
  API_KEY_PREFIX,
  API_KEY_RANDOM_LENGTH,
  API_MONTHLY_QUOTA,
  generateApiKey,
  hashApiKey,
  looksLikeApiKey,
  quotaRenewsOn,
  quotaState,
  usageMonth,
} from '../api-key';

describe('chave de API (#413)', () => {
  it('gera fatia_live_ + 32 caracteres base62, cada uma diferente', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).toMatch(new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9]{${API_KEY_RANDOM_LENGTH}}$`));
    expect(a).not.toBe(b);
    expect(looksLikeApiKey(a)).toBe(true);
  });

  it('o hash é sha256 em hex, estável, e não contém o segredo', () => {
    const k = generateApiKey();
    expect(hashApiKey(k)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(k)).toBe(hashApiKey(k));
    expect(hashApiKey(k)).not.toContain(k.slice(API_KEY_PREFIX.length));
  });

  it.each(['', 'fatia_live_', 'fatia_test_abc', `fatia_live_${'a'.repeat(31)}`, 'Bearer x'])(
    'recusa o que não tem o formato (%s)',
    (raw) => {
      expect(looksLikeApiKey(raw)).toBe(false);
    },
  );

  it('o mês da cota é o do fuso da comunidade', () => {
    // 1º de dezembro às 01h UTC ainda é 30 de novembro em Cuiabá (−4).
    const virada = new Date('2026-12-01T01:00:00Z');
    expect(usageMonth(virada, 'America/Cuiaba')).toBe('2026-11');
    expect(usageMonth(virada, 'UTC')).toBe('2026-12');
  });

  it('renova no primeiro dia do mês seguinte, com virada de ano', () => {
    expect(quotaRenewsOn('2026-11')).toBe('2026-12-01');
    expect(quotaRenewsOn('2026-12')).toBe('2027-01-01');
  });

  it('o teto é por plano: a academia tem o da prancha', () => {
    expect(API_MONTHLY_QUOTA[GroupType.SPONSORED]).toBe(10_000);
    expect(API_MONTHLY_QUOTA[GroupType.SOCIAL]).toBeLessThan(10_000);
  });

  it('estado: ok, quase (90%) e no limite', () => {
    expect(quotaState(3210, 10_000)).toBe('ok');
    expect(quotaState(9840, 10_000)).toBe('near');
    expect(quotaState(10_000, 10_000)).toBe('limit');
  });
});
