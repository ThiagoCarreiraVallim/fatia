'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, Plus, SlidersHorizontal } from 'lucide-react';
import {
  formatBRL,
  overdueSeatBanner,
  seatInvoiceRow,
  seatProgramRow,
  seatsApi,
  seatStatCards,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { PanelPageHead, PanelStat, PanelTable, StatusChip } from '@/components/org/panel-bits';
import { ProgramForm, SeatAdjustForm, apiErrorText } from '@/components/org/seat-forms';
import { useOptionalSidePanel, type SidePanelContent } from '@/components/org/side-panel';
import { Banner } from '@/components/ui/banner';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Assentos e faturas (#403, Pn-07 e Pn-07v), do lado do dono: os quatro
 * números, a faixa da fatura vencida com os dias da carência, as faturas, os
 * programas (PRO por período) e quem usa. Ajustar e criar programa abrem no
 * painel lateral. Falta de pagamento só pausa a IA; nada some.
 */
export default function OrgSeatsPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const painel = useOptionalSidePanel();
  const [emLinha, setEmLinha] = useState<SidePanelContent | null>(null);
  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
  const [compra, setCompra] = useState(5);
  const [documento, setDocumento] = useState('');
  const [cancelando, setCancelando] = useState(false);

  const visao = useQuery({ queryKey: orgKeys.seats(g.id), queryFn: () => seatsApi.get(g.id) });
  const faturas = useQuery({
    queryKey: orgKeys.invoices(g.id),
    queryFn: () => seatsApi.invoices(g.id),
  });

  const fechar = () => (painel ? painel.close() : setEmLinha(null));
  const abrir = (c: SidePanelContent) => (painel ? painel.open(c) : setEmLinha(c));

  const comprar = useMutation({
    mutationFn: () => seatsApi.checkout(g.id, compra, documento.replace(/\D/g, '')),
    onSuccess: (r) => {
      refrescar();
      if (r.pool?.paymentUrl) window.open(r.pool.paymentUrl, '_blank', 'noopener');
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para abrir a compra agora.')),
  });
  const cancelar = useMutation({
    mutationFn: () => seatsApi.cancel(g.id),
    onSuccess: () => {
      toast('Assentos cancelados.');
      setCancelando(false);
      fechar();
      refrescar();
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para cancelar agora.')),
  });
  const tirar = useMutation({
    mutationFn: (membershipId: string) => seatsApi.unassign(g.id, membershipId),
    onSuccess: refrescar,
    onError: (err) => toast(apiErrorText(err, 'Não deu para tirar o assento agora.')),
  });

  if (visao.isPending) return <Skeleton className="h-64 rounded-2xl bg-card" />;
  if (visao.isError) {
    return (
      <EmptyState
        title="Não deu para carregar os assentos"
        action={
          <Button variant="outline" onClick={() => visao.refetch()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  const v = visao.data;
  const pool = v.pool;
  const vivo = pool && pool.status !== 'CANCELED' && pool.status !== 'EXPIRED' ? pool : null;
  const podeAjustar =
    !!vivo && !vivo.manual && vivo.status !== 'PENDING' && !vivo.cancelAtPeriodEnd;
  const podePrograma = !!vivo && vivo.status === 'ACTIVE';
  const cartoes = seatStatCards(v);
  const faixa = overdueSeatBanner(v);

  const abrirAjuste = () =>
    abrir({
      title: 'Ajustar assentos',
      subtitle: `${v.assigned} em uso · ${formatBRL(v.unitPriceCents)} por assento`,
      body: (
        <SeatAdjustForm
          groupId={g.id}
          overview={v}
          onDone={fechar}
          onCancelSeats={() => setCancelando(true)}
        />
      ),
    });
  const abrirPrograma = () =>
    abrir({
      title: 'Novo programa',
      subtitle: 'PRO por um período, para uma turma ou um desafio',
      body: <ProgramForm groupId={g.id} unitPriceCents={v.unitPriceCents} onDone={fechar} />,
    });

  return (
    <div className="space-y-5">
      <PanelPageHead
        title="Assentos PRO"
        subtitle="A comunidade paga o PRO dos membros. Quem sai devolve o assento. Falta de pagamento nunca apaga registro nem histórico."
        action={
          podeAjustar && (
            <Button onClick={abrirAjuste} className="gap-1.5">
              <SlidersHorizontal size={16} aria-hidden /> Ajustar assentos
            </Button>
          )
        }
      />

      {faixa && (
        <Banner
          tone="warning"
          title={faixa.title}
          action={
            faixa.payUrl && (
              <a
                href={faixa.payUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ size: 'sm' })}
              >
                Pagar agora
              </a>
            )
          }
        >
          {faixa.text}
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

      {vivo ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <PanelStat label="Em uso" value={cartoes.inUse.value} sub={cartoes.inUse.sub} />
          <PanelStat
            label="Preço por assento"
            value={cartoes.price.value}
            sub={cartoes.price.sub}
          />
          <PanelStat label="Próxima fatura" value={cartoes.next.value} sub={cartoes.next.sub} />
          <PanelStat
            label="Pagamento"
            value={cartoes.payment.value}
            sub={cartoes.payment.sub}
            tone={cartoes.payment.tone}
          />
        </div>
      ) : (
        <form
          className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            comprar.mutate();
          }}
        >
          <h2 className="text-sm font-semibold">Comprar assentos</h2>
          <p className="text-sm text-muted-foreground">
            Cada assento dá o PRO (chat, foto e ditado com a IA) a um membro escolhido por você.{' '}
            {formatBRL(v.unitPriceCents)} por assento ao mês, sem mínimo.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="assentos-compra">Assentos</Label>
              <Input
                id="assentos-compra"
                inputMode="numeric"
                className="w-28"
                value={String(compra)}
                onChange={(e) =>
                  setCompra(Math.min(1000, Number(e.target.value.replace(/\D/g, '')) || 0))
                }
              />
            </div>
            <div className="min-w-48 flex-1 space-y-1">
              <Label htmlFor="documento">CPF ou CNPJ de quem paga</Label>
              <Input
                id="documento"
                inputMode="numeric"
                autoComplete="off"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            O documento vai só ao Asaas, para a cobrança. O Fatia não guarda.
          </p>
          {!v.webCheckout ? (
            <p className="text-sm text-muted-foreground">
              A compra pela web não está disponível nesta instalação.
            </p>
          ) : (
            <Button
              type="submit"
              disabled={comprar.isPending || compra < 1 || documento.replace(/\D/g, '').length < 11}
            >
              {comprar.isPending
                ? 'Abrindo...'
                : `Comprar por ${formatBRL(compra * v.unitPriceCents)}/mês`}
            </Button>
          )}
        </form>
      )}

      {vivo?.status === 'PENDING' && vivo.paymentUrl && (
        <a
          href={vivo.paymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
        >
          Pagar a primeira cobrança <ExternalLink size={14} aria-hidden />
        </a>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section aria-labelledby="faturas" className="min-w-0 space-y-2">
          <h2 id="faturas" className="text-base font-semibold">
            Faturas
          </h2>
          {faturas.data && faturas.data.length === 0 && (
            <p className="rounded-2xl border border-subtle bg-card p-4 text-sm text-muted-foreground">
              Nenhuma fatura ainda.
            </p>
          )}
          {faturas.data && faturas.data.length > 0 && (
            <PanelTable label="Faturas" head={['Fatura', 'Valor', 'Vencimento', 'Status', '']}>
              {faturas.data.map((f) => {
                const r = seatInvoiceRow(f);
                return (
                  <tr key={f.id} className={cn(r.muted && 'text-muted-foreground')}>
                    <td className="px-3 py-2">
                      <span className={cn('block', !r.muted && r.sub && 'font-semibold')}>
                        {r.title}
                      </span>
                      {r.sub && (
                        <span className="block text-xs text-muted-foreground">{r.sub}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <span className="block">{r.amount}</span>
                      {r.amountSub && (
                        <span className="block text-xs text-muted-foreground">{r.amountSub}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.due}</td>
                    <td className="px-3 py-2">
                      <StatusChip label={r.status.label} tone={r.status.tone} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {f.invoiceUrl && !r.muted && (
                        <a
                          href={f.invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Ver fatura de ${r.title}`}
                          className="inline-flex min-h-11 items-center gap-1 text-primary"
                        >
                          Ver <ExternalLink size={14} aria-hidden />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </PanelTable>
          )}
        </section>

        <section aria-labelledby="programas" className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="programas" className="text-base font-semibold">
                Programas
              </h2>
              <p className="text-xs text-muted-foreground">
                PRO por um período, para uma turma ou um desafio. No fim a pessoa volta ao Free sem
                perder nada.
              </p>
            </div>
            {podePrograma && (
              <Button variant="outline" size="sm" className="gap-1" onClick={abrirPrograma}>
                <Plus size={14} aria-hidden /> Novo programa
              </Button>
            )}
          </div>
          {v.programs.length === 0 ? (
            <p className="rounded-2xl border border-subtle bg-card p-4 text-sm text-muted-foreground">
              Nenhum programa. Use para dar PRO por um mês a uma turma ou a quem entrar num desafio.
            </p>
          ) : (
            <PanelTable
              label="Programas"
              head={['Programa', 'Assentos', 'Período', 'Valor', 'Status']}
            >
              {v.programs.map((p) => {
                const r = seatProgramRow(p);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <span className="block font-semibold">{r.name}</span>
                      {r.sub && (
                        <span className="block text-xs text-muted-foreground">{r.sub}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.seats}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r.period}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.amount}</td>
                    <td className="px-3 py-2">
                      <StatusChip label={r.status.label} tone={r.status.tone} />
                    </td>
                  </tr>
                );
              })}
            </PanelTable>
          )}
        </section>
      </div>

      {vivo && (
        <section aria-labelledby="quem" className="space-y-2">
          <h2 id="quem" className="text-base font-semibold">
            Quem usa
          </h2>
          {v.assignments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ninguém ainda. Dê assentos pela seção Membros.
            </p>
          ) : (
            <ul className="divide-y divide-subtle rounded-2xl border border-subtle bg-card">
              {v.assignments.map((a) => (
                <li key={a.membershipId} className="flex items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{a.name}</p>
                    {a.ownPro && (
                      <p className="text-xs text-muted-foreground">
                        Já paga o próprio PRO: o assento fica sem uso enquanto isso.
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={tirar.isPending}
                    onClick={() => tirar.mutate(a.membershipId)}
                  >
                    Tirar
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {v.pendingCharges.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {v.pendingCharges
                .map(
                  (c) =>
                    `Aumento de ${c.fromSeats} para ${c.toSeats}: ${formatBRL(c.amountCents)} em aberto`,
                )
                .join(' · ')}
            </p>
          )}
        </section>
      )}

      <ConfirmDialog
        open={cancelando}
        onOpenChange={setCancelando}
        title="Cancelar os assentos?"
        description="Os membros continuam com o PRO até o fim do período já pago. Depois, voltam ao Free sem perder nada."
        confirmLabel="Cancelar assentos"
        pendingLabel="Cancelando..."
        pending={cancelar.isPending}
        onConfirm={() => cancelar.mutate()}
      />
    </div>
  );
}
