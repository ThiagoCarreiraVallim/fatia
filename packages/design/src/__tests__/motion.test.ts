import { describe, expect, it } from 'vitest';
import { cssEasing, duration, easing, motionMs, stagger, staggerDelay } from '../motion';

describe('movimento', () => {
  it('segue a escala do canvas', () => {
    expect(duration).toMatchObject({ fast: 150, base: 300, sheet: 550, tab: 500, data: 1300 });
    expect(stagger).toMatchObject({ list: 70, bars: 60 });
    expect(easing.ease).toEqual([0.2, 0.8, 0.2, 1]);
    expect(easing.spring).toEqual([0.34, 1.56, 0.64, 1]);
    expect(cssEasing.ease).toBe('cubic-bezier(0.2, 0.8, 0.2, 1)');
    // A tela encolhendo até o notch do menu da IA (prancha Al-H6c5).
    expect(easing.notch).toEqual([0.65, 0, 0.2, 1]);
    expect(cssEasing.notch).toBe('cubic-bezier(0.65, 0, 0.2, 1)');
  });

  it('o toast some em 2,5 s sem ação e espera 5 s quando há Desfazer (WCAG 2.2.1)', () => {
    expect(duration.toast).toBe(2500);
    expect(duration.toastWithAction).toBe(5000);
  });

  it('reduzir movimento zera duração e atraso', () => {
    expect(motionMs(duration.sheet, true)).toBe(0);
    expect(motionMs(duration.sheet, false)).toBe(550);
    expect(staggerDelay(3, 'list', false)).toBe(210);
    expect(staggerDelay(3, 'list', true)).toBe(0);
  });
});
