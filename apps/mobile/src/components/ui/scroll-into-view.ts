/**
 * Onde rolar uma faixa horizontal para o item escolhido ficar no meio dela
 * (#478: o chip ativo do filtro de nutrientes). Preso entre o começo e o fim do
 * conteúdo, para não sobrar faixa vazia de nenhum lado.
 */
export function centeredScrollX(
  item: { x: number; width: number },
  viewport: number,
  content: number,
): number {
  const max = Math.max(0, content - viewport);
  const centered = item.x + item.width / 2 - viewport / 2;
  return Math.round(Math.min(max, Math.max(0, centered)));
}
