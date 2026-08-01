import { describe, expect, it } from 'vitest';
import { parseAmount } from '../parse';

describe('parseAmount', () => {
  it('aceita vírgula, que é o que o teclado decimal em pt-BR entrega', () => {
    expect(parseAmount('78,5')).toBe(78.5);
  });

  it('aceita ponto', () => {
    expect(parseAmount('78.5')).toBe(78.5);
  });

  it('ignora espaços em volta', () => {
    expect(parseAmount('  9500 ')).toBe(9500);
  });

  it('devolve null para vazio ou lixo', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});
