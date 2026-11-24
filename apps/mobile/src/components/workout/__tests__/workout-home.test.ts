import { describe, expect, it } from 'vitest';
import {
  checkinBody,
  emptyTrainingWeek,
  groupColorName,
  restToneColors,
  setsLevelColors,
  weekChips,
} from '../workout-home';

describe('músculos de hoje no diagrama', () => {
  it('descansado na cor da marca, recuperando em passos, recente fica apagado', () => {
    const palette = { primary: '#0f0', steps: '#fa0' };
    expect(
      restToneColors({ lats: 'rested', chest: 'recovering', quadriceps: 'recent' }, palette),
    ).toEqual({ lats: '#0f0', chest: '#fa0' });
  });
});

describe('séries da semana no diagrama (#476)', () => {
  it('a cor da marca mais forte quanto mais perto da meta', () => {
    expect(setsLevelColors({ chest: 3, lats: 2, quadriceps: 1 }, '#C6F432')).toEqual({
      chest: '#C6F432',
      lats: '#C6F432A6',
      quadriceps: '#C6F43259',
    });
  });
});

describe('semana ainda sem resposta (#479)', () => {
  it('os sete dias a partir da segunda, sem treino, com hoje marcado', () => {
    const week = emptyTrainingWeek('2026-11-23', '2026-11-25');
    expect(week.start).toBe('2026-11-23');
    expect(week.days.map((d) => d.date)).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ]);
    expect(week.days.filter((d) => d.today).map((d) => d.date)).toEqual(['2026-11-25']);
    expect(week.days.some((d) => d.trained || d.active)).toBe(false);
    expect(week).toMatchObject({ done: 0, target: null });
  });
});

describe('faixa da semana', () => {
  it('sete chips com letra, dia e estado', () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-11-${String(9 + i).padStart(2, '0')}`,
      trained: i === 0,
      active: i === 2,
      today: i === 2,
    }));
    const chips = weekChips({ start: '2026-11-09', days, done: 1, target: 3 });
    expect(chips).toHaveLength(7);
    expect(chips[0]).toEqual({
      date: '2026-11-09',
      letter: 'S',
      day: 9,
      state: 'trained',
      today: false,
      label: 'segunda, dia 9, treinou',
    });
    expect(chips[2]!.state).toBe('active');
    expect(chips[2]!.label).toBe('quarta, dia 11, hoje, treino em andamento');
    expect(chips[6]!.letter).toBe('D');
    expect(chips[6]!.state).toBe('rest');
  });
});

describe('respostas da equipe', () => {
  it('sem dor, o local não vai; com dor, vai aparado', () => {
    expect(checkinBody({ fatigue: 3, pain: false, painLocation: 'joelho' })).toEqual({
      fatigue: 3,
      pain: false,
    });
    expect(checkinBody({ fatigue: null, pain: true, painLocation: '  joelho  ' })).toEqual({
      pain: true,
      painLocation: 'joelho',
    });
    expect(checkinBody({ fatigue: null, pain: null, painLocation: '' })).toEqual({});
  });
});

describe('cor de cada grupo (barra do plano, chip do exercício)', () => {
  it('as cores do canvas, e o resto no tom apagado', () => {
    expect(groupColorName('peito')).toBe('protein');
    expect(groupColorName('costas')).toBe('water');
    expect(groupColorName('pernas')).toBe('primary');
    expect(groupColorName('ombro')).toBe('steps');
    expect(groupColorName('braço')).toBe('carbs');
    expect(groupColorName('core')).toBe('fat');
    expect(groupColorName('cardio')).toBe('danger');
    expect(groupColorName('outro')).toBe('mutedForeground');
  });
});
