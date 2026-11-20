'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Link2, Plus, Send } from 'lucide-react';
import {
  duplicateOfferLabel,
  filterOffers,
  offerMeta,
  offerPriceLabel,
  offerReceives,
  offerRevenueSub,
  offersApi,
  offerStatusLabel,
  saleUrlLabel,
  shortPanelDate,
  type ChipTone,
  type OfferStatus,
  type OfferView,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { OfferForm } from '@/components/org/offer-form';
import { CountTabs, PanelPageHead, PanelStat, StatusChip } from '@/components/org/panel-bits';
import { apiErrorText } from '@/components/org/seat-forms';
import { useOptionalSidePanel, type SidePanelContent } from '@/components/org/side-panel';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

const VAZIO: Record<OfferStatus, string> = {
  ACTIVE: 'Nenhuma oferta ativa',
  DRAFT: 'Nenhum rascunho',
  CLOSED: 'Nenhuma oferta encerrada',
};

function tomDe(o: OfferView): ChipTone {
  if (o.status === 'CLOSED') return 'muted';
  if (o.status === 'DRAFT') return 'info';
  return o.failed.length > 0 ? 'warn' : 'ok';
}

/**
 * Ofertas (#403, Pn-37 e Pn-37b): o que a comunidade vende, com vendas,
 * receita, quem ativou nas 48 h e quem não pagou. Só o dono, só na web. A
 * venda pelo Asaas liga por instância (`salesEnabled`); até lá dá para
 * montar, publicar e copiar o link.
 */
export default function OrgOffersPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const painel = useOptionalSidePanel();
  const [emLinha, setEmLinha] = useState<SidePanelContent | null>(null);
  const [aba, setAba] = useState<OfferStatus>('ACTIVE');
  const [encerrando, setEncerrando] = useState<OfferView | null>(null);
  const q = useQuery({ queryKey: orgKeys.offers(g.id), queryFn: () => offersApi.list(g.id) });
  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.offers(g.id) });

  const fechar = () => (painel ? painel.close() : setEmLinha(null));
  const abrir = (c: SidePanelContent) => (painel ? painel.open(c) : setEmLinha(c));
  const abrirForm = (offer?: OfferView) =>
    abrir({
      title: offer ? 'Editar oferta' : 'Nova oferta',
      subtitle: offer ? offer.title : 'Começa como rascunho',
      body: <OfferForm groupId={g.id} offer={offer} onDone={fechar} />,
    });

  const acao = useMutation({
    mutationFn: ({ tipo, id }: { tipo: 'publish' | 'close' | 'duplicate'; id: string }) =>
      offersApi[tipo](g.id, id),
    onSuccess: (_o, { tipo }) => {
      toast(
        tipo === 'publish'
          ? 'Oferta publicada.'
          : tipo === 'close'
            ? 'Oferta encerrada.'
            : 'Rascunho criado com as datas do mês seguinte.',
      );
      setEncerrando(null);
      if (tipo === 'duplicate') setAba('DRAFT');
      refrescar();
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para mudar a oferta agora.')),
  });
  const reenviar = useMutation({
    mutationFn: ({ offerId, purchaseId }: { offerId: string; purchaseId: string }) =>
      offersApi.resendLink(g.id, offerId, purchaseId),
    onSuccess: (r) => {
      toast(r.sent ? 'Link de pagamento reenviado.' : 'Não deu para mandar o e-mail agora.');
      refrescar();
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para reenviar o link agora.')),
  });

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado.');
    } catch {
      toast('Não deu para copiar. Selecione o link e copie.');
    }
  };

  if (q.isPending) return <Skeleton className="h-64 rounded-2xl bg-card" />;
  if (q.isError) {
    return (
      <EmptyState
        title="Não deu para carregar as ofertas"
        action={
          <Button variant="outline" onClick={() => q.refetch()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  const { offers, salesEnabled, platformFeePercent } = q.data;
  const conta = (s: OfferStatus) => filterOffers(offers, s).length;
  const lista = filterOffers(offers, aba);

  return (
    <div className="space-y-4">
      <PanelPageHead
        title="Ofertas"
        subtitle="Programas vendidos pela comunidade. Pagamento pelo Asaas."
        action={
          <Button onClick={() => abrirForm()} className="gap-1.5">
            <Plus size={16} aria-hidden /> Nova oferta
          </Button>
        }
      />

      {!salesEnabled && (
        <Banner tone="info" title="A venda ainda não está ligada">
          Você já pode montar, publicar e copiar o link. O pagamento pelo Asaas abre quando a venda
          for ligada nesta instalação.
        </Banner>
      )}

      {emLinha && (
        <section
          aria-label={emLinha.title}
          className="flex flex-col overflow-hidden rounded-2xl border border-subtle bg-background"
        >
          <h2 className="border-b border-subtle px-4 py-3 text-sm font-semibold">
            {emLinha.title}
          </h2>
          {emLinha.body}
        </section>
      )}

      <CountTabs
        label="Estado"
        value={aba}
        onChange={setAba}
        tabs={[
          { key: 'ACTIVE', label: 'Ativas', count: conta('ACTIVE') },
          { key: 'DRAFT', label: 'Rascunhos', count: conta('DRAFT') },
          { key: 'CLOSED', label: 'Encerradas', count: conta('CLOSED') },
        ]}
      />

      {lista.length === 0 && (
        <p className="rounded-2xl border border-subtle bg-card p-4 text-sm text-muted-foreground">
          {VAZIO[aba]}
        </p>
      )}

      {lista.map((o) => (
        <div key={o.id} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <article
            aria-labelledby={`oferta-${o.id}`}
            className="min-w-0 space-y-4 rounded-2xl border border-subtle bg-card p-4"
          >
            <div className="flex gap-4">
              <div
                aria-hidden
                className="hidden h-20 w-20 shrink-0 rounded-xl bg-gradient-to-br from-orange-500 to-amber-950 sm:block"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={`oferta-${o.id}`} className="font-display text-lg font-bold">
                    {o.title}
                  </h2>
                  <StatusChip label={offerStatusLabel(o)} tone={tomDe(o)} />
                </div>
                {o.description && (
                  <p className="text-[13px] leading-snug text-muted-foreground">{o.description}</p>
                )}
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-2xl font-bold tabular-nums">
                    {offerPriceLabel(o.priceCents)}
                  </span>
                  <span className="text-xs text-muted-foreground">{offerMeta(o)}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
              <PanelStat
                label="Vendas"
                value={String(o.stats.sales)}
                sub={o.spots ? `de ${o.spots} vagas` : 'sem limite de vagas'}
              />
              <PanelStat
                label="Receita"
                value={offerPriceLabel(o.stats.revenueCents)}
                sub={offerRevenueSub(o, platformFeePercent)}
              />
            </div>

            <div className="rounded-xl border border-subtle p-3">
              <h3 className="text-sm font-semibold">O que a pessoa recebe</h3>
              <p className="text-xs text-muted-foreground">{offerReceives(o)}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {o.status === 'DRAFT' && (
                <Button
                  size="sm"
                  disabled={acao.isPending}
                  onClick={() => acao.mutate({ tipo: 'publish', id: o.id })}
                >
                  Publicar
                </Button>
              )}
              {o.status !== 'CLOSED' && (
                <Button size="sm" variant="outline" onClick={() => abrirForm(o)}>
                  Editar
                </Button>
              )}
              {o.status === 'ACTIVE' && (
                <Button size="sm" variant="ghost" onClick={() => setEncerrando(o)}>
                  Encerrar
                </Button>
              )}
              {o.status === 'CLOSED' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acao.isPending}
                  onClick={() => acao.mutate({ tipo: 'duplicate', id: o.id })}
                >
                  {duplicateOfferLabel(o)}
                </Button>
              )}
            </div>
          </article>

          <div className="min-w-0 space-y-4">
            {o.failed.length > 0 && (
              <section
                aria-labelledby={`falhou-${o.id}`}
                className="space-y-3 rounded-2xl border border-[hsl(var(--danger)/0.5)] bg-card p-4"
              >
                <h3 id={`falhou-${o.id}`} className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle size={16} aria-hidden className="text-danger" />
                  {`Pagamento falhou · ${o.failed.length} ${o.failed.length === 1 ? 'pessoa' : 'pessoas'}`}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Elas não recebem o conteúdo novo até pagar. O que já registraram continua com
                  elas.
                </p>
                <ul className="divide-y divide-subtle rounded-xl border border-subtle text-sm">
                  {o.failed.map((f) => (
                    <li key={f.purchaseId} className="flex items-center gap-2 py-1 pl-3 pr-1">
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      {f.since && (
                        <span className="text-xs text-muted-foreground">
                          {shortPanelDate(f.since)}
                        </span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Reenviar link de pagamento a ${f.name}`}
                        title={f.canResend ? 'Reenviar link de pagamento' : 'Reenviado há pouco'}
                        disabled={!f.canResend || reenviar.isPending}
                        onClick={() => reenviar.mutate({ offerId: o.id, purchaseId: f.purchaseId })}
                      >
                        <Send size={16} aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2 rounded-2xl border border-subtle bg-card p-4">
              <h3 className="text-sm font-semibold">Página de venda</h3>
              <p className="break-all text-xs text-muted-foreground">{saleUrlLabel(o.saleUrl)}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => void copiar(o.saleUrl)}
              >
                <Link2 size={14} aria-hidden /> Copiar link
              </Button>
            </section>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={encerrando !== null}
        onOpenChange={(v) => !v && setEncerrando(null)}
        title="Encerrar a oferta?"
        description="Ninguém mais compra. Quem comprou continua com o que recebeu."
        confirmLabel="Encerrar"
        pendingLabel="Encerrando..."
        pending={acao.isPending}
        onConfirm={() => encerrando && acao.mutate({ tipo: 'close', id: encerrando.id })}
      />
    </div>
  );
}
