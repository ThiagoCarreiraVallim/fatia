import { describe, expect, it } from 'vitest';
import { checkinBody, groupColorName, restToneColors, weekChips } from '../workout-home';

describe('músculos de hoje no diagrama', () => {
  it('descansado na cor da marca, recuperando em passos, recente fica apagado', () => {
    const palette = { primary: '#0f0', steps: '#fa0' };
    expect(
      restToneColors({ lats: 'rested', chest: 'recovering', quadriceps: 'recent' }, palette),
    ).toEqual({ lats: '#0f0', chest: '#fa0' });
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
