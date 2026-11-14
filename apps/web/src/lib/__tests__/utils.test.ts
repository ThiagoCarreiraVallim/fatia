import { describe, expect, it } from 'vitest';
import { cn } from '../utils';

/**
 * A escala de texto do DS (`text-h2`, `text-b1`…) tem nome que o tailwind-merge
 * padrão não conhece: ele a lia como cor e apagava `text-foreground` — o título
 * do menu da IA saiu escuro sobre fundo escuro por isso.
 */
describe('cn', () => {
  it('mantém a cor quando junta com um tamanho da escala do DS', () => {
    for (const size of ['d1', 'd2', 'd3', 'h1', 'h2', 'h3', 'b1', 'b2', 'eb']) {
      expect(cn('text-foreground', `text-${size}`)).toBe(`text-foreground text-${size}`);
    }
  });

  it('o tamanho da escala substitui o tamanho anterior', () => {
    expect(cn('text-lg text-foreground', 'text-h2')).toBe('text-foreground text-h2');
  });

  it('a família da escala substitui a anterior', () => {
    expect(cn('font-sans', 'font-display-semibold')).toBe('font-display-semibold');
    expect(cn('font-display', 'font-sans-bold')).toBe('font-sans-bold');
  });
});
