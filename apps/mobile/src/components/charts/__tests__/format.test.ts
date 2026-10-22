import { describe, expect, it } from 'vitest';
import {
  dayMonth,
  describeSeries,
  formatCompact,
  formatDecimal,
  formatDuration,
  instantDayMonth,
  shortDate,
} from '../format';

describe('shortDate', () => {
  it('lê a data ISO sem passar por Date', () => {
    expect(shortDate('2026-07-29')).toBe('29/07');
    expect(shortDate('2026-01-01T23:30:00.000Z')).toBe('01/01');
  });

  it('não desloca o dia em fuso negativo', () => {
    // `new Date('2026-07-29')` é meia-noite UTC e, no horário de Brasília,
    // voltaria para 28 — a razão de a função fatiar a string.
    const original = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    expect(shortDate('2026-07-29')).toBe('29/07');
    process.env.TZ = original;
  });

  it('devolve a entrada quando ela não é uma data', () => {
    expect(shortDate('x')).toBe('x');
  });
});

describe('dayMonth', () => {
  it('formata com o mês abreviado em português', () => {
    expect(dayMonth('2026-07-29')).toBe('29 jul');
    expect(dayMonth('2026-12-05')).toBe('05 dez');
  });

  it('devolve travessão para nulo ou mês inválido', () => {
    expect(dayMonth(null)).toBe('—');
    expect(dayMonth('2026-13-05')).toBe('—');
  });
});

describe('formatCompact', () => {
  it('encurta milhares para caber no eixo', () => {
    expect(formatCompact(9500)).toBe('9,5k');
    expect(formatCompact(12_000)).toBe('12k');
    expect(formatCompact(850)).toBe('850');
  });
});

describe('formatDuration', () => {
  it('formata em minutos e segundos', () => {
    expect(formatDuration(725)).toBe('12:05');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(null)).toBe('—');
  });
});

describe('describeSeries', () => {
  it('resume a série para o leitor de tela', () => {
    const text = describeSeries({
      name: 'Peso',
      labels: ['2026-07-01', '2026-07-15', '2026-07-29'],
      values: [80, 79, 78.2],
      format: (value) => `${formatDecimal(value)} kg`,
    });
    expect(text).toContain('3 registros');
    expect(text).toContain('01 jul');
    expect(text).toContain('29 jul');
    expect(text).toContain('78,2 kg');
  });

  it('avisa quando não há dado', () => {
    expect(describeSeries({ name: 'Passos', labels: [], values: [], format: String })).toBe(
      'Passos: sem dados no período.',
    );
  });
});

describe('instantDayMonth', () => {
  it('usa o dia do relógio local, e não o dia UTC', () => {
    // O Node relê `TZ` a cada mudança; sem isto, num CI em UTC os dois dias coincidem.
    const original = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
      // 21h30 de 13/10 em São Paulo já é 14/10 em UTC.
      expect(instantDayMonth('2026-10-14T00:30:00.000Z')).toBe('13 out');
      expect(dayMonth('2026-10-14T00:30:00.000Z')).toBe('14 out');
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
