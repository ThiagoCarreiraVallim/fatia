import { describe, expect, it } from 'vitest';
import { PILL_SPRING, pillEdgeSprings, pillRect } from '../tab-pill';

/**
 * A pílula da aba ativa (item 6): as duas bordas andam com molas diferentes. A
 * da frente (na direção do movimento) é rápida e a de trás, mole; no meio do
 * caminho a pílula estica e, no fim, se acomoda na largura de uma aba.
 */
describe('pillEdgeSprings', () => {
  it('indo para a direita, a borda direita puxa e a esquerda vem atrás', () => {
    expect(pillEdgeSprings(0, 3)).toEqual({ left: PILL_SPRING.trail, right: PILL_SPRING.lead });
  });

  it('indo para a esquerda, o contrário', () => {
    expect(pillEdgeSprings(4, 1)).toEqual({ left: PILL_SPRING.lead, right: PILL_SPRING.trail });
  });

  it('a borda da frente é mais dura que a de trás', () => {
    expect(PILL_SPRING.lead.stiffness).toBeGreaterThan(PILL_SPRING.trail.stiffness);
  });
});

describe('pillRect', () => {
  const slot = 60;

  it('parada, ocupa uma aba', () => {
    expect(pillRect(2, 2, slot)).toEqual({ x: 120, width: 60 });
  });

  it('no meio do caminho, estica entre as duas bordas', () => {
    expect(pillRect(1, 3, slot)).toEqual({ x: 60, width: 180 });
  });

  it('bordas trocadas (mola passou do ponto) não dão largura negativa', () => {
    expect(pillRect(2.2, 2, slot)).toEqual({ x: 120, width: 60 });
  });
});
