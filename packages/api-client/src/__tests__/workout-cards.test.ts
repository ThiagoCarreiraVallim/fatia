import { describe, expect, it } from 'vitest';
import {
  daysAgoLabel,
  lastWorkoutWhen,
  musclesOfGroups,
  restedHeadline,
  weeklySetsBars,
  figureTone,
} from '../workout-cards';

describe('cards da aba Treino', () => {
  it('"há N dias", ontem, hoje e sem treino', () => {
    expect(daysAgoLabel(3)).toBe('há 3 dias');
    expect(daysAgoLabel(1)).toBe('ontem');
    expect(daysAgoLabel(0)).toBe('hoje');
    expect(daysAgoLabel(null)).toBe('sem treino recente');
  });

  it('o título fala dos dois grupos mais descansados que já foram treinados', () => {
    expect(
      restedHeadline([
        { group: 'costas', daysSince: 5 },
        { group: 'braço', daysSince: 3 },
        { group: 'pernas', daysSince: 2 },
        { group: 'core', daysSince: null },
      ]),
    ).toBe('Costas e braços descansados');
    expect(restedHeadline([{ group: 'peito', daysSince: 4 }])).toBe('Peito descansado');
    expect(restedHeadline([{ group: 'core', daysSince: null }])).toBe('Tudo descansado');
    expect(restedHeadline([])).toBe('Nada descansado ainda');
  });

  it('o diagrama pinta os músculos de cada grupo', () => {
    expect(musclesOfGroups(['peito', 'braço'])).toEqual(['chest', 'biceps', 'triceps', 'forearms']);
  });

  it('barras por grupo com a meta 12, sem passar do cheio', () => {
    const bars = weeklySetsBars({
      from: '2026-11-08',
      target: 12,
      sets: [
        { group: 'peito', sets: 6 },
        { group: 'pernas', sets: 15 },
        { group: 'core', sets: 0 },
      ],
      rested: [],
      suggestedPlan: null,
    });
    expect(bars.map((b) => [b.label, b.sets, b.ratio])).toEqual([
      ['Peito', 6, 0.5],
      ['Pernas', 15, 1],
      ['Core', 0, 0],
    ]);
  });

  it('"Último treino · ontem" pelo dia local', () => {
    const now = new Date(2026, 10, 14, 9, 0);
    expect(lastWorkoutWhen(new Date(2026, 10, 13, 22, 0).toISOString(), now)).toBe('ontem');
    expect(lastWorkoutWhen(new Date(2026, 10, 10, 8, 0).toISOString(), now)).toBe('há 4 dias');
  });
});

describe('silhueta do card "Seus músculos hoje"', () => {
  it('pinta cada grupo pelo descanso: 3+ dias ou nunca, 2 dias, e ontem/hoje', async () => {
    const { bodyTones } = await import('../workout-cards');
    const tones = bodyTones([
      { group: 'costas', daysSince: null },
      { group: 'pernas', daysSince: 5 },
      { group: 'peito', daysSince: 2 },
    ]);
    expect(tones).toEqual({
      costas: 'rested',
      pernas: 'rested',
      peito: 'recovering',
      // Fora da lista de descansados: treinado ontem ou hoje.
      ombro: 'recent',
      braço: 'recent',
      core: 'recent',
    });
  });

  it('a legenda tem um ponto por tom, na ordem da prancha', async () => {
    const { MUSCLE_TONE_LEGEND } = await import('../workout-cards');
    expect(MUSCLE_TONE_LEGEND.map((l) => l.tone)).toEqual(['rested', 'recovering', 'recent']);
  });
});

describe('figureTone — o boneco no tema (sem caixa branca no escuro)', () => {
  it('troca os cinzas fixos do desenho pelos tokens do tema', () => {
    expect(figureTone('#BDBDBD')).toBe('surface-3');
    expect(figureTone('#bdbdbd')).toBe('surface-3');
    // As costas usam outro cinza para os músculos.
    expect(figureTone('#AEAEB2')).toBe('surface-3');
    expect(figureTone('#E0E0E0')).toBe('border-strong');
    expect(figureTone('black')).toBe('card');
  });

  it('o fundo some e o resto fica como está', () => {
    expect(figureTone('#F5F5F5')).toBe('transparent');
    expect(figureTone('none')).toBeNull();
    expect(figureTone(undefined)).toBeNull();
  });
});
