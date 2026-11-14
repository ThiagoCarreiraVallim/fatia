import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cssBlock, hslToHex, readCssTokens } from '@fatia/design';
import { colors, setColorsTheme, themeColors, type ColorName } from '../colors';

/** `colors.ts` é cópia em hex dos tokens; este teste impede que a cópia envelheça. */

const CSS = readFileSync(resolve(__dirname, '../../../global.css'), 'utf8');
const blocks = {
  // O NativeWind só reconhece a mídia `dark` como o escuro: no app o claro é o `:root` de fora.
  dark: readCssTokens(cssBlock(cssBlock(CSS, '@media (prefers-color-scheme: dark)'), ':root')),
  light: readCssTokens(cssBlock(CSS, ':root')),
};

const TOKEN: Record<Exclude<ColorName, 'placeholder'>, string> = {
  background: 'background',
  foreground: 'foreground',
  card: 'card',
  muted: 'muted',
  mutedForeground: 'muted-foreground',
  faintForeground: 'faint-foreground',
  surface3: 'surface-3',
  primary: 'primary',
  primaryText: 'primary-text',
  primaryForeground: 'primary-foreground',
  border: 'border',
  borderStrong: 'border-strong',
  destructive: 'destructive',
  danger: 'danger',
  success: 'success',
  warning: 'warning',
  info: 'info',
  kcal: 'kcal',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  water: 'water',
  steps: 'steps',
  brand: 'brand',
  brandForeground: 'brand-foreground',
};

function channels(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

describe.each(['dark', 'light'] as const)('colors (%s)', (theme) => {
  it.each(Object.entries(TOKEN))('%s é o --%s do global.css', (key, name) => {
    const css = blocks[theme][name];
    expect(css, `--${name}`).toBeDefined();
    const expected = channels(hslToHex(css));
    const actual = channels(themeColors[theme][key as keyof typeof TOKEN]);
    // O HSL do CSS tem uma casa decimal; 2 de diferença por canal é arredondamento.
    actual.forEach((c, i) => expect(Math.abs(c - expected[i])).toBeLessThanOrEqual(2));
  });
});

describe('colors segue o tema que está valendo', () => {
  afterEach(() => setColorsTheme('dark'));

  it('troca o valor lido sem trocar o objeto', () => {
    expect(colors.background).toBe(themeColors.dark.background);
    setColorsTheme('light');
    expect(colors.background).toBe(themeColors.light.background);
    expect(colors.primaryText).toBe('#1a7f00');
  });
});

/**
 * As docs citam as cores em hex. `docs/MOBILE_PARITY.md` já disse gordura
 * `#f43f5e` enquanto o código usava `#ffb4ab`: quem seguisse a doc pintaria a
 * gordura de outra cor.
 */
describe('cores nas docs', () => {
  const docs = resolve(__dirname, '../../../../../docs');
  const design = readFileSync(resolve(docs, 'DESIGN.md'), 'utf8');
  const parity = readFileSync(resolve(docs, 'MOBILE_PARITY.md'), 'utf8');

  it.each(Object.entries(TOKEN))('DESIGN.md: %s é o mesmo hex nos dois temas', (key, name) => {
    const line = new RegExp(
      `^\\| \`${name}\`[^|]*\\| \`(#[0-9a-f]{6})\`[^|]*\\| \`(#[0-9a-f]{6})\``,
      'im',
    ).exec(design);
    if (!line) return; // token que a tabela não lista
    expect(line[1].toLowerCase()).toBe(themeColors.dark[key as keyof typeof TOKEN]);
    expect(line[2].toLowerCase()).toBe(themeColors.light[key as keyof typeof TOKEN]);
  });

  it('DESIGN.md lista a paleta com escuro e claro', () => {
    expect(design).toMatch(/^\| `background`/m);
    expect(design).toMatch(/^\| `protein`[^\n]*`#6ea3ff`[^\n]*`#2563eb`/im);
  });

  it('MOBILE_PARITY.md: as cores dos macros citadas são as de colors.ts', () => {
    const cited = [...parity.matchAll(/(proteína|carboidrato|gordura) `(#[0-9a-f]{6})`/gi)];
    expect(cited.length).toBeGreaterThan(0);
    const byMacro = {
      proteína: themeColors.dark.protein,
      carboidrato: themeColors.dark.carbs,
      gordura: themeColors.dark.fat,
    };
    for (const [, macro, hex] of cited) {
      expect({ macro, hex: hex.toLowerCase() }).toEqual({
        macro,
        hex: byMacro[macro.toLowerCase() as keyof typeof byMacro],
      });
    }
  });
});
