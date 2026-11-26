'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  filterReview,
  panelHref,
  reviewAction,
  reviewApi,
  reviewFiltersFor,
  reviewKindLabel,
  reviewLine,
  REVIEW_TIPS,
  REVIEW_TIPS_SEEN_KEY,
  reviewWhatsappText,
  riskDaysOptions,
  riskKindLabel,
  riskLine,
  riskWhatsappText,
  sharesLine,
  splitReview,
  whatsappTextHref,
  type AtRiskRow,
  type PanelReviewItem,
  type ReviewFilter,
} from '@fatia/api-client';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export type ReviewTab = 'open' | 'seen' | 'risk';
type Tab = ReviewTab;

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

/** Cor da etiqueta "Tipo", como a prancha (ok, alerta, ruim, neutro). */
const TONE: Record<string, string> = {
  treino: 'bg-primary/10 text-primary',
  meta: 'bg-primary/10 text-primary',
  plano: 'bg-warning/10 text-warning',
  parado: 'bg-warning/10 text-warning',
  'sem treino': 'bg-warning/10 text-warning',
  'não começou': 'bg-muted text-muted-foreground',
  sumiu: 'bg-danger/10 text-danger',
};

function Tag({ label }: { label: string }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold',
        TONE[label] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  );
}

function Person({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold"
      >
        {initials(name)}
      </span>
      <span className="truncate font-semibold">{name}</span>
    </span>
  );
}

function WhatsappLink({ phone, text, label }: { phone: string; text: string; label: string }) {
  const href = whatsappTextHref(phone, text);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))] hover:bg-muted"
    >
      <MessageCircle aria-hidden className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

const th = 'px-3 py-2.5 text-left font-semibold';
const td = 'px-3 py-3 align-middle';
// No celular a linha vira um cartão: nome e ações em cima, o que aconteceu
// embaixo, na largura toda (o cabeçalho some). No computador, tabela normal.
const ROW =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center border-t border-border first:border-t-0 md:table-row md:first:border-t';
const PERSON = 'col-start-1 row-start-1 min-w-0';
const ACTIONS = 'col-start-2 row-start-1';
const LINE = 'col-span-2 row-start-2 pt-0 text-muted-foreground md:pt-3';

/**
 * "Para revisar" (#399, prancha Pn-02): numa fila só, o que os membros
 * compartilharam com quem olha nos últimos 7 dias e as respostas ao que a
 * equipe mandou; "Visto" tira da fila de quem marcou. A aba "Em risco" lista,
 * pelo nome, só quem deu vínculo a quem olha. Cada leitura entra no histórico
 * que o membro vê.
 */
const TAB_TITLE: Record<Tab, string> = {
  open: 'Para revisar',
  seen: 'Revisados',
  risk: 'Em risco',
};

function tipsSeen(): boolean {
  try {
    return window.localStorage.getItem(REVIEW_TIPS_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * As 2 dicas de primeiro uso do profissional (#372, prancha Onb-E3). Vistas,
 * não voltam neste navegador (preferência de tela, não dado).
 */
function ReviewTips() {
  const [step, setStep] = useState(() => (tipsSeen() ? -1 : 0));
  if (step < 0 || step >= REVIEW_TIPS.length) return null;
  const tip = REVIEW_TIPS[step]!;
  const last = step === REVIEW_TIPS.length - 1;
  const label = `Dica ${step + 1} de ${REVIEW_TIPS.length}`;
  return (
    <section
      aria-label={label}
      className="flex flex-wrap items-center gap-3 rounded-2xl bg-primary-soft p-4 shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.5)]"
    >
      <span className="min-w-0 flex-1 basis-64">
        <b className="block text-[14.5px]">{tip.title}</b>
        <span className="text-[13px] text-muted-foreground">{tip.body}</span>
      </span>
      <span className="ml-auto text-xs font-semibold text-muted-foreground">{label}</span>
      <Button
        size="sm"
        onClick={() => {
          if (last) {
            try {
              window.localStorage.setItem(REVIEW_TIPS_SEEN_KEY, '1');
            } catch {
              // Sem armazenamento: as dicas só somem nesta visita.
            }
          }
          setStep(step + 1);
        }}
      >
        {last ? 'Entendi' : 'Próxima'}
      </Button>
    </section>
  );
}

export function ReviewScreen({
  initialTab,
  subpage = false,
}: {
  initialTab: ReviewTab;
  /** Aberta por caminho próprio (`/review/at-risk`): a migalha diz a aba, não "Detalhe". */
  subpage?: boolean;
}) {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab);
  useTopBarTitle(subpage ? TAB_TITLE[tab] : null);
  const [filter, setFilter] = useState<ReviewFilter>('all');

  const queueKey = [...orgKeys.all(g.id), 'review'] as const;
  const riskKey = [...orgKeys.all(g.id), 'at-risk'] as const;
  const queue = useQuery({ queryKey: queueKey, queryFn: () => reviewApi.queue(g.id) });
  const risk = useQuery({ queryKey: riskKey, queryFn: () => reviewApi.atRisk(g.id) });

  const seen = useMutation({
    mutationFn: (i: PanelReviewItem) => reviewApi.markSeen(g.id, i.kind, i.refId),
    onSuccess: (_r, i) => {
      toast(`${i.name} · foi para Revisados`);
      void qc.invalidateQueries({ queryKey: queueKey });
    },
    onError: () => toast('Não deu para marcar. Tente de novo.'),
  });
  const riskDays = useMutation({
    mutationFn: (days: number) => reviewApi.setRiskDays(g.id, days),
    onSuccess: () => void qc.invalidateQueries({ queryKey: riskKey }),
    onError: () => toast('Não deu para mudar o limite.'),
  });
  const digest = useMutation({
    mutationFn: (enabled: boolean) => reviewApi.setDigest(g.id, enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: riskKey }),
    onError: () => toast('Não deu para mudar o aviso.'),
  });

  // Cada aba carrega e erra sozinha: a fila fora do ar não tira o Em risco.
  const { open, seen: done } = splitReview(queue.data?.items ?? []);
  const riskRows = risk.data?.rows ?? [];
  const tabs: { key: Tab; label: string; n: number | null }[] = [
    { key: 'open', label: 'Para revisar', n: queue.data ? open.length : null },
    { key: 'seen', label: 'Revisados', n: queue.data ? done.length : null },
    { key: 'risk', label: 'Em risco', n: risk.data ? riskRows.length : null },
  ];
  const list = filterReview(tab === 'seen' ? done : open, filter);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Para revisar</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Só aparece o que o membro compartilhou com você, mais as respostas ao que a equipe enviou.
          Cada abertura de ficha e de sessão entra no histórico que o membro vê.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Fila"
          className="flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-card p-[3px]"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-[13px] font-semibold',
                tab === t.key
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.n === null ? t.label : `${t.label} · ${t.n}`}
            </button>
          ))}
        </div>
        {tab !== 'risk' && (
          <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por tipo">
            {reviewFiltersFor().map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'h-[30px] rounded-lg px-2.5 text-[13px] font-semibold',
                  filter === f.key
                    ? 'bg-primary/10 text-primary shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.4)]'
                    : 'bg-card text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'open' && g.role === 'PROFESSIONAL' && open.length > 0 && <ReviewTips />}

      {tab === 'risk' ? (
        <RiskTab
          groupId={g.id}
          loading={risk.isPending}
          failed={risk.isError}
          onRetry={() => void risk.refetch()}
          rows={riskRows}
          riskDays={risk.data?.riskDays ?? 7}
          canConfigure={risk.data?.canConfigure ?? false}
          digest={risk.data?.digest ?? false}
          onRiskDays={(d) => riskDays.mutate(d)}
          onDigest={(on) => digest.mutate(on)}
        />
      ) : queue.isPending ? (
        <Skeleton className="h-72 rounded-2xl bg-card" />
      ) : queue.isError ? (
        <ErrorState message="Não deu para abrir a fila." onRetry={() => void queue.refetch()} />
      ) : list.length === 0 ? (
        <p className="rounded-2xl px-4 py-10 text-center text-sm text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]">
          {filter !== 'all'
            ? 'Nada aqui com este filtro.'
            : tab === 'open'
              ? 'Nada para revisar agora.'
              : 'Nada revisado nos últimos 7 dias.'}
        </p>
      ) : (
        <table className="block w-full overflow-hidden rounded-2xl text-[13.5px] shadow-[inset_0_0_0_1px_hsl(var(--border))] md:table md:table-fixed">
          <thead className="hidden bg-card text-xs text-muted-foreground md:table-header-group">
            <tr>
              <th scope="col" className={cn(th, 'w-[38%] md:w-48')}>
                Membro
              </th>
              <th scope="col" className={cn(th, 'hidden w-28 md:table-cell')}>
                Tipo
              </th>
              <th scope="col" className={th}>
                O que aconteceu
              </th>
              <th scope="col" className={cn(th, 'hidden w-44 lg:table-cell')}>
                Compartilha
              </th>
              <th scope="col" className={cn(th, 'w-[34%] md:w-64')}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {list.map((i) => {
              const go = reviewAction(g.id, i);
              return (
                <tr key={`${i.kind}-${i.refId}`} className={ROW}>
                  <td className={cn(td, PERSON)}>
                    <Person name={i.name} />
                  </td>
                  <td className={cn(td, 'hidden md:table-cell')}>
                    <Tag label={reviewKindLabel(i)} />
                  </td>
                  <td className={cn(td, LINE)}>
                    <span className="line-clamp-2">{reviewLine(i)}</span>
                  </td>
                  <td className={cn(td, 'hidden truncate text-muted-foreground lg:table-cell')}>
                    {sharesLine(i.shares)}
                  </td>
                  <td className={cn(td, ACTIONS)}>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Link
                        href={go.href}
                        className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-semibold text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))] hover:bg-muted"
                      >
                        {go.label}
                      </Link>
                      {i.whatsapp && (
                        <WhatsappLink
                          phone={i.whatsapp}
                          text={reviewWhatsappText(i)}
                          label="WhatsApp"
                        />
                      )}
                      {i.seenAt === null ? (
                        <Button
                          size="sm"
                          variant="text"
                          className="h-8"
                          disabled={seen.isPending && seen.variables?.refId === i.refId}
                          onClick={() => seen.mutate(i)}
                        >
                          Visto
                        </Button>
                      ) : (
                        <span className="inline-flex h-8 items-center gap-1 px-1 text-xs font-semibold text-primary">
                          <Check aria-hidden className="h-3.5 w-3.5" />
                          revisado
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RiskTab({
  groupId,
  loading,
  failed,
  onRetry,
  rows,
  riskDays,
  canConfigure,
  digest,
  onRiskDays,
  onDigest,
}: {
  groupId: string;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  rows: AtRiskRow[];
  riskDays: number;
  canConfigure: boolean;
  digest: boolean;
  onRiskDays: (d: number) => void;
  onDigest: (on: boolean) => void;
}) {
  if (loading) return <Skeleton className="h-48 rounded-2xl bg-card" />;
  if (failed) return <ErrorState message="Não deu para abrir o em risco." onRetry={onRetry} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-2xl p-4 shadow-[inset_0_0_0_1px_hsl(var(--border))] md:flex-row md:items-center md:justify-between">
        <div className="space-y-1 text-sm">
          {canConfigure ? (
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Entra na lista depois de</span>
              <select
                aria-label="Entra na lista depois de"
                value={riskDays}
                onChange={(e) => onRiskDays(Number(e.target.value))}
                className="h-8 rounded-lg bg-card px-2 text-sm font-semibold shadow-[inset_0_0_0_1px_hsl(var(--border))]"
              >
                {riskDaysOptions(riskDays).map((d) => (
                  <option key={d} value={d}>
                    {d} dias sem registrar
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-muted-foreground">
              Entra na lista depois de {riskDays} dias sem registrar.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Com o dobro disso, “sumiu”. Quem não compartilha com você fica fora desta lista e só
            aparece no Relatório, em faixas sem nome.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">Aviso diário às 9h, só com o número</span>
          <Switch
            checked={digest}
            onCheckedChange={onDigest}
            label="Aviso diário de quem precisa de atenção"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl px-4 py-10 text-center text-sm text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]">
          Ninguém em risco agora.
        </p>
      ) : (
        <table className="block w-full overflow-hidden rounded-2xl text-[13.5px] shadow-[inset_0_0_0_1px_hsl(var(--border))] md:table md:table-fixed">
          <thead className="hidden bg-card text-xs text-muted-foreground md:table-header-group">
            <tr>
              <th scope="col" className={cn(th, 'w-[38%] md:w-48')}>
                Membro
              </th>
              <th scope="col" className={cn(th, 'hidden w-28 md:table-cell')}>
                Tipo
              </th>
              <th scope="col" className={th}>
                Sinal
              </th>
              <th scope="col" className={cn(th, 'hidden w-44 lg:table-cell')}>
                Compartilha
              </th>
              <th scope="col" className={cn(th, 'w-[34%] md:w-64')}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {rows.map((r) => (
              <tr key={r.membershipId} className={ROW}>
                <td className={cn(td, PERSON)}>
                  <Person name={r.name} />
                </td>
                <td className={cn(td, 'hidden md:table-cell')}>
                  <Tag label={riskKindLabel(r)} />
                </td>
                <td className={cn(td, LINE)}>
                  <span className="line-clamp-2">{riskLine(r)}</span>
                </td>
                <td className={cn(td, 'hidden truncate text-muted-foreground lg:table-cell')}>
                  {sharesLine(r.shares)}
                </td>
                <td className={cn(td, ACTIONS)}>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Link
                      href={`${panelHref(groupId, 'members')}/${r.membershipId}`}
                      className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-semibold text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))] hover:bg-muted"
                    >
                      Abrir ficha
                    </Link>
                    {r.whatsapp && (
                      <WhatsappLink
                        phone={r.whatsapp}
                        text={riskWhatsappText(r)}
                        label="Chamar no WhatsApp"
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
