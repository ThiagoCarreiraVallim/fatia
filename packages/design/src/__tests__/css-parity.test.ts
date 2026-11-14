import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast';
import { SOFT_TOKENS, THEMES, TOKEN_NAMES, palettes, type Theme } from '../tokens';
import { cssBlock, hslToHex, readCssTokens } from '../css';

/**
 * Os três CSS (web, app, site) repetem os tokens em HSL. Este teste confere cada
 * um contra `tokens.ts`, nos dois temas: mudar uma cor num lado só quebra aqui.
 */
const ROOT = resolve(__dirname, '../../../..');
const FILES = {
  web: resolve(ROOT, 'apps/web/src/app/globals.css'),
  mobile: resolve(ROOT, 'apps/mobile/global.css'),
  site: resolve(ROOT, 'apps/site/src/styles/global.css'),
} as const;

/** Onde mora o bloco claro em cada arquivo. */
const LIGHT_SELECTOR = {
  web: ":root[data-theme='light']",
  mobile: '@media (prefers-color-scheme: light)',
  site: '@media (prefers-color-scheme: light)',
} as const;

function tokensOf(app: keyof typeof FILES, theme: Theme): Record<string, string> {
  const css = readFileSync(FILES[app], 'utf8');
  if (theme === 'dark') return readCssTokens(cssBlock(css, ':root'));
  const light = cssBlock(css, LIGHT_SELECTOR[app]);
  // No app e no site o claro é um `:root` dentro da mídia.
  return readCssTokens(app === 'web' ? light : cssBlock(light, ':root'));
}

/** Diferença por canal entre um "H S% L%" do CSS e o hex do tokens.ts. */
function sameColor(hsl: string, hex: string): boolean {
  return contrastRatio(hslToHex(hsl), hex) < 1.02;
}

describe.each(Object.keys(FILES) as (keyof typeof FILES)[])('%s', (app) => {
  it.each(THEMES)('tem todos os tokens no tema %s, com o valor de tokens.ts', (theme) => {
    const css = tokensOf(app, theme);
    for (const name of TOKEN_NAMES) {
      expect(css[name], `--${name} (${theme})`).toBeDefined();
      expect(
        sameColor(css[name].split('/')[0].trim(), palettes[theme][name]),
        `--${name} (${theme}) = ${css[name]}`,
      ).toBe(true);
    }
  });

  it('o bloco claro tem exatamente os mesmos nomes do escuro', () => {
    const d = Object.keys(tokensOf(app, 'dark')).filter((k) => k !== 'radius');
    const l = Object.keys(tokensOf(app, 'light'));
    expect(l.sort()).toEqual(d.sort());
  });
});

describe('web', () => {
  const css = readFileSync(FILES.web, 'utf8');

  it('o claro pela mídia (sem escolha manual) é igual ao do data-theme', () => {
    const media = readCssTokens(
      cssBlock(
        cssBlock(css, '@media (prefers-color-scheme: light)'),
        ":root:not([data-theme='dark'])",
      ),
    );
    expect(media).toEqual(tokensOf('web', 'light'));
  });

  it.each(Object.keys(SOFT_TOKENS))('--%s translúcido existe nos dois temas', (name) => {
    expect(tokensOf('web', 'dark')[name]).toMatch(/\//);
    expect(tokensOf('web', 'light')[name]).toMatch(/\//);
  });

  it('não fixa mais o tema escuro no <html>', () => {
    const layout = readFileSync(resolve(ROOT, 'apps/web/src/app/layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/className="dark"/);
  });
});

describe('o app não tem token que a web não tem', () => {
  it.each(THEMES)('tema %s', (theme) => {
    const web = tokensOf('web', theme);
    const extras = Object.keys(tokensOf('mobile', theme)).filter((k) => !(k in web));
    expect(extras).toEqual([]);
  });
});
