import { describe, expect, it } from 'vitest';
import { centeredScrollX } from '../scroll-into-view';

describe('centeredScrollX (#478)', () => {
  it('centraliza o chip escolhido na faixa', () => {
    // chip de 80 px em x=400, faixa de 360 px: o centro do chip (440) vai para 180
    expect(centeredScrollX({ x: 400, width: 80 }, 360, 1000)).toBe(260);
  });

  it('não rola para antes do começo', () => {
    expect(centeredScrollX({ x: 20, width: 60 }, 360, 1000)).toBe(0);
  });

  it('não passa do fim do conteúdo', () => {
    expect(centeredScrollX({ x: 920, width: 80 }, 360, 1000)).toBe(640);
  });

  it('conteúdo menor que a faixa não rola', () => {
    expect(centeredScrollX({ x: 200, width: 80 }, 360, 300)).toBe(0);
  });
});
