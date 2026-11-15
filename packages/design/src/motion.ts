/**
 * Movimento do design system: só quando explica uma mudança de dado ou de lugar.
 *
 * Toda animação respeita "reduzir movimento" do sistema: com ele ligado, a
 * duração e o atraso viram 0 ({@link motionMs}, {@link staggerDelay}) e
 * respiração/pulso não rodam.
 */

export const duration = {
  /** Toque, toggle, chip ativo. */
  fast: 150,
  /** Abas, troca de estado, fade, fundo da folha escurecendo. */
  base: 300,
  /** Indicador de aba crescendo da esquerda. */
  tab: 500,
  /** Folha subindo, entrada de lista. */
  sheet: 550,
  /** Barra crescendo (mínimo da faixa de dado). */
  dataMin: 1000,
  /** Anel enchendo e contagem do número. */
  data: 1300,
  /** Mola do check e da conquista (.35–.5 s). */
  pop: 350,
  /** Toast sem ação some em 2,5 s. */
  toast: 2500,
  /**
   * Toast com "Desfazer" fica 5 s: 2,5 s não dá tempo de ler e alcançar o
   * botão (WCAG 2.2.1), e é o UNDO_MS que o app já usa.
   */
  toastWithAction: 5000,
  /** Respiração do estado ativo (treino rodando, ranking ao vivo). */
  breathe: 2400,
} as const;

export const stagger = {
  /** Lista em cascata: sobe 14 px + fade. */
  list: 70,
  /** Barras crescendo, de baixo para cima. */
  bars: 60,
  /** Células do mapa de calor. */
  heat: 25,
} as const;

/** Deslocamento da entrada em cascata, em px. */
export const LIST_RISE_PX = 14;

export const easing = {
  ease: [0.2, 0.8, 0.2, 1],
  spring: [0.34, 1.56, 0.64, 1],
  /** A tela encolhendo até o notch do menu da IA (prancha `Al-H6c5`). */
  notch: [0.65, 0, 0.2, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const cssEasing = {
  ease: `cubic-bezier(${easing.ease.join(', ')})`,
  spring: `cubic-bezier(${easing.spring.join(', ')})`,
  notch: `cubic-bezier(${easing.notch.join(', ')})`,
} as const;

/** A duração, ou 0 com reduzir movimento. */
export function motionMs(ms: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : ms;
}

/** Atraso do item `index` numa sequência, ou 0 com reduzir movimento. */
export function staggerDelay(
  index: number,
  kind: keyof typeof stagger,
  reducedMotion: boolean,
): number {
  return reducedMotion ? 0 : index * stagger[kind];
}

/** Curva ease aplicada a `t` (0–1); usada pela contagem do número. */
export function easeOut(t: number): number {
  // Aproximação da cubic-bezier(.2,.8,.2,1) boa o bastante para contagem.
  return 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
}
