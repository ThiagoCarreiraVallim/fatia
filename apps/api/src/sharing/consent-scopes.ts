import { ShareScope } from '@fatia/db';

/**
 * Remove repetições mantendo a ordem do enum. Ordem estável importa porque o
 * array vai para o banco e volta para a UI — duas concessões idênticas
 * produzirem arrays diferentes faria "mudou alguma coisa?" virar chute.
 */
export function normalizarEscopos(scopes: ShareScope[]): ShareScope[] {
  const pedidos = new Set(scopes);
  return Object.values(ShareScope).filter((scope) => pedidos.has(scope));
}
