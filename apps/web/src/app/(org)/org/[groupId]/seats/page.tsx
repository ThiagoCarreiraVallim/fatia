'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Crown, ExternalLink, Receipt } from 'lucide-react';
import {
  ApiError,
  formatBRL,
  invoiceStatusLabel,
  orgApi,
  poolStatusLabel,
  seatChangeHint,
  seatSummary,
  seatsApi,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

const dia = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(iso))
    .replace('.', '');

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

function Quantidade({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      className="w-28"
      value={String(value)}
      onChange={(e) => onChange(Math.min(1000, Number(e.target.value.replace(/\D/g, '')) || 0))}
    />
  );
}

/**
 * Assentos de IA pagos pela comunidade (ADR 025), do lado do dono: comprar,
 * aumentar (vale na hora, com cobrança proporcional), reduzir (na renovação),
 * cancelar, quem usa e as faturas.
 */
export default function OrgSeatsPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
  const [compra, setCompra] = useState(5);
  const [documento, setDocumento] = useState('');
  const [nova, setNova] = useState<number | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const visao = useQuery({ queryKey: orgKeys.seats(g.id), queryFn: () => seatsApi.get(g.id) });
  const faturas = useQuery({
    queryKey: orgKeys.invoices(g.id),
    queryFn: () => seatsApi.invoices(g.id),
  });
  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });

  const comprar = useMutation({
    mutationFn: () => seatsApi.checkout(g.id, compra, documento.replace(/\D/g, '')),
    onSuccess: (r) => {
      refrescar();
      if (r.pool?.paymentUrl) window.open(r.pool.paymentUrl, '_blank', 'noopener');
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para abrir a compra agora.')),
  });
  const ajustar = useMutation({
    mutationFn: (seats: number) => seatsApi.update(g.id, seats),
    onSuccess: () => {
      toast('Assentos atualizados.');
      setNova(null);
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para mudar os assentos agora.')),
  });
  const cancelar = useMutation({
    mutationFn: () => seatsApi.cancel(g.id),
    onSuccess: () => {
      toast('Assentos cancelados.');
      setCancelando(false);
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para cancelar agora.')),
  });
  const tirar = useMutation({
    mutationFn: (membershipId: string) => seatsApi.unassign(g.id, membershipId),
    onSuccess: refrescar,
    onError: (err) => toast(erroDaApi(err, 'Não deu para tirar o assento agora.')),
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
  const vivo = pool && pool.status !== 'CANCELED' && pool.status !== 'EXPIRED';
  const quantidade = nova ?? pool?.seats ?? 1;
  const dica = vivo ? seatChangeHint(v, quantidade) : null;
  const ativos = (membros.data ?? []).filter((m) => m.status === 'ACTIVE');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section
        aria-labelledby="resumo"
        className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
      >
        <h2 id="resumo" className="flex items-center gap-2 text-sm font-semibold">
          <Crown size={16} aria-hidden /> Assentos PRO
        </h2>
        <p className="text-lg font-bold">{seatSummary(v)}</p>
        {vivo && pool && (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              <Badge variant={pool.status === 'PAST_DUE' ? 'destructive' : 'secondary'}>
                {poolStatusLabel(pool.status)}
              </Badge>
            </p>
            {pool.manual && <p>Cortesia: sem cobrança.</p>}
            {pool.currentPeriodEnd && !pool.manual && (
              <p>
                {pool.cancelAtPeriodEnd
                  ? `Cancelados: valem até ${dia(pool.currentPeriodEnd)}.`
                  : `Próxima cobrança em ${dia(pool.currentPeriodEnd)}${pool.nextMonthlyCents !== pool.monthlyCents ? `, de ${formatBRL(pool.nextMonthlyCents)}` : ''}.`}
              </p>
            )}
            {pool.nextPeriodSeats !== null && <p>Na renovação, passam a {pool.nextPeriodSeats}.</p>}
            {pool.status === 'PAST_DUE' && pool.graceEndsAt && (
              <p>Pague até {dia(pool.graceEndsAt)} para os membros não perderem o PRO.</p>
            )}
            {pool.paymentUrl && (
              <a
                href={pool.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"
              >
                Pagar a primeira cobrança <ExternalLink size={14} aria-hidden />
              </a>
            )}
          </div>
        )}

        {!vivo && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              comprar.mutate();
            }}
          >
            <p className="text-sm text-muted-foreground">
              Cada assento dá o PRO (chat, foto e ditado com a IA) a um membro escolhido por você.{' '}
              {formatBRL(v.unitPriceCents)} por assento ao mês, sem mínimo.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="assentos-compra">Assentos</Label>
                <Quantidade id="assentos-compra" value={compra} onChange={setCompra} />
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
                disabled={
                  comprar.isPending || compra < 1 || documento.replace(/\D/g, '').length < 11
                }
              >
                {comprar.isPending
                  ? 'Abrindo...'
                  : `Comprar por ${formatBRL(compra * v.unitPriceCents)}/mês`}
              </Button>
            )}
          </form>
        )}

        {vivo && pool && !pool.manual && pool.status !== 'PENDING' && !pool.cancelAtPeriodEnd && (
          <div className="space-y-2 border-t border-subtle pt-3">
            <Label htmlFor="assentos-nova">Mudar a quantidade</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Quantidade id="assentos-nova" value={quantidade} onChange={setNova} />
              <Button
                variant="outline"
                disabled={
                  ajustar.isPending ||
                  quantidade < 1 ||
                  quantidade === pool.seats ||
                  quantidade < v.assigned
                }
                onClick={() => ajustar.mutate(quantidade)}
              >
                {ajustar.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
            {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
            <Button variant="ghost" className="text-danger" onClick={() => setCancelando(true)}>
              Cancelar assentos
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="quem" className="space-y-2">
        <h2 id="quem" className="text-sm font-semibold">
          Quem usa
        </h2>
        {v.assignments.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {vivo ? 'Ninguém ainda. Dê assentos pela seção Membros.' : 'Sem assentos ativos.'}
          </p>
        ) : (
          <ul className="divide-y divide-subtle rounded-2xl border border-subtle bg-card">
            {v.assignments.map((a) => (
              <li key={a.membershipId} className="flex items-center gap-3 px-4 py-3">
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
        {vivo && ativos.length > 0 && v.assigned < (pool?.seats ?? 0) && (
          <p className="text-xs text-muted-foreground">
            {(pool?.seats ?? 0) - v.assigned === 1
              ? '1 livre.'
              : `${(pool?.seats ?? 0) - v.assigned} livres.`}
          </p>
        )}
      </section>

      {v.pendingCharges.length > 0 && (
        <section aria-labelledby="pendentes" className="space-y-2 lg:col-span-2">
          <h2 id="pendentes" className="text-sm font-semibold">
            Cobranças proporcionais em aberto
          </h2>
          <ul className="divide-y divide-subtle rounded-2xl border border-subtle bg-card text-sm">
            {v.pendingCharges.map((c) => (
              <li key={c.id} className="flex justify-between px-4 py-3">
                <span>{`De ${c.fromSeats} para ${c.toSeats} assentos`}</span>
                <span className="tabular-nums">{formatBRL(c.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="faturas" className="space-y-2 lg:col-span-2">
        <h2 id="faturas" className="flex items-center gap-2 text-sm font-semibold">
          <Receipt size={16} aria-hidden /> Faturas
        </h2>
        {faturas.data && faturas.data.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma fatura ainda.</p>
        )}
        {faturas.data && faturas.data.length > 0 && (
          <ul className="divide-y divide-subtle rounded-2xl border border-subtle bg-card text-sm">
            {faturas.data.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-28">{f.dueDate ? dia(f.dueDate) : dia(f.createdAt)}</span>
                <span className="flex-1 text-muted-foreground">
                  {f.kind === 'ADJUSTMENT' ? 'Proporcional' : 'Mensalidade'}
                </span>
                <span className="tabular-nums">{formatBRL(f.amountCents)}</span>
                <Badge variant={f.status === 'OVERDUE' ? 'destructive' : 'outline'}>
                  {invoiceStatusLabel(f.status)}
                </Badge>
                {f.invoiceUrl && (
                  <a
                    href={f.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 text-primary"
                  >
                    Ver <ExternalLink size={14} aria-hidden />
                    <span className="sr-only">
                      fatura de {f.dueDate ? dia(f.dueDate) : dia(f.createdAt)}
                    </span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
