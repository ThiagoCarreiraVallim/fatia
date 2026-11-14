import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssBlock, hslToHex, readCssTokens } from '@fatia/design';

/**
 * A paleta do app nativo e a do PWA precisam ser a mesma (issue #118), nos dois
 * temas (ADR 041).
 *
 * Lê por bloco: o claro repete os nomes do escuro, e juntar o arquivo inteiro
 * faria o claro sobrescrever o escuro sem ninguém notar.
 */

const MOBILE = readFileSync(resolve(__dirname, '../../../global.css'), 'utf8');
const WEB = readFileSync(resolve(__dirname, '../../../../web/src/app/globals.css'), 'utf8');

const mobile = {
  dark: readCssTokens(cssBlock(MOBILE, ':root')),
  light: readCssTokens(cssBlock(cssBlock(MOBILE, '@media (prefers-color-scheme: light)'), ':root')),
};
const web = {
  dark: readCssTokens(cssBlock(WEB, ':root')),
  light: readCssTokens(cssBlock(WEB, ":root[data-theme='light']")),
};

const SHARED = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'primary-text',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'faint-foreground',
  'surface-3',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'border-strong',
  'input',
  'ring',
  'danger',
  'success',
  'warning',
  'info',
  'ok',
  'kcal',
  'protein',
  'carbs',
  'fat',
  'water',
  'steps',
  'brand',
  'brand-foreground',
];

describe('paleta', () => {
  it('lê tokens dos dois arquivos e dos dois temas — caminho errado não passa vazio', () => {
    for (const t of ['dark', 'light'] as const) {
      expect(Object.keys(mobile[t]).length).toBeGreaterThan(30);
      expect(Object.keys(web[t]).length).toBeGreaterThan(30);
    }
  });

  it('o escuro e o claro do app não são o mesmo bloco', () => {
    expect(mobile.light.background).not.toBe(mobile.dark.background);
  });

  it.each([
    ['dark', 'protein', '#6ea3ff'],
    ['dark', 'primary-foreground', '#0b1a05'],
    ['dark', 'border', '#383838'],
    ['light', 'carbs', '#1a7f00'],
    ['light', 'fat', '#b93a2e'],
    ['light', 'water', '#1a66c2'],
    ['light', 'steps', '#0e7468'],
  ] as const)('%s: --%s é %s (canvas)', (theme, token, hex) => {
    expect(hslToHex(mobile[theme][token])).toBe(hex);
  });

  it('o verde da marca é o mesmo', () => {
    expect(mobile.dark.primary).toBe(web.dark.primary);
    expect(mobile.light.primary).toBe(web.light.primary);
  });

  describe.each(['dark', 'light'] as const)('tema %s', (theme) => {
    it.each(SHARED)('--%s bate com o do PWA', (token) => {
      expect(mobile[theme][token]).toBeDefined();
      expect(mobile[theme][token]).toBe(web[theme][token]);
    });

    it('o app não ganha token que a web não tem', () => {
      const extras = Object.keys(mobile[theme]).filter((k) => !(k in web[theme]));
      expect(extras).toEqual([]);
    });
  });
});
