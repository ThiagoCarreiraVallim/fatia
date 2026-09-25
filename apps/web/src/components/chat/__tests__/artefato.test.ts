import { describe, expect, it } from 'vitest';
import type { ChatQuota } from '@fatia/api-client';
import { celula } from '../artefato';
import { avisoDaCota } from '../cota';

describe('celula', () => {
  it('formata número em pt-BR e mostra traço no vazio', () => {
    expect(celula(1832.46)).toBe('1.832,5');
    expect(celula(null)).toBe('—');
    expect(celula('')).toBe('—');
  });

  it('data com hora vira dia/mês e hora, e texto qualquer passa igual', () => {
    expect(celula('2026-09-24T15:00:00.000Z')).toBe('24/09, 15:00');
    expect(celula('Almoço')).toBe('Almoço');
    expect(celula('2026-09-24')).toBe('2026-09-24');
  });
});

describe('avisoDaCota', () => {
  const base: ChatQuota = {
    spentMicros: 0,
    limitMicros: 100_000,
    usedRatio: 0.5,
    resetsAt: '2026-09-26T00:00:00.000Z',
    allowed: true,
  };

  it('fica quieto longe do teto e sem teto por pessoa', () => {
    expect(avisoDaCota(base)).toBeNull();
    expect(avisoDaCota({ ...base, limitMicros: null, usedRatio: null })).toBeNull();
    expect(avisoDaCota(undefined)).toBeNull();
  });

  it('avisa perto do fim, e diz quando volta quando acabou', () => {
    expect(avisoDaCota({ ...base, usedRatio: 0.85 })).toBe(
      'Você já usou 85% da cota de IA de hoje.',
    );
    expect(avisoDaCota({ ...base, usedRatio: 1, allowed: false })).toBe(
      'A cota de IA de hoje acabou. Libera de novo às 00:00.',
    );
  });

  it('barrado pelo teto da instância também avisa, mesmo com a pessoa longe do dela', () => {
    expect(avisoDaCota({ ...base, usedRatio: 0.1, allowed: false })).toMatch(/acabou/);
  });
});
