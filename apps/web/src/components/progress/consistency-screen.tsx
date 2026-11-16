'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CONSISTENCY_RANGE_OPTIONS,
  CONSISTENCY_WEEKDAY_LABELS,
  consistencyAreaRows,
  consistencyCells,
  consistencyGridCaption,
  consistencyGridTitle,
  consistencyStats,
  consistencyTip,
  consistencyYearMonths,
  progressApi,
  shortDay,
  type ConsistencyRange,
  type ConsistencyReport,
} from '@fatia/api-client';
import { ErrorState } from '@/components/ui/error-state';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { HEAT_SHADES, ProgressBar } from './progress-ui';

const AREA_BAR: Record<string, string> = {
  primary: 'bg-primary',
  protein: 'bg-protein',
  water: 'bg-water',
  steps: 'bg-steps',
};
const AREA_ICON: Record<string, string> = {
  primary: 'text-primary',
  protein: 'text-protein',
  water: 'text-water',
  steps: 'text-steps',
};

/**
 * Constância (prancha Al-G12, #382). Um dia é ativo com uma área cumprida: refeição,
 * treino, água na meta ou passos na meta. A cor é quantas áreas o dia cumpriu.
 */
export function ConsistencyScreen() {
  const [range, setRange] = useState<ConsistencyRange>('month');
  const query = useQuery({
    queryKey: ['progress', 'consistency', range],
    queryFn: () => progressApi.consistency(range),
  });
  const report = query.data;

  return (
    <div className="flex flex-col gap-3 px-4 pb-8 pt-2">
      <Segmented
        label="Período"
        options={CONSISTENCY_RANGE_OPTIONS}
        value={range}
        onChange={setRange}
      />

      {query.isError && (
        <ErrorState
          message="Não deu para carregar a constância."
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isLoading && <Skeleton className="h-[420px] rounded-card" />}

      {report && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {consistencyStats(report).map((s) => (
              <div key={s.label} className="flex flex-col gap-0.5 rounded-card bg-card px-3.5 py-3">
                <b className="flex items-center gap-1 font-display text-[22px] tabular-nums">
                  {s.value}
                  {s.fire && <Icon name="flame" size={18} className="text-warning" />}
                </b>
                <span className="text-[13px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          <section
            className="flex flex-col gap-3 rounded-card bg-card p-4"
            aria-label={consistencyGridTitle(report)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[15px] font-bold">{consistencyGridTitle(report)}</span>
                <span className="text-[12px] text-muted-foreground">
                  {consistencyGridCaption(report)}
                </span>
              </div>
              {report.range !== 'year' && (
                <span
                  className="flex items-center gap-1 text-[11px] text-muted-foreground"
                  aria-hidden
                >
                  0
                  {HEAT_SHADES.map((c) => (
                    <i key={c} className={cn('h-2.5 w-2.5 rounded-[3px]', c)} />
                  ))}
                  4
                </span>
              )}
            </div>
            <Grid report={report} />
          </section>

          <section className="flex flex-col gap-3 rounded-card bg-card p-4">
            <span className="text-[15px] font-bold">
              Por área <span className="font-normal text-muted-foreground">· dias na meta</span>
            </span>
            {consistencyAreaRows(report).map((row) => (
              <div key={row.area} className="flex items-center gap-3">
                <Icon name={row.icon} size={18} className={AREA_ICON[row.tone]} />
                <span className="w-[92px] shrink-0 text-sm">{row.label}</span>
                <div className="flex-1">
                  <ProgressBar percent={row.percent} colorClass={AREA_BAR[row.tone]} />
                </div>
                <span className="w-[56px] shrink-0 text-right text-[13px] font-bold tabular-nums">
                  {row.text}
                </span>
              </div>
            ))}
          </section>

          <p className="flex items-start gap-2 px-1 text-[13px] text-muted-foreground">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            {consistencyTip(report)}
          </p>
        </>
      )}
    </div>
  );
}

function Grid({ report }: { report: ConsistencyReport }) {
  if (report.range === 'year') {
    const months = consistencyYearMonths(report);
    return (
      <div
        className="flex h-[150px] items-end gap-1.5"
        role="img"
        aria-label={months.map((m) => `${m.name}: ${m.percent}%`).join(', ')}
      >
        {months.map((m) => (
          <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground">{m.percent}</span>
            <i
              aria-hidden
              className={cn(
                'anim-grow-y w-full rounded-[4px]',
                m.current ? 'bg-primary' : 'bg-[hsl(var(--primary)/0.45)]',
              )}
              style={{ height: `${Math.max(4, m.percent)}%` }}
            />
            <span className="text-[11px] text-muted-foreground">{m.label}</span>
          </div>
        ))}
      </div>
    );
  }

  const cells = consistencyCells(report);
  const active = report.days.filter((d) => d.count > 0).length;
  const label = `${active} de ${report.days.length} dias ativos entre ${shortDay(report.from)} e ${shortDay(report.to)}`;

  if (report.range === 'quarter') {
    return (
      <div role="img" aria-label={label} className="grid grid-flow-col grid-rows-7 gap-1">
        {cells.map((c) => (
          <Cell key={c.date} kind={c.kind} level={c.level} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1.5" aria-hidden>
        {CONSISTENCY_WEEKDAY_LABELS.map((l, i) => (
          <span key={i} className="text-center text-[11px] text-muted-foreground">
            {l}
          </span>
        ))}
      </div>
      <div role="img" aria-label={label} className="grid grid-cols-7 gap-1.5">
        {cells.map((c) => (
          <Cell key={c.date} kind={c.kind} level={c.level} day={c.day} />
        ))}
      </div>
    </div>
  );
}

function Cell({ kind, level, day }: { kind: string; level: number; day?: number }) {
  if (kind === 'outside') return <i aria-hidden className="aspect-square" />;
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex aspect-square items-center justify-center rounded-[6px] text-[11px] tabular-nums',
        kind === 'future' && 'shadow-[inset_0_0_0_1px_hsl(var(--border))] text-faint',
        kind === 'past' && HEAT_SHADES[level],
        kind === 'past' && level >= 3 ? 'text-primary-foreground' : 'text-muted-foreground',
      )}
    >
      {day}
    </span>
  );
}
