/**
 * A pílula clara da aba ativa (item 6), sem Reanimated, para testar no Node.
 *
 * O efeito "líquido" sai de duas molas: a borda na direção do movimento é
 * dura e sai na frente; a de trás é mole e chega depois. No caminho a pílula
 * estica; no fim, as duas se encontram na largura de uma aba.
 */
export const PILL_SPRING = {
  lead: { stiffness: 420, damping: 34, mass: 1 },
  trail: { stiffness: 170, damping: 22, mass: 1 },
} as const;

export type PillSpring = (typeof PILL_SPRING)[keyof typeof PILL_SPRING];

/** Qual mola vai em cada borda, indo da aba `from` para a `to`. */
export function pillEdgeSprings(from: number, to: number): { left: PillSpring; right: PillSpring } {
  return to >= from
    ? { left: PILL_SPRING.trail, right: PILL_SPRING.lead }
    : { left: PILL_SPRING.lead, right: PILL_SPRING.trail };
}

/**
 * Posição e largura da pílula, com as bordas em "abas" (0 = primeira). A
 * borda esquerda é o começo da aba `left`; a direita, o fim da aba `right`.
 */
export function pillRect(left: number, right: number, slot: number): { x: number; width: number } {
  'worklet';
  return {
    x: Math.min(left, right) * slot,
    width: (Math.max(right - left, 0) + 1) * slot,
  };
}
