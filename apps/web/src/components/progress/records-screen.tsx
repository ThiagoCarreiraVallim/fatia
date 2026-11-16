'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RECORDS_NOTE,
  RECORD_GROUP_FILTERS,
  recordHighlight,
  strengthRecordRows,
  workoutApi,
  type RecordGroupFilter,
} from '@fatia/api-client';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';

/**
 * Recordes (prancha Al-G5, #382): a maior evolução do mês em % de 1RM estimado (compara
 * exercícios de cargas bem diferentes) e a lista por grupo, da maior carga para a menor.
 */
export function RecordsScreen() {
  const { loadUnit } = useUnitPrefs();
  const [group, setGroup] = useState<RecordGroupFilter>('all');
  const query = useQuery({
    queryKey: ['workout', 'records', 'overview'],
    queryFn: () => workoutApi.recordsOverview(),
  });
  const highlight = query.data ? recordHighlight(query.data, loadUnit) : null;
  const rows = query.data ? strengthRecordRows(query.data, group, loadUnit) : [];

  return (
    <div className="flex flex-col gap-3 px-4 pb-8 pt-2">
      {query.isError && (
        <ErrorState
          message="Não deu para carregar os recordes."
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isLoading && <Skeleton className="h-[360px] rounded-card" />}

      {highlight && (
        <section className="flex flex-col gap-2 rounded-card bg-primary p-4 text-primary-foreground">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-70">
            Maior evolução do mês
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-[20px] font-bold leading-tight">
              {highlight.title}
            </span>
            <span className="font-display text-[28px] font-bold tabular-nums">
              {highlight.percent}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-pill bg-[hsl(var(--primary-foreground)/0.2)]"
            aria-hidden
          >
            <div
              className="h-full rounded-pill bg-primary-foreground"
              style={{ width: `${highlight.barPercent}%` }}
            />
          </div>
          <span className="text-[13px] font-semibold tabular-nums opacity-80">
            {highlight.scale}
          </span>
        </section>
      )}

      {query.data && (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {RECORD_GROUP_FILTERS.map((f) => (
              <Chip key={f.value} selected={group === f.value} onClick={() => setGroup(f.value)}>
                {f.label}
              </Chip>
            ))}
          </div>

          <ul aria-label="Recordes" className="flex flex-col overflow-hidden rounded-card bg-card">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 [&+&]:shadow-[inset_0_1px_0_hsl(var(--border))]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[hsl(var(--steps)/0.14)] text-steps">
                  <Icon name="trophy" size={18} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{r.title}</span>
                  <span className="truncate text-[12px] text-muted-foreground">{r.subtitle}</span>
                </div>
                <b className="shrink-0 font-display text-[18px] tabular-nums">
                  {r.value}
                  <span className="ml-0.5 text-[12px] font-semibold text-muted-foreground">
                    {r.unit}
                  </span>
                </b>
              </li>
            ))}
          </ul>
          {rows.length === 0 && (
            <EmptyState
              title="Nenhum recorde aqui"
              description="Os recordes aparecem conforme você registra séries com carga."
            />
          )}

          <p className="px-1 text-[13px] text-muted-foreground">{RECORDS_NOTE}</p>
        </>
      )}
    </div>
  );
}
