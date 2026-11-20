'use client';

import Link from 'next/link';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link2, QrCode } from 'lucide-react';
import {
  ApiError,
  ORIGINS_PERIODS,
  SMALL_SAMPLE,
  originKindLabel,
  originRowName,
  panelHref,
  reportApi,
  type OriginsDays,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const num = (n: number) => n.toLocaleString('pt-BR');

/**
 * Origem dos convites (#400, Pn-25): de onde vem quem entra (links e QRs com
 * nome) e quantos fazem o 1º registro em 48 h. Só contagem: nada de nome nem
 * dado de saúde, e origem com menos de 5 pessoas fica oculta (a API decide).
 */
export default function OriginsPage() {
  const g = useOrgGroup();
  const [days, setDays] = useState<OriginsDays>(30);
  const q = useQuery({
    queryKey: orgKeys.inviteOrigins(g.id, days),
    queryFn: () => reportApi.origins(g.id, days),
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  const criar = `${panelHref(g.id, 'invites')}?novo=link`;

  const cards = d
    ? [
        {
          label: 'Entraram',
          value: d.joined === null ? null : num(d.joined),
          sub: 'pelo link ou QR no período',
        },
        {
          label: 'Ativaram em 48 h',
          value: d.activated === null ? null : num(d.activated),
          sub: 'fizeram o 1º registro',
        },
        {
          label: 'Taxa de ativação',
          value: d.percent === null ? null : `${d.percent}%`,
          sub: 'só aparece com 5 pessoas ou mais',
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-64 flex-1">
          <h1 className="font-display text-xl font-bold">Origem dos convites</h1>
          <p className="text-sm text-muted-foreground">
            De onde vem quem entra e quem começa a registrar em 48 h.
          </p>
        </div>
        <Link
          href={panelHref(g.id, 'invites')}
          className={cn(buttonVariants({ variant: 'outline' }), 'gap-1')}
        >
          <Link2 size={16} aria-hidden /> Links e QRs
        </Link>
        <div role="radiogroup" aria-label="Período" className="flex rounded-lg bg-muted p-0.5">
          {ORIGINS_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={days === p.value}
              onClick={() => setDays(p.value)}
              className={cn(
                'min-h-9 rounded-md px-3 text-xs font-semibold',
                days === p.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {q.isPending && <Skeleton className="h-48 rounded-2xl bg-card" />}
      {q.isError && !d && (
        <ErrorState
          message={
            q.error instanceof ApiError && q.error.status < 500 && q.error.message
              ? q.error.message
              : 'Não deu para carregar as origens agora.'
          }
          onRetry={() => void q.refetch()}
        />
      )}

      {d && d.rows.length === 0 && (
        <EmptyState
          icon={QrCode}
          title="Ainda sem dados"
          description="Dê um nome a cada link ou QR (recepção, Instagram, site) ao criar o convite. Quem entrar por eles aparece aqui."
          action={
            <Link href={criar} className={buttonVariants()}>
              Criar link com nome
            </Link>
          }
        />
      )}

      {d && d.rows.length > 0 && (
        <>
          <ul aria-label="Resumo das origens" className="grid gap-2 sm:grid-cols-3">
            {cards.map((k) => (
              <li key={k.label} className="space-y-1 rounded-2xl border border-subtle bg-card p-3">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                {k.value === null ? (
                  <p className="text-xs text-muted-foreground">{SMALL_SAMPLE}</p>
                ) : (
                  <p className="font-display text-2xl font-bold">{k.value}</p>
                )}
                <p className="text-xs text-muted-foreground">{k.sub}</p>
              </li>
            ))}
          </ul>

          <div className="overflow-x-auto rounded-2xl border border-subtle bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">Origem</th>
                  <th className="p-3 font-medium">Tipo</th>
                  <th className="p-3 font-medium">Entraram</th>
                  <th className="p-3 font-medium">Ativaram em 48 h</th>
                  <th className="p-3 font-medium">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((o) => (
                  <tr key={o.key} className="border-b border-subtle last:border-0">
                    <td className="p-3 font-semibold">{originRowName(o)}</td>
                    <td className="p-3 text-muted-foreground">{originKindLabel(o.kind)}</td>
                    <td className="p-3 tabular-nums">{o.joined === null ? '—' : num(o.joined)}</td>
                    <td className="p-3 tabular-nums">
                      {o.activated === null ? '—' : num(o.activated)}
                    </td>
                    <td className="p-3">
                      {o.percent === null ? (
                        <span className="text-xs text-muted-foreground">{SMALL_SAMPLE}</span>
                      ) : (
                        <b className="tabular-nums">{`${o.percent}%`}</b>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Contamos só quem entrou e quanto ativou. Nada de nome, nada de dado de saúde. Origens com
        menos de 5 pessoas entram juntas em &quot;Outras origens&quot;, sem nome, ou não aparecem.
      </p>
    </div>
  );
}
