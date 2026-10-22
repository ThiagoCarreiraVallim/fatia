import { describe, expect, it } from 'vitest';
import { formatDecimal, formatInteger, formatVolume, parseClock } from '../format';

describe('formatInteger', () => {
  it('agrupa milhares com ponto', () => {
    expect(formatInteger(9500)).toBe('9.500');
    expect(formatInteger(1_234_567)).toBe('1.234.567');
    expect(formatInteger(999)).toBe('999');
  });

  it('preserva o sinal', () => {
    expect(formatInteger(-4200)).toBe('-4.200');
  });
});

describe('formatDecimal', () => {
  it('usa vírgula como separador decimal', () => {
    expect(formatDecimal(78.45)).toBe('78,5');
    expect(formatDecimal(78, 2)).toBe('78,00');
    expect(formatDecimal(5250 / 1000, 2)).toBe('5,25');
  });
});

describe('formatVolume', () => {
  it('usa mL abaixo de um litro', () => {
    expect(formatVolume(0)).toBe('0 mL');
    expect(formatVolume(350)).toBe('350 mL');
    expect(formatVolume(999)).toBe('999 mL');
  });

  it('vira litro com vírgula decimal a partir de mil', () => {
    expect(formatVolume(1000)).toBe('1,0 L');
    expect(formatVolume(1500)).toBe('1,5 L');
    expect(formatVolume(2450)).toBe('2,5 L');
  });
});

describe('parseClock', () => {
  it('lê segundos puros', () => {
    expect(parseClock('90')).toBe(90);
  });

  it('lê m:ss e h:mm:ss', () => {
    expect(parseClock('1:30')).toBe(90);
    expect(parseClock('1:02:03')).toBe(3723);
  });

  it('recusa o que não é tempo', () => {
    expect(parseClock('')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('1:75')).toBeNull();
    expect(parseClock('1:2:3:4')).toBeNull();
  });

  it('recusa minuto acima de 59 e lixo depois do número — o que o PWA aceitava', () => {
    expect(parseClock('1:75:00')).toBeNull();
    expect(parseClock('1a')).toBeNull();
    expect(parseClock('12min')).toBeNull();
  });
});
