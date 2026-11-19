'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Columns3, Crown, Search, UserPlus, Users } from 'lucide-react';
import {
  ApiError,
  MEMBER_TABS,
  SHARE_SCOPE_LABEL,
  accompanyOptions,
  filterPanelMembers,
  joinedViaLabel,
  memberTabCounts,
  memberViaOptions,
  orgApi,
  pageRangeLabel,
  paginate,
  panelApi,
  panelHref,
  seatsApi,
  type MemberBulkAction,
  type MemberTab,
  type PanelMember,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { InvitePanel } from '@/components/org/invite-panel';
import { MemberPanel, memberSinceLabel, memberStatusLabel } from '@/components/org/member-panel';
import { useOptionalSidePanel, type SidePanelContent } from '@/components/org/side-panel';
import { usePanelMembers } from '@/components/org/use-panel-members';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

type Coluna = 'via' | 'accompanied' | 'status' | 'shares' | 'seat';

const COLUNAS: { key: Coluna; label: string }[] = [
  { key: 'via', label: 'Entrou por' },
  { key: 'accompanied', label: 'Acompanha' },
  { key: 'status', label: 'Status' },
  { key: 'shares', label: 'Compartilha' },
  { key: 'seat', label: 'Assento' },
];

const TODAS: Coluna[] = COLUNAS.map((c) => c.key);

/** As colunas escolhidas ficam neste navegador; sem armazenamento, todas aparecem. */
function readCols(groupId: string): Coluna[] {
  if (typeof window === 'undefined') return TODAS;
  try {
    const raw = window.localStorage.getItem(`fatia:panel-members-cols:${groupId}`);
    const lidas = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(lidas)) return TODAS.filter((c) => lidas.includes(c));
  } catch {
    // sem armazenamento: todas as colunas
  }
  return TODAS;
}

function writeCols(groupId: string, cols: Coluna[]) {
  try {
    window.localStorage.setItem(`fatia:panel-members-cols:${groupId}`, JSON.stringify(cols));
  } catch {
    // o navegador recusou: vale só nesta visita
  }
}

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

/** Só membro ativo entra na seleção: as ações em massa valem para ele. */
const selecionavel = (m: PanelMember) => m.status === 'ACTIVE' && m.role === 'MEMBER';

function ColumnsMenu({ cols, onChange }: { cols: Coluna[]; onChange: (c: Coluna[]) => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setAberto(false);
      }}
    >
      <Button
        variant="outline"
        className="gap-1"
        aria-expanded={aberto}
        aria-haspopup="menu"
        onClick={() => setAberto(!aberto)}
      >
        <Columns3 size={16} aria-hidden /> Colunas
      </Button>
      {aberto && (
        <div
          role="menu"
          aria-label="Colunas"
          className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-border bg-popover p-1 shadow-lg"
        >
          {COLUNAS.map((c) => {
            const on = cols.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onChange(on ? cols.filter((x) => x !== c.key) : [...cols, c.key])}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted"
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-4 w-4 rounded border',
                    on ? 'border-primary bg-primary' : 'border-border',
                  )}
                />
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Membros (Pn-04): abas, busca, "Entrou por", colunas, páginas, seleção com
 * ações em massa e a pessoa no painel lateral. O dono administra; o
 * profissional vê a lista e abre cada pessoa.
 */
export default function OrgMembersPage() {
  const g = useOrgGroup();
  const dono = g.role === 'OWNER';
  const qc = useQueryClient();
  const painel = useOptionalSidePanel();
  const inicial = useSearchParams().get('filtro');
  const [aba, setAba] = useState<MemberTab>(inicial === 'pending' ? 'pending' : 'all');
  const [busca, setBusca] = useState('');
  const [via, setVia] = useState('');
  const [pagina, setPagina] = useState(1);
  const [sel, setSel] = useState<string[]>([]);
  const [cols, setCols] = useState<Coluna[]>(() => readCols(g.id));
  const [recusando, setRecusando] = useState<PanelMember | null>(null);
  const [emLinha, setEmLinha] = useState<SidePanelContent | null>(null);

  const membros = usePanelMembers(g.id);
  const assentos = useQuery({
    queryKey: orgKeys.seats(g.id),
    queryFn: () => seatsApi.get(g.id),
    enabled: dono,
  });
  const contadores = useQuery({
    queryKey: orgKeys.panelCounts(g.id),
    queryFn: () => panelApi.counts(g.id),
  });

  const todos = membros.data ?? [];
  const lista = filterPanelMembers(todos, { tab: aba, q: busca, via: via || null });
  const pg = paginate(lista, pagina, PAGE_SIZE);
  const contagem = memberTabCounts(todos);
  const origens = memberViaOptions(todos);
  const acompanhantes = accompanyOptions(todos);
  const ativos = todos.filter((m) => m.status === 'ACTIVE').length;

  const mostra = (c: Coluna) => cols.includes(c);
  const mudaCols = (c: Coluna[]) => {
    setCols(c);
    writeCols(g.id, c);
  };
  const filtra = (f: () => void) => {
    f();
    setPagina(1);
    setSel([]);
  };

  const abrir = (c: SidePanelContent) => (painel ? painel.open(c) : setEmLinha(c));
  const fechar = () => (painel ? painel.close() : setEmLinha(null));
  const abrirPessoa = (m: PanelMember) =>
    abrir({
      title: m.name,
      subtitle: 'Membros · acompanhamento, assento e o que compartilha',
      body: <MemberPanel group={g} membershipId={m.membershipId} onClose={fechar} />,
    });
  const convidar = () =>
    abrir({
      title: `Convidar para a ${g.name}`,
      subtitle: 'Membros · convite por link ou e-mail',
      body: <InvitePanel group={g} onDone={fechar} />,
    });

  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
  const falhou = (padrao: string) => (err: unknown) => toast(erroDaApi(err, padrao));

  const aprovar = useMutation({
    mutationFn: (m: PanelMember) => orgApi.approve(g.id, m.membershipId, 'MEMBER'),
    onSuccess: (_r, m) => {
      toast(`${m.name} entrou na comunidade.`);
      refrescar();
    },
    onError: falhou('Não deu para aprovar agora.'),
  });
  const recusar = useMutation({
    mutationFn: (m: PanelMember) => orgApi.removeMember(g.id, m.membershipId),
    onSuccess: () => {
      toast('Pedido recusado.');
      setRecusando(null);
      refrescar();
    },
    onError: falhou('Não deu para recusar agora.'),
  });
  const lote = useMutation({
    mutationFn: (v: { action: MemberBulkAction; to?: string | null }) =>
      orgApi.bulkMembers(g.id, {
        action: v.action,
        membershipIds: sel,
        ...(v.action === 'accompany' ? { accompaniedByMembershipId: v.to ?? null } : {}),
      }),
    onSuccess: (_r, v) => {
      const n = sel.length;
      const pessoas = n === 1 ? '1 pessoa' : `${n} pessoas`;
      if (v.action === 'accompany') {
        const nome = acompanhantes.find((a) => a.membershipId === v.to)?.name;
        toast(nome ? `${pessoas} agora com ${nome}` : `${pessoas} sem acompanhamento`);
      } else {
        toast(
          v.action === 'seat'
            ? `Assento PRO dado para ${pessoas}`
            : `Assento PRO liberado de ${pessoas}`,
        );
      }
      setSel([]);
      refrescar();
    },
    onError: falhou('Não deu para aplicar a ação agora.'),
  });

  const daPagina = pg.items.filter(selecionavel).map((m) => m.membershipId);
  const todosMarcados = daPagina.length > 0 && daPagina.every((id) => sel.includes(id));
  const marca = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const cards: { label: string; value: string; sub: string }[] = [
    { label: 'Ativos', value: String(ativos), sub: `de ${todos.length - contagem.left} membros` },
    { label: 'Aguardando', value: String(contagem.pending), sub: 'pedidos para entrar' },
    {
      label: 'Sem acompanhamento',
      value: String(contagem.unassigned),
      sub: 'membros ativos sem ninguém',
    },
    ...(dono && assentos.data?.pool
      ? [
          {
            label: 'Assentos PRO',
            value: `${assentos.data.assigned}/${assentos.data.pool.seats}`,
            sub: `${Math.max(0, assentos.data.pool.seats - assentos.data.assigned)} livres`,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 font-display text-xl font-bold">Membros</h1>
        <Button className="gap-1" onClick={convidar}>
          <UserPlus size={16} aria-hidden /> Convidar
        </Button>
      </div>

      <ul aria-label="Resumo dos membros" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.label} className="rounded-2xl border border-subtle bg-card p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="font-display text-2xl font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </li>
        ))}
      </ul>

      <div role="group" aria-label="Filtrar membros" className="flex flex-wrap gap-1">
        {MEMBER_TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            aria-pressed={aba === t.tab}
            onClick={() => filtra(() => setAba(t.tab))}
            className={cn(
              'flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold',
              aba === t.tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
            )}
          >
            {t.label} <span className="text-xs opacity-80">{contagem[t.tab]}</span>
          </button>
        ))}
        <Link
          href={panelHref(g.id, 'activation')}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-semibold text-foreground hover:bg-muted/70"
        >
          Convite pendente{' '}
          <span className="text-xs opacity-80">{contadores.data?.pendingInvites ?? 0}</span>
        </Link>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Buscar por nome</span>
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => filtra(() => setBusca(e.target.value))}
            placeholder="Filtrar por nome"
            className="pl-9"
          />
        </label>
        <select
          aria-label="Entrou por"
          value={via}
          onChange={(e) => filtra(() => setVia(e.target.value))}
          className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value="">Entrou por: todas</option>
          {origens.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ColumnsMenu cols={cols} onChange={mudaCols} />
      </div>

      {dono && sel.length > 0 && (
        <div
          role="region"
          aria-label="Ações em massa"
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-primary/5 p-3"
        >
          <b className="text-sm">
            {sel.length === 1 ? '1 selecionado' : `${sel.length} selecionados`}
          </b>
          <select
            aria-label="Trocar responsável"
            value=""
            disabled={lote.isPending}
            onChange={(e) =>
              e.target.value &&
              lote.mutate({
                action: 'accompany',
                to: e.target.value === 'none' ? null : e.target.value,
              })
            }
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">Trocar responsável…</option>
            {acompanhantes.map((a) => (
              <option key={a.membershipId} value={a.membershipId}>
                {a.name}
              </option>
            ))}
            <option value="none">Ninguém</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={lote.isPending}
            onClick={() => lote.mutate({ action: 'seat' })}
          >
            Dar assento
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={lote.isPending}
            onClick={() => lote.mutate({ action: 'unseat' })}
          >
            Tirar assento
          </Button>
          <span className="text-xs text-muted-foreground">
            as ações valem só para quem está ativo
          </span>
          <Button size="sm" variant="ghost" onClick={() => setSel([])}>
            Limpar
          </Button>
        </div>
      )}

      {membros.isPending && <Skeleton className="h-48 rounded-2xl bg-card" />}
      {membros.isError && (
        <EmptyState
          title="Não deu para carregar os membros"
          action={
            <Button variant="outline" onClick={() => membros.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      )}
      {membros.data && lista.length === 0 && (
        <EmptyState
          icon={Users}
          title={aba === 'pending' ? 'Nenhum pedido aguardando' : 'Ninguém por aqui'}
          description={
            aba === 'all' && !busca && !via ? 'Convide pessoas pelo botão Convidar.' : undefined
          }
        />
      )}

      {pg.items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-subtle bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle text-left text-xs text-muted-foreground">
                {dono && (
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
                )}
                <th className="p-3 font-semibold">Pessoa</th>
                {mostra('via') && (
                  <th className="hidden p-3 font-semibold md:table-cell">Entrou por</th>
                )}
                {mostra('accompanied') && (
                  <th className="hidden p-3 font-semibold md:table-cell">Acompanha</th>
                )}
                {mostra('status') && <th className="p-3 font-semibold">Status</th>}
                {mostra('shares') && (
                  <th className="hidden p-3 font-semibold lg:table-cell">Compartilha</th>
                )}
                {mostra('seat') && (
                  <th className="hidden p-3 font-semibold md:table-cell">Assento</th>
                )}
                <th className="p-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {pg.items.map((m) => {
                const pendente = m.status === 'INVITED';
                const marcado = sel.includes(m.membershipId);
                return (
                  <tr key={m.membershipId} className={cn(marcado && 'bg-primary/5')}>
                    {dono && (
                      <td className="p-3">
                        {selecionavel(m) && (
                          <Checkbox
                            label={`Selecionar ${m.name}`}
                            checked={marcado}
                            onCheckedChange={() => marca(m.membershipId)}
                          />
                        )}
                      </td>
                    )}
                    <td className="p-3">
                      <button
                        type="button"
                        aria-label={`Abrir ${m.name}`}
                        onClick={() => abrirPessoa(m)}
                        className="flex min-h-11 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold"
                        >
                          {iniciais(m.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 font-semibold">
                            {m.name}
                            {m.hasAiSeat && (
                              <Crown size={12} aria-hidden className="text-primary md:hidden" />
                            )}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {memberSinceLabel(m)}
                          </span>
                        </span>
                      </button>
                    </td>
                    {mostra('via') && (
                      <td className="hidden p-3 md:table-cell">{joinedViaLabel(m)}</td>
                    )}
                    {mostra('accompanied') && (
                      <td className="hidden p-3 md:table-cell">{m.accompaniedBy?.name ?? '—'}</td>
                    )}
                    {mostra('status') && (
                      <td className="p-3">
                        {pendente ? (
                          <Badge variant="outline">Aguardando</Badge>
                        ) : (
                          memberStatusLabel(m)
                        )}
                      </td>
                    )}
                    {mostra('shares') && (
                      <td className="hidden p-3 text-xs text-muted-foreground lg:table-cell">
                        {(m.scopesGrantedToMe ?? []).map((s) => SHARE_SCOPE_LABEL[s]).join(', ') ||
                          '—'}
                      </td>
                    )}
                    {mostra('seat') && (
                      <td className="hidden p-3 md:table-cell">
                        {m.hasAiSeat ? (
                          <Badge variant="secondary" className="gap-1">
                            <Crown size={12} aria-hidden /> PRO
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td className="p-3 text-right">
                      {pendente && dono && (
                        <span className="inline-flex gap-2">
                          <Button
                            size="sm"
                            disabled={aprovar.isPending}
                            onClick={() => aprovar.mutate(m)}
                          >
                            Aprovar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRecusando(m)}>
                            Recusar
                          </Button>
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

      {lista.length > PAGE_SIZE && (
        <nav aria-label="Páginas" className="flex items-center gap-2">
          <p className="flex-1 text-xs text-muted-foreground">{pageRangeLabel(pg)}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={pg.page <= 1}
            onClick={() => setPagina(pg.page - 1)}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pg.page >= pg.pages}
            onClick={() => setPagina(pg.page + 1)}
          >
            Próxima
          </Button>
        </nav>
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

      <ConfirmDialog
        open={recusando !== null}
        onOpenChange={(open) => !open && setRecusando(null)}
        title={`Recusar o pedido de ${recusando?.name ?? ''}?`}
        description="A pessoa pode pedir de novo depois, pelo código ou por um convite."
        confirmLabel="Recusar"
        pendingLabel="Recusando..."
        pending={recusar.isPending}
        onConfirm={() => recusando && recusar.mutate(recusando)}
      />
    </div>
  );
}
