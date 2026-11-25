import { describe, expect, it } from 'vitest';
import {
  FOCUS_ASPECT,
  MUSCLE_BOXES,
  figureSideFor,
  muscleFocusViewBox,
} from '../workout/muscle-focus';
import { figureViewBox } from '../workout-cards';

const box = (viewBox: string) => {
  const [x, y, w, h] = viewBox.split(' ').map(Number) as [number, number, number, number];
  return { x, y, w, h };
};

describe('figureSideFor — frente ou costas pelos músculos (#474)', () => {
  it('peito é de frente', () => {
    expect(figureSideFor(['chest'], ['triceps', 'shoulders'])).toBe('front');
  });

  it('dorsal é de costas', () => {
    expect(figureSideFor(['lats'], ['biceps', 'middle back'])).toBe('back');
  });

  it('posterior e glúteo são de costas', () => {
    expect(figureSideFor(['hamstrings'], ['glutes', 'calves'])).toBe('back');
  });

  it('trapézio e lombar são de costas', () => {
    expect(figureSideFor(['traps'])).toBe('back');
    expect(figureSideFor(['lower back'])).toBe('back');
  });

  it('o principal decide antes do secundário', () => {
    // Tríceps (costas) com peito e ombro de apoio: a figura mostra o tríceps.
    expect(figureSideFor(['triceps'], ['chest', 'shoulders'])).toBe('back');
    expect(figureSideFor(['biceps'], ['forearms', 'lats'])).toBe('front');
  });

  it('músculo dos dois lados (ombro, panturrilha) desempata pelo secundário', () => {
    expect(figureSideFor(['shoulders'], ['traps'])).toBe('back');
    expect(figureSideFor(['shoulders'], ['triceps', 'chest'])).toBe('front');
  });

  it('sem nada que decida, de frente', () => {
    expect(figureSideFor([])).toBe('front');
    expect(figureSideFor(['shoulders'])).toBe('front');
    expect(figureSideFor(['desconhecido'])).toBe('front');
  });
});

describe('muscleFocusViewBox — o recorte na região treinada (#474)', () => {
  const full = box(figureViewBox('front'));

  it('fecha em volta do peito, bem menor que o boneco inteiro', () => {
    const b = box(muscleFocusViewBox('front', ['chest']));
    const chest = MUSCLE_BOXES.front.chest!;
    expect(b.x).toBeLessThanOrEqual(chest[0]);
    expect(b.y).toBeLessThanOrEqual(chest[1]);
    expect(b.x + b.w).toBeGreaterThanOrEqual(chest[2]);
    expect(b.y + b.h).toBeGreaterThanOrEqual(chest[3]);
    expect(b.h).toBeLessThan(full.h / 2);
  });

  it('sempre na proporção do quadro da figura', () => {
    for (const muscles of [['chest'], ['calves'], ['forearms'], ['neck'], ['quadriceps']]) {
      const b = box(muscleFocusViewBox('front', muscles));
      expect(b.w / b.h).toBeCloseTo(FOCUS_ASPECT, 2);
    }
  });

  it('não sai do quadro do boneco', () => {
    for (const side of ['front', 'back'] as const) {
      const frame = box(figureViewBox(side));
      for (const muscle of Object.keys(MUSCLE_BOXES[side])) {
        const b = box(muscleFocusViewBox(side, [muscle]));
        expect(b.x).toBeGreaterThanOrEqual(frame.x - 0.01);
        expect(b.y).toBeGreaterThanOrEqual(frame.y - 0.01);
        expect(b.x + b.w).toBeLessThanOrEqual(frame.x + frame.w + 0.01);
        expect(b.y + b.h).toBeLessThanOrEqual(frame.y + frame.h + 0.01);
      }
    }
  });

  it('o pescoço não vira um zoom absurdo: há um tamanho mínimo', () => {
    const b = box(muscleFocusViewBox('back', ['neck']));
    expect(b.h).toBeGreaterThanOrEqual(full.h * 0.3);
  });

  it('só o principal entra no recorte quando ele aparece nesse lado', () => {
    const onlyPrimary = muscleFocusViewBox('front', ['chest']);
    expect(muscleFocusViewBox('front', ['chest'], ['calves'])).toBe(onlyPrimary);
  });

  it('cai no secundário quando o principal não aparece nesse lado', () => {
    expect(muscleFocusViewBox('front', ['lats'], ['biceps'])).toBe(
      muscleFocusViewBox('front', ['biceps']),
    );
  });

  it('sem músculo deste lado, o boneco inteiro', () => {
    expect(muscleFocusViewBox('front', ['lats'])).toBe(figureViewBox('front'));
    expect(muscleFocusViewBox('back', [])).toBe(figureViewBox('back'));
  });
});
