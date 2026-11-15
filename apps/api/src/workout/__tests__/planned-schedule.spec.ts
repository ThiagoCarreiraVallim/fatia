import {
  assertRescheduleDate,
  isoWeekday,
  planEndDate,
  plannedState,
  scheduleDates,
} from '../helpers/planned-schedule';

describe('planned-schedule (agenda do plano de calendário, #379)', () => {
  it('isoWeekday: 1 = segunda … 7 = domingo', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-22')).toBe(7);
  });

  it('as datas caem só nos dias escolhidos, dentro das semanas do plano', () => {
    // Começa numa quarta: a primeira semana do plano vai de quarta a terça.
    expect(scheduleDates({ startDate: '2026-11-18', weeks: 2, weekdays: [1, 3, 5] })).toEqual([
      '2026-11-18',
      '2026-11-20',
      '2026-11-23',
      '2026-11-25',
      '2026-11-27',
      '2026-11-30',
    ]);
  });

  it('o fim do plano é o último dia da última semana', () => {
    expect(planEndDate('2026-11-16', 4)).toBe('2026-12-13');
  });

  it('a partir de um dia, gera só dali em diante (aceitar versão nova não mexe no passado)', () => {
    expect(
      scheduleDates({ startDate: '2026-11-16', weeks: 2, weekdays: [1, 4] }, '2026-11-20'),
    ).toEqual(['2026-11-23', '2026-11-26']);
  });

  it('dias repetidos ou fora de 1..7 não geram sessão a mais', () => {
    expect(scheduleDates({ startDate: '2026-11-16', weeks: 1, weekdays: [1, 1, 9, 0] })).toEqual([
      '2026-11-16',
    ]);
  });

  describe('plannedState', () => {
    const today = '2026-11-19';
    it('feito quando há sessão concluída do plano no dia', () => {
      expect(plannedState('2026-11-17', today, true)).toBe('done');
      expect(plannedState(today, today, true)).toBe('done');
    });
    it('hoje, planejado ou não feito', () => {
      expect(plannedState(today, today, false)).toBe('today');
      expect(plannedState('2026-11-20', today, false)).toBe('planned');
      expect(plannedState('2026-11-18', today, false)).toBe('missed');
    });
  });

  describe('assertRescheduleDate', () => {
    const base = { today: '2026-11-19', endDate: '2026-12-13' };
    it('aceita de hoje até o fim do plano', () => {
      expect(() => assertRescheduleDate({ ...base, date: '2026-11-19' })).not.toThrow();
      expect(() => assertRescheduleDate({ ...base, date: '2026-12-13' })).not.toThrow();
    });
    it('recusa antes de hoje e depois do fim do plano', () => {
      expect(() => assertRescheduleDate({ ...base, date: '2026-11-18' })).toThrow(/hoje/);
      expect(() => assertRescheduleDate({ ...base, date: '2026-12-14' })).toThrow(/13\/12/);
    });
  });
});
