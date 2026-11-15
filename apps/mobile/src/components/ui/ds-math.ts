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
