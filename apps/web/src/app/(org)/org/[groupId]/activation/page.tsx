'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, MailCheck, MessageCircle, RefreshCw, Search, Send, UserPlus } from 'lucide-react';
import {
  ApiError,
  SMALL_SAMPLE,
  inviteOriginLabel,
  invitedAgoLabel,
  orgApi,
  pageRangeLabel,
  resendResultMessage,
  whatsappHref,
  whatsappInviteMessage,
  type InviteOrigin,
  type PendingInviteItem,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { InvitePanel } from '@/components/org/invite-panel';
import { useOptionalSidePanel, type SidePanelContent } from '@/components/org/side-panel';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Origem = InviteOrigin | 'NONE' | undefined;

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

async function copyText(text: string, ok: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    toast('Não deu para copiar. Selecione o texto e copie.');
  }
}

const STATUS: Record<PendingInviteItem['status'], { label: string; cls: string }> = {
  pending: { label: 'aguardando', cls: 'text-water' },
  expired: { label: 'expirou · 30 dias', cls: 'text-danger' },
  declined: { label: 'recusou', cls: 'text-muted-foreground' },
};

/**
 * Ativação pendente (Pn-22): quem foi convidado por e-mail há 2 dias ou mais e
 * ainda não entrou. A lista é nominal (a pessoa ainda não é membro); os totais
 * pequenos somem (menos de 5). Reenviar manda um link novo por e-mail; o
 * WhatsApp gera um link novo e mostra a mensagem pronta.
 */
export default function ActivationPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const painel = useOptionalSidePanel();
  const [origem, setOrigem] = useState<Origem>(undefined);
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [sel, setSel] = useState<string[]>([]);
  const [zap, setZap] = useState<{ email: string; message: string; reused: boolean } | null>(null);
  const [emLinha, setEmLinha] = useState<SidePanelContent | null>(null);

  const q = busca.trim();
  const lista = useQuery({
    queryKey: orgKeys.pendingInvites(g.id, origem, q, pagina),
    queryFn: () => orgApi.pendingInvites(g.id, { origin: origem, q, page: pagina }),
    placeholderData: keepPreviousData,
  });
  const visao = useQuery({
    queryKey: orgKeys.invitesOverview(g.id),
    queryFn: () => orgApi.invitesOverview(g.id),
  });
  const linkGeral = visao.data?.invites.find(
    (i) => i.kind === 'link' && i.status === 'active' && i.url,
  )?.url;

  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
  const falhou = (padrao: string) => (err: unknown) => toast(erroDaApi(err, padrao));
  const fechar = () => (painel ? painel.close() : setEmLinha(null));
  const convidar = () => {
    const c: SidePanelContent = {
      title: `Convidar para a ${g.name}`,
      subtitle: 'Convite por link ou e-mail',
      body: <InvitePanel group={g} initialMode="email" onDone={fechar} />,
    };
    if (painel) painel.open(c);
    else setEmLinha(c);
  };

  const reenviar = useMutation({
    mutationFn: (i: PendingInviteItem) => orgApi.resendInvite(g.id, i.id),
    onSuccess: (_r, i) => {
      toast(`Convite reenviado para ${i.email}`);
      refrescar();
    },
    onError: falhou('Não deu para reenviar agora.'),
  });
  const renovar = useMutation({
    mutationFn: (i: PendingInviteItem) => orgApi.renewInvite(g.id, i.id),
    onSuccess: (_r, i) => {
      toast(`Convite novo enviado para ${i.email}`);
      refrescar();
    },
    onError: falhou('Não deu para renovar agora.'),
  });
  const revogar = useMutation({
    mutationFn: (i: PendingInviteItem) => orgApi.revokeInvite(g.id, i.id),
    onSuccess: (_r, i) => {
      toast(`Convite de ${i.email} revogado`);
      setSel((s) => s.filter((x) => x !== i.id));
      refrescar();
    },
    onError: falhou('Não deu para revogar agora.'),
  });
  const emLote = useMutation({
    mutationFn: () => orgApi.resendInvites(g.id, sel),
    onSuccess: (r) => {
      toast(resendResultMessage(r));
      setSel([]);
      refrescar();
    },
    onError: falhou('Não deu para reenviar agora.'),
  });
  // O link novo só existe depois da chamada: copiar direto seria bloqueado
  // pelo navegador (clipboard fora do gesto). A mensagem abre num diálogo.
  const whatsapp = useMutation({
    mutationFn: (i: PendingInviteItem) => orgApi.freshInviteLink(g.id, i.id),
    onSuccess: (r, i) => {
      setZap({ email: i.email, message: whatsappInviteMessage(g.name, r.url), reused: r.reused });
      refrescar();
    },
    onError: falhou('Não deu para gerar o link agora.'),
  });

  const d = lista.data;
  const cards = d?.cards;
  const pequeno =
    !!cards &&
    (cards.notAccepted === null ||
      cards.joinedNoFirstLog === null ||
      cards.acceptedThisMonth === null);
  const totalOrigens = d?.origins.reduce((s, o) => s + o.count, 0) ?? 0;
  const pg = d
    ? {
        from: d.total ? (d.page - 1) * d.pageSize + 1 : 0,
        to: Math.min(d.page * d.pageSize, d.total),
        total: d.total,
      }
    : null;
  const paginas = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const filtrando = origem !== undefined || q !== '';
  const vazia = d && d.total === 0 && !filtrando;
  const daPagina = (d?.items ?? []).filter((i) => i.canResend).map((i) => i.id);
  const todosMarcados = daPagina.length > 0 && daPagina.every((id) => sel.includes(id));

  const muda = (f: () => void) => {
    f();
    setPagina(1);
    setSel([]);
  };

  const cartoes: { label: string; value: string | null; sub: string }[] = cards
    ? [
        {
          label: 'Convites sem aceite',
          value: cards.notAccepted === null ? null : String(cards.notAccepted),
          sub: 'nos últimos 30 dias',
        },
        {
          label: 'Entraram e sem 1º registro',
          value: cards.joinedNoFirstLog === null ? null : String(cards.joinedNoFirstLog),
          sub: 'em 48 h · só o número, sem nomes',
        },
        {
          label: 'Aceitaram este mês',
          value: cards.acceptedThisMonth
            ? `${cards.acceptedThisMonth.accepted} de ${cards.acceptedThisMonth.total}`
            : null,
          sub: 'convites por e-mail',
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-64 flex-1">
          <h1 className="font-display text-xl font-bold">Ativação pendente</h1>
          <p className="text-sm text-muted-foreground">Quem foi convidado e ainda não entrou.</p>
        </div>
        {linkGeral && (
          <Button
            variant="outline"
            className="gap-1"
            onClick={() => copyText(linkGeral, 'Link copiado.')}
          >
            <Copy size={16} aria-hidden /> Copiar link geral
          </Button>
        )}
        <Button className="gap-1" onClick={convidar}>
          <UserPlus size={16} aria-hidden /> Convidar
        </Button>
      </div>

      {lista.isPending && <Skeleton className="h-48 rounded-2xl bg-card" />}
      {lista.isError && (
        <EmptyState
          title="Não deu para carregar a ativação pendente"
          action={
            <Button variant="outline" onClick={() => lista.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      )}

      {cards && (
        <ul aria-label="Resumo da ativação" className="grid gap-2 sm:grid-cols-3">
          {cartoes.map((k) => (
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
      )}

      {vazia && (
        <EmptyState
          icon={MailCheck}
          title={
            cards?.notAccepted === 0
              ? 'Todos os convites foram aceitos'
              : 'Nenhum convite parado há 2 dias'
          }
          description={
            cards?.notAccepted === 0
              ? 'Quando alguém não aceitar em 2 dias, aparece aqui.'
              : 'Os convites sem aceite são recentes. Quem não aceitar em 2 dias aparece aqui.'
          }
          action={
            <Button variant="outline" onClick={convidar}>
              Convidar mais pessoas
            </Button>
          }
        />
      )}

      {d && !vazia && (
        <>
          {d.origins.length > 1 && (
            <div role="group" aria-label="Filtrar por origem" className="flex flex-wrap gap-2">
              <Chip
                selected={origem === undefined}
                onClick={() => muda(() => setOrigem(undefined))}
              >
                Todas as origens <span className="opacity-70">{totalOrigens}</span>
              </Chip>
              {d.origins.map((o) => {
                const v: Origem = o.origin ?? 'NONE';
                return (
                  <Chip key={v} selected={origem === v} onClick={() => muda(() => setOrigem(v))}>
                    {inviteOriginLabel(o.origin)} <span className="opacity-70">{o.count}</span>
                  </Chip>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Buscar e-mail</span>
              <Search
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={busca}
                onChange={(e) => muda(() => setBusca(e.target.value))}
                placeholder="Buscar e-mail"
                className="pl-9"
              />
            </label>
            {sel.length > 0 && (
              <div className="flex items-center gap-2">
                <b className="text-sm">
                  {sel.length === 1 ? '1 selecionado' : `${sel.length} selecionados`}
                </b>
                <Button
                  className="gap-1"
                  disabled={emLote.isPending}
                  onClick={() => emLote.mutate()}
                >
                  <Send size={14} aria-hidden /> Reenviar selecionados
                </Button>
              </div>
            )}
          </div>

          {d.items.length === 0 ? (
            <EmptyState title="Nenhum convite com esse filtro" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-subtle bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-subtle text-left text-xs text-muted-foreground">
                    <th className="w-10 p-3">
                      <Checkbox
                        label="Selecionar todos desta página"
                        checked={todosMarcados}
                        onCheckedChange={(on) =>
                          setSel((s) =>
                            on
                              ? [...new Set([...s, ...daPagina])]
                              : s.filter((id) => !daPagina.includes(id)),
                          )
                        }
                        className={daPagina.length ? '' : 'invisible'}
                      />
                    </th>
                    <th className="p-3 font-semibold">E-mail</th>
                    <th className="hidden p-3 font-semibold md:table-cell">Convidado há</th>
                    <th className="hidden p-3 font-semibold md:table-cell">Origem</th>
                    <th className="hidden p-3 font-semibold sm:table-cell">Status</th>
                    <th className="p-3 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {d.items.map((i) => {
                    const st = STATUS[i.status];
                    const marcado = sel.includes(i.id);
                    return (
                      <tr key={i.id} className={cn(marcado && 'bg-primary/5')}>
                        <td className="p-3">
                          {i.canResend && (
                            <Checkbox
                              label={`Selecionar ${i.email}`}
                              checked={marcado}
                              onCheckedChange={() =>
                                setSel((s) =>
                                  s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id],
                                )
                              }
                            />
                          )}
                        </td>
                        <td className="max-w-[11rem] p-3 sm:max-w-[14rem]">
                          <span className="block truncate font-semibold">{i.email}</span>
                          <span className="block text-xs text-muted-foreground md:hidden">
                            há {invitedAgoLabel(i.invitedAt)}
                          </span>
                          <span className={cn('block text-xs font-semibold sm:hidden', st.cls)}>
                            {st.label}
                          </span>
                        </td>
                        <td className="hidden p-3 md:table-cell">{invitedAgoLabel(i.invitedAt)}</td>
                        <td className="hidden p-3 md:table-cell">
                          {i.label || inviteOriginLabel(i.origin)}
                        </td>
                        <td
                          className={cn('hidden p-3 text-xs font-semibold sm:table-cell', st.cls)}
                        >
                          {st.label}
                        </td>
                        <td className="p-3">
                          <span className="flex flex-col items-end gap-1 md:flex-row md:flex-wrap md:justify-end">
                            {i.canResend && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                disabled={reenviar.isPending}
                                onClick={() => reenviar.mutate(i)}
                              >
                                <Send size={14} aria-hidden /> Reenviar
                              </Button>
                            )}
                            {i.canRenew && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                disabled={renovar.isPending}
                                onClick={() => renovar.mutate(i)}
                              >
                                <RefreshCw size={14} aria-hidden /> Renovar
                              </Button>
                            )}
                            {i.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1"
                                title="Gera um link para mandar pelo WhatsApp: invalida o link anterior (o do e-mail). Em 10 minutos, volta o mesmo."
                                disabled={whatsapp.isPending}
                                onClick={() => whatsapp.mutate(i)}
                              >
                                <MessageCircle size={14} aria-hidden /> WhatsApp
                              </Button>
                            )}
                            {i.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-danger"
                                disabled={revogar.isPending}
                                onClick={() => revogar.mutate(i)}
                              >
                                Revogar
                              </Button>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pg && d.total > d.pageSize && (
            <nav aria-label="Páginas" className="flex items-center gap-2">
              <p className="flex-1 text-xs text-muted-foreground">
                {pageRangeLabel(pg)} · mais antigos primeiro, expiram antes
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={d.page <= 1}
                onClick={() => setPagina(d.page - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={d.page >= paginas}
                onClick={() => setPagina(d.page + 1)}
              >
                Próxima
              </Button>
            </nav>
          )}

          <p className="text-xs text-muted-foreground">
            {pequeno
              ? 'Com menos de 5 pessoas os totais ficam ocultos. A lista de convites continua aparecendo para a equipe.'
              : 'Convite expira em 30 dias. Reenviar manda um link novo por e-mail (o anterior deixa de valer). WhatsApp gera um link novo com a mensagem pronta, e por 10 minutos devolve o mesmo.'}
          </p>
        </>
      )}

      {emLinha && (
        <section
          aria-label={emLinha.title}
          className="flex flex-col rounded-2xl border border-subtle bg-card"
        >
          <div className="flex items-center gap-2 border-b border-subtle p-3">
            <b className="flex-1 text-sm">{emLinha.title}</b>
            <Button size="sm" variant="ghost" onClick={() => setEmLinha(null)}>
              Fechar
            </Button>
          </div>
          {emLinha.body}
        </section>
      )}

      <Dialog open={zap !== null} onOpenChange={(open) => !open && setZap(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mensagem para {zap?.email}</DialogTitle>
            <DialogDescription>
              {zap?.reused
                ? 'É o mesmo link de há pouco: nada mudou. Mande pelo WhatsApp ou copie.'
                : 'Link novo. O link do e-mail anterior deixou de valer. Mande pelo WhatsApp ou copie.'}
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-xl bg-muted/50 p-3 text-sm">{zap?.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-1"
              onClick={() => zap && copyText(zap.message, 'Mensagem copiada. Cole no WhatsApp.')}
            >
              <Copy size={14} aria-hidden /> Copiar
            </Button>
            <Button asChild className="flex-1">
              <a
                href={zap ? whatsappHref(zap.message) : '#'}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir WhatsApp
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
