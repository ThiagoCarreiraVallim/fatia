import { checkBrandColor, DEFAULT_BRAND } from '@fatia/design';

/** Distância entre traços da régua: arrastar um traço anda um passo. */
export const RULER_TICK_PX = 12;

/**
 * Valor da régua depois de arrastar `dx` px desde `start`. A régua anda sob o
 * marcador fixo: arrastar para a esquerda traz os números maiores.
 */
export function rulerValueFromDrag(
  start: number,
  dx: number,
  r: { min: number; max: number; step: number },
): number {
  const steps = Math.round(-dx / RULER_TICK_PX);
  const next = start + steps * r.step;
  const clamped = Math.min(r.max, Math.max(r.min, next));
  // Corta o ruído de ponto flutuante do passo decimal (72 + 0,1 * 3).
  return Math.round(clamped / r.step) * r.step;
}

/**
 * Cores da comunidade, com a mesma regra da web (`brandStyle`) e da API
 * (`@IsBrandColor`): cor recusada (inválida ou perto do verde do Fatia) cai
 * na padrão; o texto é o que passa sobre o fundo.
 */
export function brandColors(color: string | null | undefined): {
  background: string;
  foreground: string;
} {
  const check = color ? checkBrandColor(color) : null;
  if (!check || check.status === 'rejected') {
    return { background: DEFAULT_BRAND.color, foreground: DEFAULT_BRAND.text };
  }
  return { background: check.color, foreground: check.text };
}

/** Fração do anel, de 0 a 100 (meta 0 vira anel vazio). Mesma conta da web. */
export function ringPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/** Raio e circunferência do anel: o traço fica todo dentro do quadrado. */
export function ringGeometry(
  size: number,
  stroke: number,
): { radius: number; circumference: number } {
  const radius = (size - stroke) / 2;
  return { radius, circumference: 2 * Math.PI * radius };
}

/** Altura da barra em %: a maior enche, e nenhuma some (mínimo de 6%). */
export function barHeightPercent(value: number, max: number): number {
  const top = Math.max(1, max);
  return Math.max(6, (value / top) * 100);
}

/** Opacidade do verde em cada nível do mapa de calor (0 = fundo do cartão). */
export const HEATMAP_LEVEL_OPACITY = [0, 0.25, 0.5, 1] as const;

export interface Day {
  /** Letra do dia (S, T, Q…). */
  weekday: string;
  /** Dia do mês. */
  day: number;
  /** Nome completo para o leitor de tela ("quarta, 4 de novembro"). */
  label: string;
  done?: boolean;
}

/** O que o leitor de tela diz de um dia da faixa. */
export function dayA11yLabel(d: Day): string {
  return `${d.label}${d.done ? ', registrado' : ''}`;
}
