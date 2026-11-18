import { describe, expect, it } from 'vitest';
import { keyboardOverlap } from '../keyboard-overlap';

/**
 * No Android edge-to-edge a janela não encolhe com o teclado: o chat precisa empurrar o campo
 * sozinho, pelo quanto o teclado invade a área da tela (conferência da etapa 6, #384).
 */
describe('keyboardOverlap — quanto o teclado cobre da tela do chat', () => {
  it('teclado acima do fim da tela: a diferença', () => {
    // Tela vai até 800 (o resto é a área segura), teclado começa em 500.
    expect(keyboardOverlap({ y: 0, height: 800 }, 500)).toBe(300);
  });
  it('desconta onde a tela começa na janela', () => {
    expect(keyboardOverlap({ y: 100, height: 700 }, 500)).toBe(300);
  });
  it('teclado fechado ou abaixo da tela: nada', () => {
    expect(keyboardOverlap({ y: 0, height: 800 }, null)).toBe(0);
    expect(keyboardOverlap({ y: 0, height: 800 }, 900)).toBe(0);
  });
});
