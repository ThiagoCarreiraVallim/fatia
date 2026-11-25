/**
 * A prévia do treino (#484) pedida por alguma tela.
 *
 * Tocar num exercício abre o "Como fazer", que é uma tela. A folha mora no
 * layout, por cima de tudo, então ela sai da frente (`away`) e volta quando a
 * pessoa volta para a tela de onde abriu.
 */
export interface PreviewRequest {
  planId: string;
  /** Saiu para o "Como fazer": de onde (`from`), para onde (`to`) e se já chegou lá. */
  away?: { from: string; to: string; arrived: boolean };
}

/**
 * O pedido depois de a rota mudar para `pathname`:
 * - ainda na origem, antes de a navegação acontecer: espera;
 * - chegou no "Como fazer": marca que chegou;
 * - voltou para a origem depois de chegar: a prévia reabre;
 * - foi para qualquer outro lugar: a prévia é esquecida.
 *
 * Devolve o mesmo objeto quando nada muda, para o ajuste durante o render.
 */
export function previewAfterNavigation(
  request: PreviewRequest | null,
  pathname: string,
): PreviewRequest | null {
  if (!request?.away) return request;
  const { from, to, arrived } = request.away;
  if (pathname === to) return arrived ? request : { ...request, away: { from, to, arrived: true } };
  if (pathname === from) return arrived ? { planId: request.planId } : request;
  return null;
}
