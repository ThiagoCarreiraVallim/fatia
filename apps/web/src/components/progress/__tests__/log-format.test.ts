import { describe, expect, it } from 'vitest';
import { dayMonth, formatDecimal, formatInteger, hourMinute, instantDayMonth } from '../log-format';

describe('instantDayMonth', () => {
  it('usa o dia do relógio local, e não o dia UTC', () => {
    // O Node relê `TZ` a cada mudança; sem isto, num CI em UTC os dois dias coincidem.
    const original = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
      // 21h30 de 13/10 em São Paulo já é 14/10 em UTC.
      const instante = '2026-10-14T00:30:00.000Z';
      expect(instantDayMonth(instante)).toBe('13 out');
      expect(dayMonth(instante)).toBe('14 out');
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('devolve o travessão para instante ausente ou inválido', () => {
    expect(instantDayMonth(null)).toBe('—');
    expect(instantDayMonth('ontem')).toBe('—');
  });
});

describe('dayMonth', () => {
  it('reads the day and month straight off the ISO string', () => {
    expect(dayMonth('2026-05-19')).toBe('19 mai');
    expect(dayMonth('2026-01-02T09:00:00.000Z')).toBe('02 jan');
  });

  // Os ramos de fallback existem para não estampar "NaN undefined" numa lista
  // que a pessoa usa para decidir o que apagar.
  it('falls back instead of rendering garbage', () => {
    expect(dayMonth(null)).toBe('—');
    expect(dayMonth(undefined)).toBe('—');
    expect(dayMonth('2026-05')).toBe('—');
    expect(dayMonth('2026-13-19')).toBe('—');
  });
});

describe('hourMinute', () => {
  it('falls back on missing or unparseable input', () => {
    expect(hourMinute(null)).toBe('—');
    expect(hourMinute('não é data')).toBe('—');
  });

  it('renders a two-digit clock', () => {
    expect(hourMinute('2026-05-17T14:07:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('formatInteger', () => {
  it('groups thousands with a dot', () => {
    expect(formatInteger(9500)).toBe('9.500');
    expect(formatInteger(1_234_567)).toBe('1.234.567');
    expect(formatInteger(500)).toBe('500');
  });

  it('falls back on a non-finite value', () => {
    expect(formatInteger(Number.NaN)).toBe('—');
  });
});

describe('formatDecimal', () => {
  it('uses the comma of pt-BR', () => {
    expect(formatDecimal(78.5)).toBe('78,5');
    expect(formatDecimal(80)).toBe('80,0');
  });

  it('falls back on a non-finite value', () => {
    expect(formatDecimal(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
