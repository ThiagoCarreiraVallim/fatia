import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast';
import { THEMES, palettes, type TokenName } from '../tokens';

/**
 * Texto sobre superfície precisa de 4,5:1 nos dois temas (WCAG 1.4.3).
 *
 * As cores de dado (macros, água, passos) e de estado só são texto sobre o
 * fundo e o cartão; texto principal e secundário passam também no `muted`.
 * O `faint-foreground` (tx3) passa no escuro até no `surface-3`; no claro, só
 * fundo, cartão e `muted` — por isso a tabela abaixo é por token.
 */
const TEXT_ON: Record<string, TokenName[]> = {
  foreground: ['background', 'card', 'muted', 'surface-3'],
  'muted-foreground': ['background', 'card', 'muted', 'surface-3'],
  'faint-foreground': ['background', 'card', 'muted'],
  kcal: ['background', 'card'],
  protein: ['background', 'card'],
  carbs: ['background', 'card'],
  fat: ['background', 'card'],
  water: ['background', 'card'],
  steps: ['background', 'card'],
  danger: ['background', 'card'],
  warning: ['background', 'card'],
  success: ['background', 'card'],
  info: ['background', 'card'],
  ok: ['background', 'card'],
  'primary-text': ['background', 'card'],
};

describe.each(THEMES)('tema %s', (theme) => {
  const p = palettes[theme];

  for (const [text, surfaces] of Object.entries(TEXT_ON)) {
    it.each(surfaces)(`--${text} sobre --%s passa 4,5:1`, (surface) => {
      expect(contrastRatio(p[text as TokenName], p[surface])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it.each([
    ['primary', 'primary-foreground'],
    ['destructive', 'destructive-foreground'],
    ['brand', 'brand-foreground'],
    ['foreground', 'background'],
  ] as const)('--%s com --%s (botão) passa 4,5:1', (bg, fg) => {
    expect(contrastRatio(p[bg], p[fg])).toBeGreaterThanOrEqual(4.5);
  });

  it('o anel de foco (--ring) tem 3:1 sobre o fundo (WCAG 1.4.11)', () => {
    expect(contrastRatio(p.ring, p.background)).toBeGreaterThanOrEqual(3);
  });
});

describe('verde da marca', () => {
  it('com texto branco não passa: é só superfície, nunca texto no claro', () => {
    expect(contrastRatio(palettes.light.primary, '#ffffff')).toBeLessThan(4.5);
    expect(palettes.light['primary-text']).not.toBe(palettes.light.primary);
  });

  it('é o mesmo verde nos dois temas', () => {
    expect(palettes.light.primary).toBe(palettes.dark.primary);
  });
});
