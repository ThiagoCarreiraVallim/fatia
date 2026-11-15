import { describe, expect, it } from 'vitest';
import { aiMenuFrame } from '@fatia/api-client';
import { AI_MENU_MOTION, menuBackdrop, navChrome, notchLayout } from '../ai-menu-frame';

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

  it('os tempos são os da prancha', () => {
    expect(AI_MENU_MOTION).toEqual({
      notch: 550,
      menu: 550,
      menuDelay: 80,
      header: 500,
      dock: 450,
      navFade: 400,
      navMove: 600,
    });
  });
});
