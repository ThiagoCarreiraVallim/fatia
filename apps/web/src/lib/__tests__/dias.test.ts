import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { hojeIso, instanteNoDia } from '../dias';

const diaLocal = (instante: string) => format(new Date(instante), 'yyyy-MM-dd');

describe('instanteNoDia', () => {
  it('keeps a past date on that same local day', () => {
    expect(diaLocal(instanteNoDia('2026-05-19'))).toBe('2026-05-19');
    expect(diaLocal(instanteNoDia('2026-01-01'))).toBe('2026-01-01');
  });

  it('uses the current time when the date is today', () => {
    const antes = Date.now();
    const instante = new Date(instanteNoDia(hojeIso())).getTime();
    expect(instante).toBeGreaterThanOrEqual(antes);
    expect(instante).toBeLessThanOrEqual(Date.now());
  });
});
