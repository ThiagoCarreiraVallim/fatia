'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Heart, History } from 'lucide-react';
import {
  HISTORY_FILTERS,
  feelingOf,
  historyDay,
  historyLine,
  historyTitle,
  historyTotals,
  sessionKindLabel,
  workoutApi,
  type WorkoutHistoryItem,
} from '@fatia/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { ErrorState } from '@/components/elements/error-state';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'plan' | 'free';

const OPTIONS = HISTORY_FILTERS.map((f) => ({
  value: (f.kind ?? 'all') as Filter,
  label: f.label,
}));

function Row({ item, first }: { item: WorkoutHistoryItem; first: boolean }) {
  const units = useUnitPrefs();
  const day = historyDay(item.startedAt);
  const feeling = feelingOf(item.feeling);
  const title = historyTitle(item);
  const line = historyLine(item, units);
  return (
    <li className={cn(!first && 'border-t border-border')}>
      <Link
        href={`/workout/history/${item.id}`}
        aria-label={`${title}, ${day.weekday} ${day.day}. ${line}`}
        className="flex min-h-[68px] items-center gap-3"
      >
        <span aria-hidden className="flex w-10 shrink-0 flex-col items-center gap-0.5">
          <span className="text-[11px] uppercase text-muted-foreground">{day.weekday}</span>
          <b className="text-lg tabular-nums">{day.day}</b>
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold">{title}</span>
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
              {sessionKindLabel(item.kind)}
            </span>
          </span>
          <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            {item.cardio && <Heart size={14} aria-hidden className="shrink-0 text-danger" />}
            <span className="truncate">{line}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span aria-hidden className="text-lg leading-tight">
            {feeling?.emoji ?? ''}
          </span>
          {item.durationMinutes != null && (
            <span className="text-sm tabular-nums text-muted-foreground">
              {item.durationMinutes} min
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

/**
 * Histórico (prancha `Al-T10`, #381): os totais (sessões, duração média e
 * volume), o filtro por tipo e as sessões concluídas, cada uma com o tipo, o
 * resumo e a sensação. O toque abre o detalhe (Al-T11).
 *
 * **Ponto de extensão (#380):** a aba "Circuitos" entra em `HISTORY_FILTERS`.
 */
export default function WorkoutHistoryPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const units = useUnitPrefs();
  const kind = filter === 'all' ? undefined : filter;
  const history = useInfiniteQuery({
    queryKey: ['workout', 'history', kind ?? 'all'],
    queryFn: ({ pageParam }) => workoutApi.getHistory({ kind, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const first = history.data?.pages[0];
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4 px-4 pt-2 pb-4">
      {first && (
        <dl className="grid grid-cols-3 gap-2">
          {historyTotals(first.totals, units.loadUnit).map((t) => (
            <div key={t.label} className="flex flex-col gap-0.5 rounded-[18px] bg-card p-3.5">
              <dt className="order-last text-sm text-muted-foreground">{t.label}</dt>
              <dd className="text-[22px] font-bold tabular-nums">{t.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <Segmented options={OPTIONS} value={filter} onChange={setFilter} label="Tipo de treino" />

      {history.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {history.isError && (
        <ErrorState
          className="max-w-none"
          title="Não foi possível carregar o histórico"
          detail={history.error instanceof Error ? history.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void history.refetch()}
        />
      )}

      {history.data && items.length === 0 && (
        <EmptyState
          icon={History}
          title={filter === 'all' ? 'Nenhum treino registrado ainda' : 'Nenhum treino deste tipo'}
          description="Os treinos que você terminar aparecem aqui."
        />
      )}

      {items.length > 0 && (
        <ol aria-label="Sessões" className="rounded-card bg-card px-4">
          {items.map((item, i) => (
            <Row key={item.id} item={item} first={i === 0} />
          ))}
        </ol>
      )}

      {history.hasNextPage && (
        <button
          type="button"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
          className="anim-press flex min-h-11 w-full items-center justify-center rounded-pill bg-card text-sm font-bold disabled:opacity-60"
        >
          {history.isFetchingNextPage ? 'Carregando...' : 'Ver mais'}
        </button>
      )}
    </div>
  );
}
