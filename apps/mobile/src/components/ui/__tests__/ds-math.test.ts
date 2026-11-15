import { describe, expect, it } from 'vitest';
import { brandColors, rulerValueFromDrag, RULER_TICK_PX } from '../ds-math';

describe('régua do app', () => {
  it('arrastar para a esquerda sobe o valor, um passo por traço', () => {
    const r = { min: 30, max: 200, step: 1 };
    expect(rulerValueFromDrag(72, -RULER_TICK_PX * 3, r)).toBe(75);
    expect(rulerValueFromDrag(72, RULER_TICK_PX * 2, r)).toBe(70);
  });

  it('não passa dos limites e respeita o passo decimal', () => {
    expect(rulerValueFromDrag(199, -RULER_TICK_PX * 10, { min: 30, max: 200, step: 1 })).toBe(200);
    expect(rulerValueFromDrag(72, -RULER_TICK_PX, { min: 30, max: 200, step: 0.5 })).toBe(72.5);
  });
});

describe('cor da comunidade no app', () => {
  it('cor aceita: fundo dela e o texto que passa', () => {
    expect(brandColors('#7C5CFF').background).toBe('#7c5cff');
  });

  it('verde do Fatia é recusado e cai na cor padrão, como na web e na API', () => {
    expect(brandColors('#2CE500')).toEqual(brandColors(null));
  });
});
