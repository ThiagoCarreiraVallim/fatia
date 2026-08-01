import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A paleta do app nativo e a do PWA precisam ser a mesma (issue #118).
 *
 * "Precisa ser a mesma" só vira verdade se alguém verificar. Sem este teste, o
 * jeito de descobrir que o verde da marca mudou num lado e não no outro é
 * abrir os dois apps lado a lado — o que ninguém faz depois de trocar uma cor.
 */

const MOBILE = resolve(__dirname, '../../../global.css');
const WEB = resolve(__dirname, '../../../../web/src/app/globals.css');

/** Extrai `--nome: valor;` do bloco `:root`. */
function readTokens(file: string): Record<string, string> {
  const css = readFileSync(file, 'utf8');
  const tokens: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(/--([a-z-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

describe('paleta', () => {
  const mobile = readTokens(MOBILE);
  const web = readTokens(WEB);

  it('lê tokens dos dois arquivos — se um caminho mudar, o teste não pode passar vazio', () => {
    expect(Object.keys(mobile).length).toBeGreaterThan(10);
    expect(Object.keys(web).length).toBeGreaterThan(10);
  });

  it('o verde da marca é o mesmo', () => {
    expect(mobile.primary).toBe('108 100% 45%');
    expect(mobile.primary).toBe(web.primary);
  });

  it.each([
    'background',
    'foreground',
    'card',
    'card-foreground',
    'popover',
    'popover-foreground',
    'primary',
    'primary-foreground',
    'secondary',
    'secondary-foreground',
    'muted',
    'muted-foreground',
    'accent',
    'accent-foreground',
    'destructive',
    'destructive-foreground',
    'border',
    'input',
    'ring',
  ])('--%s bate com o do PWA', (token) => {
    expect(mobile[token]).toBeDefined();
    expect(mobile[token]).toBe(web[token]);
  });

  it('não deixa o mobile ganhar token que o web não tem', () => {
    // `--radius` fica de fora: no web é `0.75rem` (CSS), no mobile o raio vive
    // no tailwind.config.js em pontos, porque o React Native não tem rem.
    const extras = Object.keys(mobile).filter((k) => !(k in web));
    expect(extras).toEqual([]);
  });
});
