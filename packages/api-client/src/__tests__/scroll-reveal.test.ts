import { describe, expect, it } from 'vitest';
import { currentChipIndex, revealOffset } from '../scroll-reveal';

describe('revealOffset — a faixa rola até o chip da vez', () => {
  // Faixa de 300 px; chips de 100 px com 8 de vão: 0–100, 108–208, 216–316, 324–424.
  const view = { viewport: 300, content: 424 };

  it('chip já à vista: não mexe', () => {
    expect(revealOffset({ ...view, offset: 0, itemStart: 108, itemEnd: 208 })).toBe(0);
  });

  it('chip passando da borda direita: rola o mínimo para ele caber, com respiro', () => {
    // Série 4 de 4: só os dois primeiros apareciam inteiros.
    expect(revealOffset({ ...view, offset: 0, itemStart: 324, itemEnd: 424, margin: 16 })).toBe(
      124,
    );
  });

  it('chip escondido à esquerda: volta até ele', () => {
    expect(revealOffset({ ...view, offset: 200, itemStart: 108, itemEnd: 208, margin: 16 })).toBe(
      92,
    );
  });

  it('nunca passa do começo nem do fim da faixa', () => {
    expect(revealOffset({ ...view, offset: 50, itemStart: 0, itemEnd: 100, margin: 16 })).toBe(0);
    expect(revealOffset({ ...view, offset: 0, itemStart: 324, itemEnd: 424, margin: 40 })).toBe(
      124,
    );
  });
});

describe('currentChipIndex — qual chip é o da vez', () => {
  it('a próxima série a fazer', () => {
    expect(currentChipIndex({ done: 0, target: 4 })).toBe(0);
    expect(currentChipIndex({ done: 3, target: 4 })).toBe(3);
  });

  it('exercício completo (ou com série a mais): a última feita', () => {
    expect(currentChipIndex({ done: 4, target: 4 })).toBe(3);
    expect(currentChipIndex({ done: 5, target: 4 })).toBe(4);
  });

  it('sem série nenhuma e sem meta: nada a mostrar', () => {
    expect(currentChipIndex({ done: 0, target: 0 })).toBeNull();
  });
});
