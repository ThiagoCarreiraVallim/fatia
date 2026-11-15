import { MealType, ReminderKind, ReminderMode } from '@fatia/db';
import {
  dueSlot,
  formatClock,
  groupedReminderNotice,
  inQuietHours,
  localClock,
  mealTypeAt,
  parseClock,
  reminderNotice,
  reminderTitle,
  slotsOfDay,
  type ReminderRule,
} from '../reminder-rules';

const water: ReminderRule = {
  kind: ReminderKind.WATER,
  mode: ReminderMode.INTERVAL,
  everyHours: 2,
  fromMinute: 8 * 60,
  toMinute: 20 * 60,
  times: [],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
};

const lunch: ReminderRule = {
  kind: ReminderKind.MEAL,
  mode: ReminderMode.TIMES,
  everyHours: null,
  fromMinute: null,
  toMinute: null,
  times: [12 * 60 + 30],
  weekdays: [1, 2, 3, 4, 5],
};

describe('regras dos lembretes (#389)', () => {
  it('lê e escreve hh:mm só na grade de 5 minutos', () => {
    expect(parseClock('12:30')).toBe(750);
    expect(parseClock('07:00')).toBe(420);
    expect(parseClock('12:31')).toBeNull();
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('7:00')).toBeNull();
    expect(formatClock(750)).toBe('12:30');
    expect(formatClock(0)).toBe('00:00');
  });

  it('água a cada 2 h das 8h às 20h são 7 avisos', () => {
    expect(slotsOfDay(water).map(formatClock)).toEqual([
      '08:00',
      '10:00',
      '12:00',
      '14:00',
      '16:00',
      '18:00',
      '20:00',
    ]);
  });

  it('horários fixos saem em ordem', () => {
    expect(slotsOfDay({ ...lunch, times: [1140, 480] })).toEqual([480, 1140]);
  });

  it('o relógio local vem no fuso da pessoa, com o dia da semana ISO', () => {
    // 2026-11-16 é segunda; 15:30 UTC são 12:30 em São Paulo.
    const c = localClock(new Date('2026-11-16T15:30:00Z'), 'America/Sao_Paulo');
    expect(c).toEqual({ date: '2026-11-16', minute: 750, weekday: 1 });
    // 02:00 UTC de domingo ainda é sábado, 22:00, em Cuiabá.
    const s = localClock(new Date('2026-11-15T02:00:00Z'), 'America/Cuiaba');
    expect(s.weekday).toBe(6);
    expect(s.minute).toBe(22 * 60);
  });

  it('silêncio noturno vira a meia-noite e pode ser desligado', () => {
    const q = { enabled: true, from: 22 * 60, to: 7 * 60 };
    expect(inQuietHours(23 * 60, q)).toBe(true);
    expect(inQuietHours(3 * 60, q)).toBe(true);
    expect(inQuietHours(7 * 60, q)).toBe(false);
    expect(inQuietHours(12 * 60, q)).toBe(false);
    expect(inQuietHours(23 * 60, { ...q, enabled: false })).toBe(false);
    expect(inQuietHours(13 * 60, { enabled: true, from: 12 * 60, to: 14 * 60 })).toBe(true);
  });

  describe('horário vencido', () => {
    const now = new Date('2026-11-16T15:32:20Z'); // segunda, 12:32 em São Paulo
    const clock = localClock(now, 'America/Sao_Paulo');

    it('almoço de seg a sex sai às 12:30 de uma segunda', () => {
      expect(dueSlot(lunch, clock, now, null)).toBe(750);
    });

    it('não sai de novo se já saiu depois do horário', () => {
      expect(dueSlot(lunch, clock, now, new Date('2026-11-16T15:30:05Z'))).toBeNull();
    });

    it('sai se o último envio foi no dia anterior', () => {
      expect(dueSlot(lunch, clock, now, new Date('2026-11-13T15:30:05Z'))).toBe(750);
    });

    it('não sai no sábado', () => {
      const sab = new Date('2026-11-21T15:32:00Z');
      expect(dueSlot(lunch, localClock(sab, 'America/Sao_Paulo'), sab, null)).toBeNull();
    });

    it('horário de mais de 10 minutos atrás já passou', () => {
      const tarde = new Date('2026-11-16T15:45:00Z');
      expect(dueSlot(lunch, localClock(tarde, 'America/Sao_Paulo'), tarde, null)).toBeNull();
    });

    it('antes do horário não sai', () => {
      const cedo = new Date('2026-11-16T15:29:00Z');
      expect(dueSlot(lunch, localClock(cedo, 'America/Sao_Paulo'), cedo, null)).toBeNull();
    });
  });

  it('a refeição sai do horário: café da manhã, almoço, lanche e jantar', () => {
    expect(mealTypeAt(8 * 60)).toBe(MealType.BREAKFAST);
    expect(mealTypeAt(12 * 60 + 30)).toBe(MealType.LUNCH);
    expect(mealTypeAt(16 * 60)).toBe(MealType.SNACK);
    expect(mealTypeAt(19 * 60)).toBe(MealType.DINNER);
    expect(reminderTitle(lunch)).toBe('Almoço');
    expect(reminderTitle({ ...lunch, times: [480] })).toBe('Café da manhã');
    expect(reminderTitle(water)).toBe('Água');
  });

  it('o texto do aviso não leva número nenhum (nem copos, nem passos, nem peso)', () => {
    for (const kind of Object.values(ReminderKind)) {
      const n = reminderNotice(kind, 750);
      expect(`${n.title} ${n.body}`).not.toMatch(/\d/);
      expect(n.url.startsWith('/')).toBe(true);
    }
    expect(reminderNotice(ReminderKind.MEAL, 750).title).toBe('Hora do almoço');
  });

  it('dois lembretes no mesmo minuto viram um aviso', () => {
    expect(groupedReminderNotice(['Água', 'Almoço'])).toEqual({
      title: '2 lembretes agora',
      body: 'Água e almoço',
      url: '/',
    });
    expect(groupedReminderNotice(['Água', 'Almoço', 'Passos']).body).toBe('Água, almoço e passos');
  });
});
