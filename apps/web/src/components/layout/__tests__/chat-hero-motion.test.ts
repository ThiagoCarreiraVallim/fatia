import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O brilho do cartão do chat mora no CSS (o jsdom não roda `@media`), então o
 * caso lê a regra: com menos movimento pedido, a faixa não pode aparecer. Olha
 * o bloco `prefers-reduced-motion` que cita a classe, e não o arquivo inteiro.
 */
const css = readFileSync(resolve(__dirname, '../../../app/globals.css'), 'utf8');

function reducedMotionBlocks(source: string): string[] {
  const blocks: string[] = [];
  const marker = '@media (prefers-reduced-motion: reduce)';
  let at = source.indexOf(marker);
  while (at !== -1) {
    const open = source.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++;
      if (source[end] === '}' && --depth === 0) break;
    }
    blocks.push(source.slice(open, end + 1));
    at = source.indexOf(marker, end);
  }
  return blocks;
}

describe('brilho do cartão do chat', () => {
  it('anda quando o movimento é livre', () => {
    expect(css).toMatch(/\.chat-hero-shine\s*\{[^}]*animation:\s*fatia-chat-hero-shine/);
  });

  it('some com reduzir movimento', () => {
    const block = reducedMotionBlocks(css).find((b) => b.includes('.chat-hero-shine'));
    expect(block).toBeDefined();
    expect(block).toMatch(/\.chat-hero-shine\s*\{[^}]*display:\s*none/);
  });
});
