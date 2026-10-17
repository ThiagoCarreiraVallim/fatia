'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  insightsApi,
  orgApi,
  panelHref,
  pendingRequests,
  seatSummary,
  seatsApi,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { InsightsCard } from '@/components/org/insights-card';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { orgKeys } from '@/components/community/query-keys';
import { Skeleton } from '@/components/ui/skeleton';

function Numero({
  titulo,
  valor,
  detalhe,
  href,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  href?: string;
}) {
  const corpo = (
    <>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </>
  );
  const classe = 'block rounded-2xl border border-subtle bg-card p-4';
  return href ? (
    <Link href={href} className={`${classe} hover:bg-accent/40`}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

/**
 * Visão geral do painel: os números da comunidade e, para o dono, o painel
 * agregado de retenção (e o de comportamento, quando o add-on está ligado).
 */
export default function OrgOverviewPage() {
  const g = useOrgGroup();
  const dono = g.role === 'OWNER';
  useTopBarTitle(g.name);

  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });
  const convites = useQuery({
    queryKey: orgKeys.invites(g.id),
    queryFn: () => orgApi.invites(g.id),
  });
  const assentos = useQuery({
    queryKey: orgKeys.seats(g.id),
    queryFn: () => seatsApi.get(g.id),
    enabled: dono,
  });
  const paineis = useQuery({
    queryKey: orgKeys.insightsPanels(g.id),
    queryFn: () => insightsApi.panels(g.id),
    enabled: dono,
  });

  const lista = membros.data ?? [];
  const ativos = lista.filter((m) => m.status === 'ACTIVE').length;
  const pedidos = pendingRequests(lista).length;
  const compartilhando = lista.filter((m) => (m.scopesGrantedToMe?.length ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      {membros.isPending ? (
        <Skeleton className="h-24 rounded-2xl bg-card" />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero
            titulo="Membros ativos"
            valor={String(ativos)}
            href={panelHref(g.id, 'members')}
          />
          <Numero
            titulo="Pedidos aguardando"
            valor={String(pedidos)}
            detalhe={pedidos > 0 && dono ? 'Toque para aprovar' : undefined}
            href={`${panelHref(g.id, 'members')}?filtro=pending`}
          />
          <Numero
            titulo="Compartilham com você"
            valor={String(compartilhando)}
            detalhe="ao menos uma categoria"
          />
          {dono ? (
            <Numero
              titulo="Assentos PRO"
              valor={
                assentos.data?.pool ? `${assentos.data.assigned}/${assentos.data.pool.seats}` : '0'
              }
              detalhe={assentos.data ? seatSummary(assentos.data) : undefined}
              href={panelHref(g.id, 'seats')}
            />
          ) : (
            <Numero
              titulo="Convites abertos"
              valor={String(convites.data?.length ?? 0)}
              href={panelHref(g.id, 'invites')}
            />
          )}
        </div>
      )}

      {dono && (
        <div className="grid gap-4 lg:grid-cols-2">
          <InsightsCard groupId={g.id} panel="retention" title="Retenção" />
          {paineis.data?.behavior && (
            <InsightsCard groupId={g.id} panel="behavior" title="Comportamento" exportable />
          )}
        </div>
      )}

      {!dono && (
        <p className="text-xs text-muted-foreground">
          Os números agregados da comunidade são do dono. Você vê cada membro pelo que ele
          compartilha com você, em Membros.
        </p>
      )}
    </div>
  );
}
