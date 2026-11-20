import { describe, expect, it } from 'vitest';
import { aiMenuFrame } from '@fatia/api-client';
import {
  AI_MENU_MOTION,
  AI_MENU_SPRING,
  backdropProgress,
  dragDistance,
  dragProgress,
  handleOpacity,
  menuBackdrop,
  navChrome,
  notchLayout,
  settleTarget,
} from '../ai-menu-frame';

/**
 * O menu da IA no app (prancha `Al-H6c5`): a tela atual encolhe até o notch e
 * o menu aparece atrás. Aqui, os números de cada ponta da animação; o
 * Reanimated só interpola entre eles.
 */
const W = 390;
const H = 844;
const open = aiMenuFrame(W);
const keyboard = aiMenuFrame(W, { keyboard: true });

describe('notchLayout', () => {
  it('fechado, a tela ocupa a janela inteira, sem raio nem escala', () => {
    expect(notchLayout(0, 0, open, keyboard, H)).toEqual({
      top: 0,
      left: 0,
      right: 0,
      height: H,
      borderRadius: 0,
      translateY: 0,
      scale: 1,
    });
  });

  it('aberto, é o notch da prancha: 8 do topo, 36 dos lados, 160 de altura, raio 32', () => {
    expect(notchLayout(1, 0, open, keyboard, H)).toEqual({
      top: 8,
      left: 36,
      right: 36,
      height: 160,
      borderRadius: 32,
      translateY: -30,
      scale: 0.815,
    });
  });

  it('com o teclado o notch baixa para 112 (Al-H6c7)', () => {
    expect(notchLayout(1, 1, open, keyboard, H).height).toBe(112);
  });

  it('no meio do caminho fica entre as pontas', () => {
    const half = notchLayout(0.5, 0, open, keyboard, H);
    expect(half.top).toBe(4);
    expect(half.height).toBe((H + 160) / 2);
    expect(half.scale).toBeCloseTo(0.9075, 4);
  });
});

describe('menu atrás e barra', () => {
  it('o menu sai de scale .92, 40 px abaixo e transparente', () => {
    expect(menuBackdrop(0)).toEqual({ opacity: 0, scale: 0.92, translateY: 40 });
    expect(menuBackdrop(1)).toEqual({ opacity: 1, scale: 1, translateY: 0 });
  });

  it('a barra de abas desce 60 px e some com o menu aberto', () => {
    expect(navChrome(0)).toEqual({ opacity: 1, translateY: 0 });
    expect(navChrome(1)).toEqual({ opacity: 0, translateY: 60 });
  });

  it('o menu atrás começa um pouco depois da tela (o atraso da prancha)', () => {
    expect(backdropProgress(0)).toBe(0);
    expect(backdropProgress(0.05)).toBe(0);
    expect(backdropProgress(1)).toBe(1);
    expect(backdropProgress(0.55)).toBeLessThan(0.55);
  });

  it('teclado e doca seguem com os tempos da prancha', () => {
    expect(AI_MENU_MOTION).toEqual({ header: 500, dock: 450 });
  });
});

describe('notchLayout fora de 0–1', () => {
  it('a mola passando do ponto não estica a tela além do notch nem da janela', () => {
    expect(notchLayout(1.08, 0, open, keyboard, H)).toEqual(notchLayout(1, 0, open, keyboard, H));
    expect(notchLayout(-0.05, 0, open, keyboard, H)).toEqual(notchLayout(0, 0, open, keyboard, H));
  });
});

describe('arrasto do notch (item 5)', () => {
  const distance = dragDistance(open, H);

  it('o curso é da borda de baixo do notch até o fim da janela', () => {
    expect(distance).toBe(H - (8 + 160));
  });

  it('a borda de baixo acompanha o dedo', () => {
    expect(dragProgress(1, 0, distance)).toBe(1);
    expect(dragProgress(1, distance / 2, distance)).toBeCloseTo(0.5, 6);
    expect(dragProgress(1, distance * 2, distance)).toBe(0);
    // Para cima, com o menu já aberto, não passa do notch.
    expect(dragProgress(1, -100, distance)).toBe(1);
  });

  it('pegar no meio da animação continua de onde a tela estava', () => {
    expect(dragProgress(0.4, -distance * 0.2, distance)).toBeCloseTo(0.6, 6);
  });

  it('solto devagar, vai para o lado mais perto', () => {
    expect(settleTarget(0.6, 0)).toBe(1);
    expect(settleTarget(0.4, 0)).toBe(0);
  });

  it('arremessado, vai na direção do gesto mesmo perto da outra ponta', () => {
    // Velocidade em progresso por segundo: negativa fecha (tela crescendo).
    expect(settleTarget(0.9, -2)).toBe(0);
    expect(settleTarget(0.15, 2)).toBe(1);
  });

  it('a mola é quase crítica: chega sem quicar', () => {
    const critical = 2 * Math.sqrt(AI_MENU_SPRING.stiffness * AI_MENU_SPRING.mass);
    expect(AI_MENU_SPRING.damping).toBeGreaterThanOrEqual(critical * 0.85);
  });
});

describe('alcinha do notch', () => {
  it('aparece junto com a tela encolhendo, sem surgir de repente', () => {
    expect(handleOpacity(0)).toBe(0);
    expect(handleOpacity(1)).toBe(1);
    const steps = [0, 0.25, 0.5, 0.75, 0.9, 1].map(handleOpacity);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!).toBeGreaterThanOrEqual(steps[i - 1]!);
      expect(steps[i]! - steps[i - 1]!).toBeLessThanOrEqual(0.6);
    }
  });
});
