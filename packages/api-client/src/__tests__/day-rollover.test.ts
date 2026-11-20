import { describe, expect, it } from 'vitest';
import { followToday, msUntilNextDay } from '../day-rollover';

/**
 * As abas ficam montadas (Tabs). Na virada do dia, a tela que estava em "hoje"
 * passa para o novo hoje; quem escolheu outro dia continua nele.
 */
describe('followToday — virada do dia nas abas montadas', () => {
  it('quem estava no hoje de antes vai para o hoje novo', () => {
    expect(followToday('2026-11-19', '2026-11-19', '2026-11-20')).toBe('2026-11-20');
  });

  it('quem escolheu outro dia fica nele', () => {
    expect(followToday('2026-11-15', '2026-11-19', '2026-11-20')).toBe('2026-11-15');
  });

  it('sem virada, nada muda', () => {
    expect(followToday('2026-11-19', '2026-11-19', '2026-11-19')).toBe('2026-11-19');
  });
});

describe('msUntilNextDay', () => {
  it('conta até a meia-noite local seguinte (com folga de um segundo)', () => {
    const now = new Date(2026, 10, 19, 23, 59, 0);
    expect(msUntilNextDay(now)).toBe(61_000);
  });

  it('logo depois da meia-noite, quase um dia inteiro', () => {
    const now = new Date(2026, 10, 20, 0, 0, 1);
    expect(msUntilNextDay(now)).toBe(24 * 3600_000);
  });
});
