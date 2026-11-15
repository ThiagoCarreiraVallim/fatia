import { receivedOfferBanner, type PlanOfferSummary } from '@fatia/api-client';

/**
 * Contas do plano recebido no app (#379) que não dependem de tela. O estágio
 * da resposta e os botões de baixo moram no api-client (`offerStage`,
 * `offerActions`), iguais no web.
 */

/** O aviso no topo do Treino: a oferta mais recente, e quantas mais esperam. */
export function pendingOfferBanner(pending: PlanOfferSummary[]): {
  title: string;
  sub: string;
  href: string;
  authorName: string | null;
} | null {
  const first = pending[0];
  if (!first) return null;
  const copy = receivedOfferBanner(first);
  const more = pending.length - 1;
  return {
    title: copy.title,
    sub: more > 0 ? `${copy.sub} · mais ${more} esperando` : copy.sub,
    href: first.href,
    authorName: first.authorName,
  };
}

/** O fuso do aparelho, para "hoje 09:12" no remetente. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}
