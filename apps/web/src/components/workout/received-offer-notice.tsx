'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { initialsOf, planOffersApi, receivedOfferBanner } from '@fatia/api-client';

export const PLAN_OFFERS_KEY = ['plan-offers'] as const;

/**
 * O aviso de plano recebido no topo do Treino (prancha Al-T1, #379): um por
 * plano esperando resposta, e o toque abre o plano para aceitar ou recusar.
 * Sem nada pendente, não ocupa espaço.
 */
export function ReceivedOfferNotice() {
  const offers = useQuery({ queryKey: PLAN_OFFERS_KEY, queryFn: () => planOffersApi.list() });
  const pending = offers.data?.pending ?? [];
  if (pending.length === 0) return null;
  return (
    <div className="space-y-2">
      {pending.map((offer) => {
        const banner = receivedOfferBanner(offer);
        return (
          <Link
            key={offer.id}
            href={offer.href}
            className="anim-press flex items-center gap-3 rounded-card bg-card px-3.5 py-3 shadow-[inset_0_0_0_1px_hsl(var(--water)/0.35)]"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--water)/0.18)] text-[11px] font-extrabold text-water"
            >
              {initialsOf(offer.authorName)}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm">{banner.title}</b>
              <span className="block truncate text-xs text-muted-foreground">{banner.sub}</span>
            </span>
            <span className="inline-flex h-[22px] shrink-0 items-center rounded-pill bg-[hsl(var(--info)/0.1)] px-[9px] text-[11px] font-extrabold uppercase tracking-[0.04em] text-info">
              {offer.kind === 'update' ? 'nova versão' : 'novo'}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
