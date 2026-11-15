import type { AiMenuFrame } from '@fatia/api-client';

/**
 * Os números do menu da IA que encolhe a tela (prancha `Al-H6c5`), sem
 * Reanimated, para testar no Node. São worklets: o `ai-menu.tsx` os chama de
 * dentro do `useAnimatedStyle`, a cada quadro.
 */

/** Durações da prancha, em ms. */
export const AI_MENU_MOTION = {
  /** Tela encolhendo até o notch (curva `notch`). */
  notch: 550,
  /** Menu crescendo atrás dela, com atraso. */
  menu: 550,
  menuDelay: 80,
  /** Cabeçalho subindo com o teclado (Al-H6c7). */
  header: 500,
  /** Doca subindo para cima do teclado. */
  dock: 450,
  /** A barra de abas apagando e descendo. */
  navFade: 400,
  navMove: 600,
} as const;

const mix = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};

export interface NotchLayout {
  top: number;
  left: number;
  right: number;
  height: number;
  borderRadius: number;
  /** A tela, no tamanho real, sobe e encolhe dentro do notch. */
  translateY: number;
  scale: number;
}

/**
 * Onde a tela atual está com o menu `progress` aberto (0 fechado, 1 aberto) e
 * o teclado `keyboard` subido (0–1). Fechada ocupa a janela de altura `height`.
 */
export function notchLayout(
  progress: number,
  keyboard: number,
  open: AiMenuFrame,
  withKeyboard: AiMenuFrame,
  height: number,
): NotchLayout {
  'worklet';
  const notchHeight = mix(open.height, withKeyboard.height, keyboard);
  return {
    top: mix(0, open.top, progress),
    left: mix(0, open.inset, progress),
    right: mix(0, open.inset, progress),
    height: mix(height, notchHeight, progress),
    borderRadius: mix(0, open.radius, progress),
    translateY: mix(0, -open.lift, progress),
    scale: mix(1, open.scale, progress),
  };
}

/** O menu atrás: sai de `scale(.92) translateY(40px)` e transparente. */
export function menuBackdrop(progress: number) {
  'worklet';
  return {
    opacity: progress,
    scale: mix(0.92, 1, progress),
    translateY: mix(40, 0, progress),
  };
}

/** A barra de abas e o botão da IA: descem 60 px e somem com o menu aberto. */
export function navChrome(progress: number) {
  'worklet';
  return { opacity: 1 - progress, translateY: mix(0, 60, progress) };
}
