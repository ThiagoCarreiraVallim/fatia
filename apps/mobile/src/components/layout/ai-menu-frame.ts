import type { AiMenuFrame } from '@fatia/api-client';

/**
 * Os números do menu da IA que encolhe a tela (prancha `Al-H6c5`), sem
 * Reanimated, para testar no Node. São worklets: o `ai-menu.tsx` os chama de
 * dentro do `useAnimatedStyle`, a cada quadro.
 */

/** Durações da prancha que continuam em tempo, em ms. */
export const AI_MENU_MOTION = {
  /** Cabeçalho subindo com o teclado (Al-H6c7). */
  header: 500,
  /** Doca subindo para cima do teclado. */
  dock: 450,
} as const;

/**
 * A tela encolhendo e voltando é uma mola só (item 5), dirigida pelo botão ou
 * pelo dedo: interromper no meio e voltar não dá salto, e soltar o arrasto
 * herda a velocidade do gesto. Quase crítica, assenta em ~0,5 s (a prancha
 * anima em 550 ms) sem quicar.
 */
export const AI_MENU_SPRING = { stiffness: 240, damping: 30, mass: 1 } as const;

/** Velocidade (progresso por segundo) a partir da qual o arremesso decide. */
const FLING = 0.9;

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};

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
  progress = clamp01(progress);
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
  progress = clamp01(progress);
  return {
    opacity: progress,
    scale: mix(0.92, 1, progress),
    translateY: mix(40, 0, progress),
  };
}

/** A barra de abas e o botão da IA: descem 60 px e somem com o menu aberto. */
export function navChrome(progress: number) {
  'worklet';
  progress = clamp01(progress);
  return { opacity: 1 - progress, translateY: mix(0, 60, progress) };
}

/**
 * O menu atrás começa um pouco depois da tela (os 80 ms de atraso da prancha),
 * agora como fração do mesmo progresso: o gesto e a volta continuam reversíveis.
 */
export function backdropProgress(progress: number): number {
  'worklet';
  return clamp01((progress - 0.1) / 0.9);
}

/** O curso do arrasto: da borda de baixo do notch até o fim da janela. */
export function dragDistance(open: AiMenuFrame, height: number): number {
  'worklet';
  return Math.max(1, height - (open.top + open.height));
}

/**
 * Progresso enquanto o dedo arrasta: a borda de baixo da tela encolhida segue
 * o dedo (`dy` > 0 é para baixo, e cresce a tela até a janela inteira).
 */
export function dragProgress(start: number, dy: number, distance: number): number {
  'worklet';
  return clamp01(start - dy / distance);
}

/**
 * Para onde a mola vai ao soltar: arremesso decide pela direção; devagar, pelo
 * lado mais perto. `velocity` em progresso por segundo (negativa = fechando).
 */
export function settleTarget(progress: number, velocity: number): 0 | 1 {
  'worklet';
  if (velocity <= -FLING) return 0;
  if (velocity >= FLING) return 1;
  return progress >= 0.5 ? 1 : 0;
}

/** A alcinha do notch acende junto com a tela encolhendo, nunca de repente. */
export function handleOpacity(progress: number): number {
  'worklet';
  return clamp01(progress);
}
