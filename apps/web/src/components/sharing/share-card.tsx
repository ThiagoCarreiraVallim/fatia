'use client';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * O que um cartão de compartilhar pode mostrar (prancha Compartilhar). A lista
 * é fechada de propósito: peso, medidas, fotos do corpo e % de gordura não
 * entram em nenhum cartão — não existe prop para eles, e o teste garante.
 */
export interface ShareCardData {
  kind: 'streak' | 'workout' | 'challenge' | 'day';
  /** O número grande ("12 dias", "5.400 kg", "3º lugar"). */
  headline: string;
  /** Uma linha de contexto ("Sequência de registro"). */
  caption: string;
  /** Até três pares rótulo/valor (séries, tempo, refeições). Nada do corpo. */
  stats?: { label: string; value: string }[];
}

/** Como a pessoa aparece no cartão: nome de exibição, @ ou ninguém. */
export type ShareIdentity =
  { as: 'name'; value: string } | { as: 'handle'; value: string } | { as: 'none' };

export const SHARE_CARD_FIELDS = ['kind', 'headline', 'caption', 'stats'] as const;

export function ShareCard({
  data,
  identity,
  className,
}: {
  data: ShareCardData;
  identity: ShareIdentity;
  className?: string;
}) {
  const who =
    identity.as === 'name'
      ? identity.value
      : identity.as === 'handle'
        ? `@${identity.value}`
        : null;
  return (
    <figure
      aria-label={`${data.caption}: ${data.headline}`}
      className={cn(
        'relative flex aspect-[4/5] w-full max-w-[320px] flex-col justify-between overflow-hidden rounded-card bg-[#131313] p-6 text-white',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
        fatia
      </div>
      <div>
        <p className="font-display text-[44px] font-bold leading-none tracking-tight">
          {data.headline}
        </p>
        <figcaption className="mt-2 text-sm text-white/70">{data.caption}</figcaption>
        {data.stats && data.stats.length > 0 && (
          <dl className="mt-5 grid grid-cols-3 gap-2">
            {data.stats.slice(0, 3).map((s) => (
              <div key={s.label}>
                <dt className="text-[11px] text-white/60">{s.label}</dt>
                <dd className="font-display text-base font-bold">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-white/70">
        <span>{who ?? ''}</span>
        <Icon name="share" size={16} />
      </div>
    </figure>
  );
}
