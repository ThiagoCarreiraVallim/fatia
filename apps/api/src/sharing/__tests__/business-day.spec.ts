import { brazilNationalHolidays, firstBusinessDay, isBusinessDay } from '../business-day';

describe('dia útil (#400, e-mail mensal no 1º dia útil)', () => {
  it('feriados nacionais fixos e a Sexta-feira Santa, que muda com a Páscoa', () => {
    const f2026 = brazilNationalHolidays(2026);
    for (const d of [
      '2026-01-01',
      '2026-04-03', // Páscoa em 5/4/2026
      '2026-04-21',
      '2026-05-01',
      '2026-09-07',
      '2026-10-12',
      '2026-11-02',
      '2026-11-15',
      '2026-11-20',
      '2026-12-25',
    ]) {
      expect(f2026.has(d)).toBe(true);
    }
    expect(brazilNationalHolidays(2027).has('2027-03-26')).toBe(true); // Páscoa em 28/3/2027
    expect(f2026.has('2026-04-02')).toBe(false);
  });

  it('fim de semana e feriado não são dia útil', () => {
    expect(isBusinessDay('2026-11-02')).toBe(false); // segunda, Finados
    expect(isBusinessDay('2026-11-01')).toBe(false); // domingo
    expect(isBusinessDay('2026-10-31')).toBe(false); // sábado
    expect(isBusinessDay('2026-11-03')).toBe(true);
  });

  it('o 1º dia útil pula fim de semana e feriado', () => {
    expect(firstBusinessDay('2026-11')).toBe('2026-11-03'); // dom 1, seg 2 Finados
    expect(firstBusinessDay('2027-01')).toBe('2027-01-04'); // sex 1 feriado, fim de semana
    expect(firstBusinessDay('2027-05')).toBe('2027-05-03'); // sáb 1
    expect(firstBusinessDay('2026-12')).toBe('2026-12-01');
    expect(firstBusinessDay('2026-08')).toBe('2026-08-03'); // sáb 1, dom 2
  });
});
