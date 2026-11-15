import { describe, expect, it } from 'vitest';
import {
  activeRemindersLabel,
  draftFromReminder,
  draftToInput,
  newReminderDraft,
  reminderCta,
  reminderPerDay,
  reminderSummary,
  reminderTypes,
  reminderVisual,
  stepClock,
  type Reminder,
} from '../reminders';

const base: Reminder = {
  id: 'r1',
  kind: 'MEAL',
  habitId: null,
  title: 'Almoço',
  mode: 'TIMES',
  everyHours: null,
  from: null,
  to: null,
  times: ['12:30'],
  weekdays: [1, 2, 3, 4, 5],
  stepsBelow: null,
  enabled: true,
  createdAt: '2026-11-15T00:00:00Z',
  updatedAt: '2026-11-15T00:00:00Z',
};

describe('resumo do lembrete (prancha Al-V2)', () => {
  it('fala como a prancha', () => {
    expect(
      reminderSummary({
        ...base,
        kind: 'WATER',
        mode: 'INTERVAL',
        everyHours: 2,
        from: '08:00',
        to: '20:00',
        times: [],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      }),
    ).toBe('A cada 2 h · 8h–20h');
    expect(reminderSummary({ ...base, times: ['08:00'], weekdays: [1, 2, 3, 4, 5, 6, 7] })).toBe(
      '08:00 · todos os dias',
    );
    expect(reminderSummary(base)).toBe('12:30 · seg a sex');
    expect(reminderSummary({ ...base, kind: 'WEIGHT', times: ['07:00'], weekdays: [1] })).toBe(
      'Seg · 07:00',
    );
    expect(
      reminderSummary({ ...base, kind: 'WORKOUT', times: ['18:00'], weekdays: [1, 3, 5] }),
    ).toBe('Seg, Qua, Sex · 18:00');
    expect(
      reminderSummary({
        ...base,
        kind: 'STEPS',
        times: ['19:00'],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        stepsBelow: 6000,
      }),
    ).toBe('19:00 se abaixo de 6 mil');
    expect(reminderSummary({ ...base, times: ['10:00'], weekdays: [6, 7] })).toBe(
      '10:00 · fim de semana',
    );
    expect(
      reminderSummary({
        ...base,
        kind: 'WATER',
        mode: 'INTERVAL',
        everyHours: 3,
        from: '08:30',
        to: '20:00',
        times: [],
      }),
    ).toBe('A cada 3 h · 8h30–20h · seg a sex');
  });

  it('conta os ligados no singular e no plural', () => {
    expect(activeRemindersLabel([base, { ...base, id: 'r2', enabled: false }])).toBe('1 ativo');
    expect(activeRemindersLabel([base, { ...base, id: 'r2' }])).toBe('2 ativos');
  });

  it('ícone e tom da prancha', () => {
    expect(reminderVisual('WATER')).toEqual({ icon: 'drop', tone: 'water' });
    expect(reminderVisual('MEAL')).toEqual({ icon: 'apple', tone: 'lime' });
    expect(reminderVisual('STEPS')).toEqual({ icon: 'steps', tone: 'amber' });
    expect(reminderVisual('WEIGHT')).toEqual({ icon: 'scale', tone: 'neutral' });
  });
});

describe('folha de lembrete (pranchas Al-V3/V3b)', () => {
  it('nasce como a prancha: água, a cada 2 h, das 8h às 20h, todo dia', () => {
    const d = newReminderDraft();
    expect(d).toMatchObject({
      kind: 'WATER',
      mode: 'INTERVAL',
      everyHours: 2,
      from: 480,
      to: 1200,
      times: [480, 750, 1140],
      weekdays: [true, true, true, true, true, true, true],
    });
    expect(reminderPerDay(d)).toBe(7);
    expect(reminderCta(d, false)).toBe('Salvar · 7 avisos por dia, 7 dias');
  });

  it('horários fixos contam os horários; edição muda o texto do botão', () => {
    const d = draftFromReminder(base);
    expect(d.mode).toBe('TIMES');
    expect(d.times).toEqual([750]);
    expect(d.weekdays).toEqual([true, true, true, true, true, false, false]);
    expect(reminderCta(d, true)).toBe('Salvar alterações · 1 aviso por dia, 5 dias');
    expect(
      reminderCta({ ...d, weekdays: [true, false, false, false, false, false, false] }, true),
    ).toBe('Salvar alterações · 1 aviso por dia, 1 dia');
  });

  it('o seletor hh:mm anda 1 h e 5 min e dá a volta no dia', () => {
    expect(stepClock(23 * 60, 1, 0)).toBe(0);
    expect(stepClock(0, -1, 0)).toBe(23 * 60);
    expect(stepClock(12 * 60 + 55, 0, 5)).toBe(12 * 60);
    expect(stepClock(12 * 60, 0, -5)).toBe(12 * 60 + 55);
  });

  it('vira o corpo da API só com os campos do modo', () => {
    expect(draftToInput(newReminderDraft())).toEqual({
      kind: 'WATER',
      mode: 'INTERVAL',
      everyHours: 2,
      from: '08:00',
      to: '20:00',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(draftToInput(draftFromReminder(base))).toEqual({
      kind: 'MEAL',
      mode: 'TIMES',
      times: ['12:30'],
      weekdays: [1, 2, 3, 4, 5],
    });
  });

  it('o tipo Hábito só aparece com hábitos e nunca na edição', () => {
    expect(reminderTypes({ habits: false, editing: false }).map((t) => t.label)).toEqual([
      'Água',
      'Refeição',
      'Peso',
      'Treino',
      'Passos',
    ]);
    expect(reminderTypes({ habits: true, editing: false }).at(-1)?.label).toBe('Hábito');
    expect(reminderTypes({ habits: true, editing: true })).toHaveLength(5);
  });
});
