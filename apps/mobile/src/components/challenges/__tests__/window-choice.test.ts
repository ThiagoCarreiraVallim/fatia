import { describe, expect, it } from 'vitest';
import { challengeWindow, nextMonday } from '../window-choice';

describe('janela do desafio no app', () => {
  it('a próxima segunda nunca é hoje', () => {
    expect(nextMonday('2026-10-18')).toBe('2026-10-19'); // domingo
    expect(nextMonday('2026-10-19')).toBe('2026-10-26'); // segunda
    expect(nextMonday('2026-10-24')).toBe('2026-10-26'); // sábado
  });

  it('a duração conta o primeiro dia: 7 dias de domingo terminam no sábado', () => {
    expect(challengeWindow('2026-10-18', 'today', '7')).toEqual({
      startDate: '2026-10-18',
      endDate: '2026-10-24',
    });
    expect(challengeWindow('2026-10-18', 'tomorrow', '14')).toEqual({
      startDate: '2026-10-19',
      endDate: '2026-11-01',
    });
    expect(challengeWindow('2026-12-30', 'monday', '30')).toEqual({
      startDate: '2027-01-04',
      endDate: '2027-02-02',
    });
  });
});
