import { addDaysIso, dateInTz, lastNDates, weekStartInTz } from './date-tz';

describe('dateInTz', () => {
  it('converts UTC midnight to São Paulo previous day', () => {
    // 2026-05-09T02:00:00Z = 2026-05-08 23:00 in São Paulo (UTC-3)
    const d = new Date('2026-05-09T02:00:00Z');
    expect(dateInTz(d, 'America/Sao_Paulo')).toBe('2026-05-08');
  });

  it('keeps UTC date when timezone is UTC', () => {
    const d = new Date('2026-05-09T12:00:00Z');
    expect(dateInTz(d, 'UTC')).toBe('2026-05-09');
  });
});

describe('weekStartInTz', () => {
  it('returns Monday for a Wednesday', () => {
    // 2026-05-13 is a Wednesday
    const d = new Date('2026-05-13T15:00:00Z');
    expect(weekStartInTz(d, 'UTC')).toBe('2026-05-11');
  });

  it('returns Monday for a Sunday (previous week start)', () => {
    // 2026-05-10 is Sunday
    const d = new Date('2026-05-10T15:00:00Z');
    expect(weekStartInTz(d, 'UTC')).toBe('2026-05-04');
  });

  it('returns same date when input is Monday', () => {
    const d = new Date('2026-05-11T15:00:00Z');
    expect(weekStartInTz(d, 'UTC')).toBe('2026-05-11');
  });
});

describe('addDaysIso', () => {
  it('adds days correctly across month boundary', () => {
    expect(addDaysIso('2026-05-30', 3)).toBe('2026-06-02');
  });

  it('subtracts days correctly', () => {
    expect(addDaysIso('2026-05-01', -1)).toBe('2026-04-30');
  });
});

describe('lastNDates', () => {
  it('includes today and goes back', () => {
    const list = lastNDates(7, 'UTC');
    expect(list).toHaveLength(7);
    expect(list[6]).toBe(dateInTz(new Date(), 'UTC'));
  });
});
