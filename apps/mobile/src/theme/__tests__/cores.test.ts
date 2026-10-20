import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cores } from '../cores';

/** `cores.ts` é cópia em hex dos tokens; este teste impede que a cópia envelheça. */

const CSS = readFileSync(resolve(__dirname, '../../../global.css'), 'utf8');

function token(name: string): string {
  const m = CSS.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} não existe em global.css`);
  return m[1].trim();
}

function hslToRgb(hsl: string): [number, number, number] {
  const [h, s, l] = hsl.split(/\s+/).map((v) => parseFloat(v));
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const TOKEN: Record<Exclude<keyof typeof cores, 'placeholder'>, string> = {
  background: 'background',
  foreground: 'foreground',
  card: 'card',
  muted: 'muted',
  mutedForeground: 'muted-foreground',
  primary: 'primary',
  primaryForeground: 'primary-foreground',
  border: 'border',
  destructive: 'destructive',
  danger: 'danger',
  success: 'success',
  warning: 'warning',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  water: 'water',
};

describe('cores', () => {
  it.each(Object.entries(TOKEN))('%s é o --%s do global.css', (chave, nome) => {
    const esperado = hslToRgb(token(nome));
    const atual = hexToRgb(cores[chave as keyof typeof TOKEN]);
    // O HSL do CSS é arredondado a inteiros; 2 de diferença por canal é arredondamento.
    atual.forEach((canal, i) => expect(Math.abs(canal - esperado[i])).toBeLessThanOrEqual(2));
  });
});

/**
 * As docs citam as cores em hex. `docs/MOBILE_PARITY.md` dizia gordura `#f43f5e`
 * enquanto o código, o PWA e o `DESIGN.md` usam `#ffb4ab`: quem seguisse a doc
 * pintaria a gordura de outra cor.
 */
describe('cores nas docs', () => {
  const docs = resolve(__dirname, '../../../../../docs');
  const design = readFileSync(resolve(docs, 'DESIGN.md'), 'utf8');
  const paridade = readFileSync(resolve(docs, 'MOBILE_PARITY.md'), 'utf8');

  it.each(Object.entries(TOKEN))('DESIGN.md: %s é o mesmo hex de cores.ts', (chave, nome) => {
    const linha = new RegExp(`^\\| \`${nome}\`[^|]*\\| \`(#[0-9a-f]{6})\``, 'im').exec(design);
    if (!linha) return; // token que a tabela não lista
    expect(linha[1].toLowerCase()).toBe(cores[chave as keyof typeof TOKEN].toLowerCase());
  });

  it('MOBILE_PARITY.md: as cores dos macros citadas são as de cores.ts', () => {
    const citadas = [...paridade.matchAll(/(proteína|carboidrato|gordura) `(#[0-9a-f]{6})`/gi)];
    expect(citadas.length).toBeGreaterThan(0);
    const porMacro = { proteína: cores.protein, carboidrato: cores.carbs, gordura: cores.fat };
    for (const [, macro, hex] of citadas) {
      expect({ macro, hex: hex.toLowerCase() }).toEqual({
        macro,
        hex: porMacro[macro.toLowerCase() as keyof typeof porMacro].toLowerCase(),
      });
    }
  });
});
