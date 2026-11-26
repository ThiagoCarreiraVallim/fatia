'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ChevronRight, Clock, Columns3, Plus, Send, Users } from 'lucide-react';
import {
  groupCan,
  activationLabel,
  insightsApi,
  newThisWeekLabel,
  notLoggedYetLabel,
  OVERVIEW_COLUMNS,
  overviewItemType,
  PANEL_ACTIVITY_RANGES,
  panelApi,
  panelHref,
  panelSections,
  seatSummary,
  seatsApi,
  type CommunitySetup,
  type MyGroup,
  type OverviewCell,
  type OverviewColumn,
  type OverviewDays,
  type OverviewItem,
  type PanelOverview,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { DemoOverview } from '@/components/org/demo-panel';
import { SetupHome, useSetup } from '@/components/org/setup-guide';
import { InsightsCard } from '@/components/org/insights-card';
import { AnnouncementEditor } from '@/components/org/announcement-editor';
import { linePaths } from '@/components/org/chart-paths';
import { readOverviewColumns, writeOverviewColumns } from '@/components/org/panel-prefs';
import { useOptionalSidePanel } from '@/components/org/side-panel';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const cartao =
  'flex flex-col rounded-2xl bg-card p-4 shadow-[inset_0_0_0_1px_hsl(var(--border))] md:px-5 md:py-[18px]';

function Kpi({
  titulo,
  valor,
  tendencia,
  linha,
  detalhe,
  href,
}: {
  titulo: string;
  valor: string;
  tendencia?: string | null;
  linha: string;
  detalhe?: string;
  href?: string;
}) {
  const corpo = (
    <>
      <span className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
        {titulo}
        {tendencia && (
          <span className="flex items-center gap-0.5 rounded-full px-2 text-xs font-semibold text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]">
            <ArrowUpRight aria-hidden className="h-3 w-3" />
            {tendencia}
          </span>
        )}
      </span>
      <span className="mt-1 font-display text-[30px] font-semibold tabular-nums">{valor}</span>
      <span className="mt-auto pt-2 text-[13.5px] font-bold">{linha}</span>
      {detalhe && <span className="text-[12.5px] text-muted-foreground">{detalhe}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={cn(cartao, 'min-h-32 gap-1 hover:bg-muted/40')}>
      {corpo}
    </Link>
  ) : (
    <div className={cn(cartao, 'min-h-32 gap-1')}>{corpo}</div>
  );
}

function Faixa({
  icon: Icone,
  titulo,
  texto,
  href,
  destaque,
}: {
  icon: typeof Users;
  titulo: string;
  texto: string;
  href: string;
  destaque?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        cartao,
        'flex-row items-center gap-3.5 py-3 hover:bg-muted/40 md:py-3',
        destaque && 'shadow-[inset_0_0_0_1px_hsl(var(--warning)/0.4)]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-muted',
          destaque ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        <Icone className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] text-muted-foreground">{titulo}</span>
        <b className="block text-[14.5px]">{texto}</b>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

const fmtDia = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
};

const soma = (cells: OverviewCell[]) => cells.reduce((s, c) => s + (c.value ?? 0), 0);

type Serie = 'workouts' | 'people';
const SERIES: { key: Serie; label: string; cor: string }[] = [
  { key: 'workouts', label: 'Treinos registrados', cor: 'hsl(var(--primary))' },
  { key: 'people', label: 'Pessoas que treinaram', cor: 'hsl(var(--muted-foreground))' },
];

function Atividade({
  data,
  days,
  onDays,
}: {
  data: NonNullable<PanelOverview['aggregates']>['activity'];
  days: OverviewDays;
  onDays: (d: OverviewDays) => void;
}) {
  const [visiveis, setVisiveis] = useState<Record<Serie, boolean>>({
    workouts: true,
    people: true,
  });
  const max = Math.max(
    1,
    ...SERIES.filter((s) => visiveis[s.key]).flatMap((s) => data[s.key].map((c) => c.value ?? 0)),
  );
  const oculto = data.workouts.every((c) => c.value === null);
  const rotulos = data.workouts.filter(
    (_, i, a) => i % Math.max(1, Math.round(a.length / 6)) === 0 || i === a.length - 1,
  );
  const faixa = PANEL_ACTIVITY_RANGES.find((r) => r.value === days)!.label.toLowerCase();
  const resumo = `${soma(data.workouts).toLocaleString('pt-BR')} treinos · ${faixa}`;

  return (
    <section aria-labelledby="atividade" className={cn(cartao, 'gap-1 pb-3')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="atividade" className="text-[15px] font-bold">
            Atividade dos membros
          </h2>
          <p className="text-[13px] text-muted-foreground">{oculto ? faixa : resumo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {SERIES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={visiveis[s.key]}
              onClick={() => setVisiveis((v) => ({ ...v, [s.key]: !v[s.key] }))}
              className={cn(
                'flex min-h-9 items-center gap-1.5 rounded-lg px-1.5 text-[12.5px] text-muted-foreground hover:text-foreground',
                !visiveis[s.key] && 'line-through opacity-60',
              )}
            >
              <i
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-[3px]"
                style={{ background: s.cor }}
              />
              {s.label}
            </button>
          ))}
          <div role="radiogroup" aria-label="Período" className="flex rounded-lg bg-muted p-0.5">
            {PANEL_ACTIVITY_RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={days === r.value}
                onClick={() => onDays(r.value)}
                className={cn(
                  'min-h-8 rounded-md px-2.5 text-xs font-semibold',
                  days === r.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {oculto ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum dia com 5 ou mais pessoas de cada lado (treinou e não treinou): o gráfico fica
          oculto.
        </p>
      ) : (
        <>
          <svg
            viewBox="0 0 1000 200"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Atividade dos membros: ${resumo}`}
            className="mt-3 h-44 w-full overflow-visible md:h-52"
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1="0"
                x2="1000"
                y1={190 - f * 175}
                y2={190 - f * 175}
                stroke="hsl(var(--border))"
                strokeDasharray="4 6"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {SERIES.filter((s) => visiveis[s.key]).map((s) =>
              linePaths(data[s.key], max).map((d, i) => (
                <path
                  key={`${s.key}-${i}`}
                  d={d}
                  fill="none"
                  stroke={s.cor}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )),
            )}
          </svg>
          <div className="flex justify-between pt-0.5 text-[11.5px] text-muted-foreground">
            {rotulos.map((c) => (
              <span key={c.key}>{fmtDia(c.key)}</span>
            ))}
          </div>
          {data.workouts.some((c) => c.suppressed) && (
            <p className="pt-1 text-xs text-muted-foreground">
              Dias com menos de 5 pessoas de cada lado (treinou e não treinou) ficam em branco.
            </p>
          )}
        </>
      )}
    </section>
  );
}

type Aba = 'needsYou' | 'challenges' | 'sent';
const ABAS: { key: Aba; label: string }[] = [
  { key: 'needsYou', label: 'Precisa de você' },
  { key: 'challenges', label: 'Desafios' },
  { key: 'sent', label: 'Últimos envios' },
];

function itemHref(groupId: string, it: OverviewItem): string {
  if (it.type === 'request') return `${panelHref(groupId, 'members')}?filtro=pending`;
  return panelHref(groupId, it.section);
}

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : '—';

function Itens({
  groupId,
  membershipId,
  items,
  onAnnounce,
}: {
  groupId: string;
  membershipId: string;
  items: PanelOverview['items'];
  onAnnounce: (() => void) | null;
}) {
  // Com o painel lateral aberto a página encolhe: só item, tipo e status (Pn-01b).
  const lateralAberto = Boolean(useOptionalSidePanel()?.content);
  const [aba, setAba] = useState<Aba>('needsYou');
  const [colunas, setColunas] = useState<OverviewColumn[]>(() => {
    const salvas = readOverviewColumns(membershipId);
    const validas = OVERVIEW_COLUMNS.map((c) => c.key);
    return salvas
      ? validas.filter((k) => salvas.includes(k))
      : (validas as unknown as OverviewColumn[]);
  });
  const alterna = (k: OverviewColumn) => {
    const novas = colunas.includes(k) ? colunas.filter((c) => c !== k) : [...colunas, k];
    const ordenadas = OVERVIEW_COLUMNS.map((c) => c.key).filter((c) => novas.includes(c));
    setColunas(ordenadas);
    writeOverviewColumns(membershipId, ordenadas);
  };
  const linhas = items[aba];
  const visiveis = lateralAberto ? colunas.filter((k) => k === 'type' || k === 'status') : colunas;
  const celula = (it: OverviewItem, k: OverviewColumn) =>
    k === 'type'
      ? overviewItemType(it.type)
      : k === 'status'
        ? it.status
        : k === 'person'
          ? (it.person ?? '—')
          : k === 'at'
            ? quando(it.at)
            : (it.owner ?? '—');
  // Tipo e status cabem no celular; o resto só a partir do tablet.
  const larga = (k: OverviewColumn) => k !== 'type' && k !== 'status';

  return (
    <section aria-label="Itens" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Itens" className="flex gap-1 overflow-x-auto">
          {ABAS.map((a) => {
            const n = items[a.key].length;
            return (
              <button
                key={a.key}
                type="button"
                role="tab"
                aria-selected={aba === a.key}
                onClick={() => setAba(a.key)}
                className={cn(
                  'flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold',
                  aba === a.key
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {a.label}
                {a.key !== 'sent' && n > 0 && (
                  <span className="rounded-full bg-background px-1.5 text-[11px] tabular-nums">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden md:inline-flex">
                <Columns3 aria-hidden className="h-4 w-4" /> Colunas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {OVERVIEW_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={colunas.includes(c.key)}
                  onCheckedChange={() => alterna(c.key)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {onAnnounce && (
            <Button variant="outline" size="sm" onClick={onAnnounce}>
              <Plus aria-hidden className="h-4 w-4" /> Novo comunicado
            </Button>
          )}
        </div>
      </div>
      {linhas.length === 0 ? (
        <p className="rounded-2xl px-4 py-8 text-center text-sm text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]">
          {aba === 'needsYou'
            ? 'Nada esperando por você agora.'
            : aba === 'challenges'
              ? 'Nenhum desafio em andamento.'
              : 'Você ainda não mandou planos para ninguém.'}
        </p>
      ) : (
        <table className="w-full table-fixed overflow-hidden rounded-2xl text-[13.5px] shadow-[inset_0_0_0_1px_hsl(var(--border))]">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Item
              </th>
              {visiveis.map((k) => (
                <th
                  key={k}
                  scope="col"
                  className={cn(
                    'w-28 px-3 py-2.5 font-semibold lg:w-36',
                    larga(k) && 'hidden md:table-cell',
                  )}
                >
                  {OVERVIEW_COLUMNS.find((c) => c.key === k)!.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((it) => (
              <tr key={`${it.type}-${it.id}`} className="border-b border-border last:border-0">
                <td className="truncate px-4 py-3 font-semibold">
                  <Link href={itemHref(groupId, it)} className="hover:underline">
                    {it.title}
                  </Link>
                </td>
                {visiveis.map((k) => (
                  <td
                    key={k}
                    className={cn(
                      'truncate px-3 py-3 text-muted-foreground',
                      larga(k) && 'hidden md:table-cell',
                    )}
                  >
                    {k === 'type' || k === 'status' ? (
                      // Tipo e status como etiquetas, como na prancha (Pn-01).
                      <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-xs shadow-[inset_0_0_0_1px_hsl(var(--border))]">
                        {k === 'status' && (
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          />
                        )}
                        {celula(it, k)}
                      </span>
                    ) : (
                      celula(it, k)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * Visão geral do painel (#398, prancha Pn-01): os números da comunidade, a
 * atividade dos membros e o que pede ação. Os agregados (ativos em 7 dias,
 * gráfico, quem ainda não registrou) são do dono, só de quem compartilha
 * estatísticas, e somem abaixo de 5 pessoas. Só treinos entram (a política
 * de agregação não conta refeições).
 */
export default function OrgOverviewPage() {
  const g = useOrgGroup();
  // A demo (#412) tem a Visão geral dela: a Ana, a regra dos 5 e "Experimente".
  if (g.isDemo) return <DemoOverviewPage g={g} />;
  return <OwnerSetupGate g={g} />;
}

/** O guia de primeiros passos (#372) toma o Início do dono enquanto está à vista. */
function OwnerSetupGate({ g }: { g: MyGroup }) {
  const setup = useSetup(g);
  if (g.role === 'OWNER' && setup.isPending) {
    return <Skeleton className="h-96 rounded-2xl bg-card" />;
  }
  if (setup.data?.visible) return <SetupHomePage g={g} setup={setup.data} />;
  return <RealOverviewPage />;
}

function SetupHomePage({ g, setup }: { g: MyGroup; setup: CommunitySetup }) {
  useTopBarTitle(g.name);
  return <SetupHome g={g} setup={setup} />;
}

function DemoOverviewPage({ g }: { g: MyGroup }) {
  useTopBarTitle(g.name);
  return <DemoOverview g={g} />;
}

function RealOverviewPage() {
  const g = useOrgGroup();
  const dono = g.role === 'OWNER';
  useTopBarTitle(g.name);
  const painel = useOptionalSidePanel();
  const [days, setDays] = useState<OverviewDays>(30);

  const visao = useQuery({
    queryKey: orgKeys.overview(g.id, days),
    queryFn: () => panelApi.overview(g.id, days),
    placeholderData: (anterior) => anterior,
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

  const comunica = panelSections(g.role).some((s) => s.section === 'announcements');
  const onAnnounce =
    comunica && painel
      ? () =>
          painel.open({
            title: 'Novo comunicado',
            subtitle: `Mural de ${g.name}`,
            body: <AnnouncementEditor group={g} onDone={painel.close} />,
          })
      : null;

  const v = visao.data;
  // A série termina ontem: o dia de hoje não sai enquanto anda (a diferença de
  // uma hora para outra entregaria quem treinou agora).
  const hoje = useMemo(() => {
    const a = v?.aggregates?.activity;
    if (!a) return null;
    const n = a.workouts.length;
    return {
      treinos: a.workouts[n - 1]?.value ?? null,
      pessoas: a.people[n - 1]?.value ?? null,
      semanaPassada: n >= 8 ? (a.workouts[n - 8]?.value ?? null) : null,
    };
  }, [v]);

  if (visao.isPending) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl bg-card" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl bg-card" />
      </div>
    );
  }
  if (visao.isError || !v) {
    return (
      <ErrorState
        message="Não deu para abrir a visão geral."
        onRetry={() => void visao.refetch()}
      />
    );
  }

  const pedidos = v.counts.pendingRequests ?? 0;
  const ag = v.aggregates;
  const variacao =
    hoje && hoje.treinos !== null && hoje.semanaPassada
      ? Math.round(((hoje.treinos - hoje.semanaPassada) / hoje.semanaPassada) * 100)
      : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          titulo="Membros ativos"
          valor={v.members.active.toLocaleString('pt-BR')}
          tendencia={v.members.joinedLast30Days ? `+${v.members.joinedLast30Days}` : null}
          linha={
            v.members.joinedLast30Days
              ? `Entraram ${v.members.joinedLast30Days} nos últimos 30 dias`
              : 'Ninguém entrou nos últimos 30 dias'
          }
          detalhe={
            v.counts.pendingRequests === null
              ? undefined
              : pedidos === 0
                ? 'Nenhum pedido aguardando'
                : pedidos === 1
                  ? '1 pedido aguardando aprovação'
                  : `${pedidos} pedidos aguardando aprovação`
          }
          href={
            pedidos > 0
              ? `${panelHref(g.id, 'members')}?filtro=pending`
              : panelHref(g.id, 'members')
          }
        />
        {ag && (
          <Kpi
            titulo="Treinos ontem"
            valor={hoje?.treinos === null || !hoje ? '—' : hoje.treinos.toLocaleString('pt-BR')}
            tendencia={variacao === null ? null : `${variacao > 0 ? '+' : ''}${variacao}%`}
            linha={
              hoje?.treinos === null || !hoje
                ? 'Oculto: menos de 5 de cada lado'
                : variacao === null
                  ? 'Registrados ontem'
                  : `${variacao >= 0 ? 'Mais' : 'Menos'} que no mesmo dia da semana passada`
            }
            detalhe={
              hoje?.pessoas
                ? `${hoje.pessoas} pessoas treinaram`
                : 'de quem compartilha estatísticas'
            }
          />
        )}
        {ag && (
          <Kpi
            titulo="Ativos em 7 dias"
            valor={ag.active7d.value === null ? '—' : ag.active7d.value.toLocaleString('pt-BR')}
            linha={
              ag.active7d.value === null ? 'Oculto: menos de 5 de cada lado' : 'Registraram treino'
            }
            detalhe={
              ag.active7d.percent === null
                ? 'de quem compartilha estatísticas'
                : `${ag.active7d.percent}% de quem compartilha estatísticas`
            }
          />
        )}
        {dono && (
          <Kpi
            titulo="Assentos PRO"
            valor={
              assentos.data?.pool
                ? `${assentos.data.assigned}/${assentos.data.pool.seats}`
                : assentos.isPending
                  ? '…'
                  : '0'
            }
            linha={
              assentos.data?.pool
                ? `${Math.max(0, assentos.data.pool.seats - assentos.data.assigned)} assentos livres`
                : 'Sem assentos'
            }
            detalhe={assentos.data ? seatSummary(assentos.data) : undefined}
            href={panelHref(g.id, 'seats')}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {v.counts.pendingInvites !== null && (
          <Faixa
            icon={Send}
            titulo="Ativação pendente"
            texto={
              v.counts.pendingInvites
                ? activationLabel(v.counts.pendingInvites)
                : 'Nenhum convite esperando'
            }
            href={panelHref(g.id, 'activation')}
            destaque={v.counts.pendingInvites > 0}
          />
        )}
        <Faixa
          icon={Users}
          titulo="Novos esta semana"
          texto={newThisWeekLabel(v.newThisWeek)}
          href={panelHref(g.id, 'members')}
        />
        {ag?.notLoggedYet != null && (
          <Faixa
            icon={Clock}
            titulo="Entraram e ainda não registraram"
            texto={notLoggedYetLabel(ag.notLoggedYet)}
            href={panelHref(g.id, 'activation')}
          />
        )}
      </div>

      {ag && <Atividade data={ag.activity} days={days} onDays={setDays} />}

      <Itens groupId={g.id} membershipId={g.membershipId} items={v.items} onAnnounce={onAnnounce} />

      {dono ? (
        <section aria-labelledby="relatorio" className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="relatorio" className="text-sm font-semibold">
              Retenção e comportamento
            </h2>
            <Link
              href={panelHref(g.id, 'report')}
              className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Relatório do mês <ChevronRight size={14} aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <InsightsCard
              groupId={g.id}
              panel="retention"
              title="Retenção"
              className={paineis.data?.behavior ? undefined : 'lg:col-span-2'}
            />
            {paineis.data?.behavior && (
              <InsightsCard groupId={g.id} panel="behavior" title="Comportamento" exportable />
            )}
          </div>
        </section>
      ) : (
        <p className="text-xs text-muted-foreground">
          {groupCan(g, 'member.file')
            ? 'Os números agregados da comunidade são do dono. Você vê cada membro pelo que ele compartilha com você, em Membros.'
            : 'Os números agregados da comunidade são do dono. Seu papel não vê dados de alunos.'}
        </p>
      )}
    </div>
  );
}
