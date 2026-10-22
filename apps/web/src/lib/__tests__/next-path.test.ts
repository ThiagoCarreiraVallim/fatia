import { describe, expect, it } from 'vitest';
import { safeNextPath, signInHref } from '../next-path';

describe('safeNextPath', () => {
  it.each([
    ['/c/abc_-1', '/c/abc_-1'],
    ['/community/g1?aba=x', '/community/g1?aba=x'],
    ['/', '/'],
  ])('aceita o caminho do app %s', (raw, esperado) => {
    expect(safeNextPath(raw)).toBe(esperado);
  });

  it.each([
    [null],
    [''],
    ['//evil.example'],
    ['/\\evil.example'],
    ['https://evil.example'],
    ['javascript:alert(1)'],
    ['c/sem-barra'],
    ['/linha\nquebrada'],
    [`/${'a'.repeat(600)}`],
  ])('recusa %j', (raw) => {
    expect(safeNextPath(raw)).toBeNull();
  });
});

describe('signInHref', () => {
  it('leva a tela e o retorno', () => {
    expect(signInHref(null)).toBe('/api/logto/sign-in');
    expect(signInHref('/c/tok')).toBe('/api/logto/sign-in?next=%2Fc%2Ftok');
    expect(signInHref('/c/tok', 'cadastro')).toBe(
      '/api/logto/sign-in?tela=cadastro&next=%2Fc%2Ftok',
    );
  });
});
