'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Link2, Mail, QrCode, ScanLine, Send } from 'lucide-react';
import {
  ApiError,
  SMALL_SAMPLE,
  inviteOriginLabel,
  inviteStatusLabel,
  inviteValidityLabel,
  invitedAgoLabel,
  orgApi,
  panelHref,
  teamRoleLabel,
  type InviteOverviewRow,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { InvitePanel, type InviteMode } from '@/components/org/invite-panel';
import { useOptionalSidePanel, type SidePanelContent } from '@/components/org/side-panel';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Aba = 'all' | 'links' | 'emails';

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Link copiado.');
  } catch {
    toast('Não deu para copiar. Selecione o link e copie.');
  }
}

/** "38 · sem limite", "3 de 10" ou, no e-mail, "0 de 1". */
function usesLabel(i: InviteOverviewRow): string {
  return i.maxUses === null ? `${i.uses} · sem limite` : `${i.uses} de ${i.maxUses}`;
}

function inviteName(i: InviteOverviewRow): string {
  if (i.email) return i.email;
  if (i.code) return i.label || `Código ${i.code}`;
  return i.label || 'Link';
}

function inviteSub(i: InviteOverviewRow): string {
  if (i.kind === 'email') return `convidado há ${invitedAgoLabel(i.lastSentAt ?? i.createdAt)}`;
  if (i.kind === 'code') return `código ${i.code}`;
  return i.accompaniedByName ? `acompanha: ${i.accompaniedByName}` : 'link de convite';
}

/**
 * Convites (Pn-06): os números, a lista com origem, usos, quem entrou e quem
 * ativou, e os atalhos de criar link ou convidar por e-mail no painel lateral.
 * O código de entrada da recepção (#393) continua aqui embaixo.
 */
export default function OrgInvitesPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const painel = useOptionalSidePanel();
  const [aba, setAba] = useState<Aba>('all');
  const [emLinha, setEmLinha] = useState<SidePanelContent | null>(null);
  const [entrada, setEntrada] = useState<{ code: string; url: string } | null>(null);
  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });

  const visao = useQuery({
    queryKey: orgKeys.invitesOverview(g.id),
    queryFn: () => orgApi.invitesOverview(g.id),
  });

  const fechar = () => (painel ? painel.close() : setEmLinha(null));
  const abrir = (mode: InviteMode) => {
    const c: SidePanelContent = {
      title: mode === 'link' ? 'Novo link de convite' : 'Convidar por e-mail',
      subtitle: 'Convites · quem entra por convite pula a aprovação',
      body: <InvitePanel key={mode} group={g} initialMode={mode} onDone={fechar} />,
    };
    if (painel) painel.open(c);
    else setEmLinha(c);
  };

  // "Criar link com nome" da Origem dos convites (#400) chega com `?novo=link`
  // e já encontra o painel do link aberto. Uma vez por visita.
  const novo = useSearchParams().get('novo');
  const abriuNovo = useRef(false);
  useEffect(() => {
    if (novo !== 'link' || abriuNovo.current) return;
    abriuNovo.current = true;
    abrir('link');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novo]);

  const criarCodigo = useMutation({
    mutationFn: () => orgApi.createInvite(g.id, { role: 'MEMBER', code: true }),
    onSuccess: (r) => {
      if (r.invite.code) setEntrada({ code: r.invite.code, url: r.url });
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para gerar o código agora.')),
  });
  const reenviar = useMutation({
    mutationFn: (i: InviteOverviewRow) => orgApi.resendInvite(g.id, i.id),
    onSuccess: (_r, i) => {
      toast(`Convite reenviado para ${i.email}. O link anterior deixou de valer.`);
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para reenviar agora.')),
  });
  const revogar = useMutation({
    mutationFn: (id: string) => orgApi.revokeInvite(g.id, id),
    onSuccess: () => {
      toast('Convite revogado.');
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para revogar agora.')),
  });

  const todos = visao.data?.invites ?? [];
  const links = todos.filter((i) => i.kind !== 'email');
  const emails = todos.filter((i) => i.kind === 'email');
  const lista = aba === 'links' ? links : aba === 'emails' ? emails : todos;
  const c = visao.data?.cards;

  const cards: { label: string; value: string; extra?: React.ReactNode }[] = c
    ? [
        { label: 'Links ativos', value: String(c.activeLinks) },
        {
          label: 'Convites sem aceite',
          value: c.notAccepted === null ? SMALL_SAMPLE : String(c.notAccepted),
          extra: (
            <Link
              href={panelHref(g.id, 'activation')}
              className="text-xs font-semibold text-primary hover:underline"
            >
              ver ativação pendente ›
            </Link>
          ),
        },
        {
          label: 'Entraram em 30 dias',
          value: c.joinedLast30Days === null ? SMALL_SAMPLE : String(c.joinedLast30Days),
        },
        {
          label: 'Ativaram em 48 h',
          value: c.activated48h === null ? SMALL_SAMPLE : `${c.activated48h.percent}%`,
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-64 flex-1">
          <h1 className="font-display text-xl font-bold">Convites</h1>
          <p className="text-sm text-muted-foreground">
            Link com origem, QR ou e-mail. Quem entra por convite pula a aprovação.
          </p>
        </div>
        <Button variant="outline" className="gap-1" onClick={() => abrir('email')}>
          <Mail size={16} aria-hidden /> Convidar por e-mail
        </Button>
        <Button className="gap-1" onClick={() => abrir('link')}>
          <Link2 size={16} aria-hidden /> Novo link
        </Button>
      </div>

      {visao.isPending && <Skeleton className="h-24 rounded-2xl bg-card" />}
      {visao.isError && (
        <EmptyState
          title="Não deu para carregar os convites"
          action={
            <Button variant="outline" onClick={() => visao.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      )}

      {c && (
        <ul aria-label="Resumo dos convites" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {cards.map((k) => (
            <li key={k.label} className="space-y-1 rounded-2xl border border-subtle bg-card p-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p
                className={cn(
                  k.value === SMALL_SAMPLE
                    ? 'text-xs text-muted-foreground'
                    : 'font-display text-2xl font-bold',
                )}
              >
                {k.value}
              </p>
              {k.extra}
            </li>
          ))}
        </ul>
      )}

      {visao.data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Filtrar convites" className="flex gap-1">
              {(
                [
                  ['all', 'Todos', todos.length],
                  ['links', 'Links', links.length],
                  ['emails', 'E-mails', emails.length],
                ] as const
              ).map(([v, l, n]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={aba === v}
                  onClick={() => setAba(v)}
                  className={cn(
                    'flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold',
                    aba === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  {l} <span className="text-xs opacity-80">{n}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              “Entraram” só aparece com 5 pessoas ou mais. A ativação sai só no total, para ninguém
              ser reconhecido por um convite pequeno.
            </p>
          </div>

          {lista.length === 0 ? (
            <EmptyState title="Nenhum convite por aqui" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-subtle bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-subtle text-left text-xs text-muted-foreground">
                    <th className="p-3 font-semibold">Convite</th>
                    <th className="hidden p-3 font-semibold md:table-cell">Origem</th>
                    <th className="hidden p-3 font-semibold lg:table-cell">Papel</th>
                    <th className="hidden p-3 font-semibold md:table-cell">Usos</th>
                    <th className="hidden p-3 font-semibold lg:table-cell">Entraram</th>
                    <th className="p-3 font-semibold">Validade</th>
                    <th className="p-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {lista.map((i) => {
                    const ativo = i.status === 'active';
                    const email = i.kind === 'email';
                    return (
                      <tr key={i.id} className={cn(!ativo && 'opacity-60')}>
                        <td className="max-w-[9.5rem] p-3 sm:max-w-none">
                          <span className="block truncate font-semibold">{inviteName(i)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {inviteSub(i)}
                          </span>
                        </td>
                        <td className="hidden p-3 md:table-cell">
                          {email ? 'E-mail' : inviteOriginLabel(i.origin)}
                        </td>
                        <td className="hidden p-3 lg:table-cell">
                          {teamRoleLabel(i.role).toLowerCase()}
                        </td>
                        <td className="hidden p-3 md:table-cell">{usesLabel(i)}</td>
                        <td className="hidden p-3 lg:table-cell">
                          {email ? (
                            '—'
                          ) : i.joined === null ? (
                            <span className="text-xs text-muted-foreground">menos de 5</span>
                          ) : (
                            <b>{i.joined}</b>
                          )}
                        </td>
                        <td className="p-3">{inviteValidityLabel(i)}</td>
                        <td className="p-3">
                          {ativo ? (
                            <span className="flex flex-col items-end gap-1 md:flex-row md:justify-end">
                              {i.url && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() => copyText(i.url!)}
                                >
                                  <Copy size={14} aria-hidden /> Copiar
                                </Button>
                              )}
                              {email && (
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
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-danger"
                                disabled={revogar.isPending}
                                onClick={() => revogar.mutate(i.id)}
                              >
                                Revogar
                              </Button>
                            </span>
                          ) : (
                            <span className="block text-right text-xs text-muted-foreground">
                              {inviteStatusLabel(i.status)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Convite com papel de equipe dá as permissões desse papel. Convite por e-mail vale uma
            vez, por até 30 dias; link e QR podem ficar sem prazo.
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

      <section
        aria-labelledby="codigo"
        className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
      >
        <h2 id="codigo" className="flex items-center gap-2 text-sm font-semibold">
          <ScanLine size={16} aria-hidden /> Código de entrada (recepção)
        </h2>
        {g.joinPolicy === 'INVITE_ONLY' ? (
          <p className="text-sm text-muted-foreground">
            Esta comunidade entra só por convite: o código de entrada fica desligado. Mude a forma
            de entrada em Configurações para usar o código.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Um código curto para o cartaz da recepção. Quem usa entra como membro e segue a forma
              de entrada da comunidade
              {g.joinPolicy === 'APPROVAL' ? ' (você aprova cada pedido)' : ''}. Vale 1 ano; revogue
              na lista quando quiser trocar. Para entrar sem aprovação, use um link com origem
              “Recepção”.
            </p>
            <Button
              variant="outline"
              className="gap-1"
              disabled={criarCodigo.isPending}
              onClick={() => criarCodigo.mutate()}
            >
              <QrCode size={16} aria-hidden />
              {criarCodigo.isPending ? 'Gerando...' : 'Gerar código de entrada'}
            </Button>
            {entrada && (
              <div className="space-y-2 rounded-xl bg-muted/50 p-3">
                <p
                  className="text-center font-display text-2xl font-bold tracking-[0.2em]"
                  data-testid="entry-code"
                >
                  {entrada.code}
                </p>
                <p className="text-xs text-muted-foreground">
                  Link para o QR (o app lê e já abre a comunidade):
                </p>
                <p className="break-all font-mono text-xs" data-testid="entry-code-url">
                  {entrada.url}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => copyText(entrada.url)}
                >
                  <Copy size={14} aria-hidden /> Copiar link do QR
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
