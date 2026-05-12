import { dateInTz, startOfWeekInTz, addDaysToDateStr, lastNDates } from './date-utils';

describe('date-utils', () => {
  describe('startOfWeekInTz', () => {
    it('returns monday for a Wednesday', () => {
      const wed = new Date('2026-01-07T00:00:00Z'); // Wed
      expect(startOfWeekInTz(wed, 'UTC')).toBe('2026-01-05'); // Mon
    });

    it('returns previous monday for Sunday', () => {
      const sun = new Date('2026-01-11T00:00:00Z'); // Sun
      expect(startOfWeekInTz(sun, 'UTC')).toBe('2026-01-05'); // Mon
    });

    it('returns same day for Monday', () => {
      const mon = new Date('2026-01-05T00:00:00Z');
      expect(startOfWeekInTz(mon, 'UTC')).toBe('2026-01-05');
    });
  });

  describe('addDaysToDateStr', () => {
    it('adds positive days', () => {
      expect(addDaysToDateStr('2026-01-01', 5)).toBe('2026-01-06');
    });

    it('adds negative days (subtracts)', () => {
      expect(addDaysToDateStr('2026-01-10', -3)).toBe('2026-01-07');
    });

    it('crosses month boundary', () => {
      expect(addDaysToDateStr('2026-01-31', 1)).toBe('2026-02-01');
    });
  });

  describe('lastNDates', () => {
    it('returns array of length n', () => {
      const dates = lastNDates(7, 'UTC');
      expect(dates).toHaveLength(7);
    });

    it('last element is today', () => {
      const today = dateInTz(new Date(), 'UTC');
      const dates = lastNDates(7, 'UTC');
      expect(dates[dates.length - 1]).toBe(today);
    });

    it('dates are in ascending order', () => {
      const dates = lastNDates(5, 'UTC');
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i] > dates[i - 1]).toBe(true);
      }
    });
  });

  describe('dateInTz', () => {
    it('returns YYYY-MM-DD for UTC', () => {
      const d = new Date('2026-05-11T10:00:00Z');
      expect(dateInTz(d, 'UTC')).toBe('2026-05-11');
    });
  });
});
