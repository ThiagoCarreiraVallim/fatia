'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  OVERVIEW_RANGES,
  achievementTally,
  averagePace,
  bucketize,
  formatDecimal,
  formatInteger,
  formatPace,
  progressApi,
  signedDelta,
  signedPercent,
  strengthRecordCount,
  trendPercent,
  workoutApi,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { TopBarActions } from '@/components/layout/app-top-bar';
import { cn } from '@/lib/utils';
import { HeatCell, MiniBars, Sparkline, ToneBadge } from './progress-ui';

/**
 * Progresso (prancha Al-G1, #382): o peso com os três mini gráficos, a constância dos
 * últimos 14 dias e os atalhos para % de gordura, recordes e conquistas.
 */
export function ProgressScreen() {
  const [range, setRange] = useState('30');
  const days = Number(range);

  const weight = useQuery({
    queryKey: ['progress', 'weight', days],
    queryFn: () => progressApi.weight(days),
  });
  const steps = useQuery({
    queryKey: ['progress', 'steps', days],
    queryFn: () => progressApi.steps(days),
  });
  const volume = useQuery({
    queryKey: ['progress', 'volume', days],
    queryFn: () => progressApi.volume(days),
  });
  const cardio = useQuery({
    queryKey: ['progress', 'cardio', 'all', days, 'pace'],
    queryFn: () => progressApi.cardio(null, days, 'pace'),
  });
  const consistency = useQuery({
    queryKey: ['progress', 'consistency', 'month'],
    queryFn: () => progressApi.consistency('month'),
  });
  const records = useQuery({
    queryKey: ['workout', 'records', 'overview'],
    queryFn: () => workoutApi.recordsOverview(),
  });
  const achievements = useQuery({
    queryKey: ['achievements', 'list'],
    queryFn: () => progressApi.listAchievements(),
  });

  const w = weight.data;
  const weightValues = w?.points.map((p) => p.weightKg) ?? [];
  const current = w?.currentWeightKg ?? null;

  const stepValues = steps.data?.points.map((p) => p.steps) ?? [];
  const volumeValues = volume.data?.weeks.map((x) => x.totalVolumeKg) ?? [];
  const strengthTrend = trendPercent(volumeValues);
  const pace = cardio.data ? averagePace(cardio.data) : null;
  const paceValues = (cardio.data?.points ?? [])
    .map((p) => p.paceSecondsPerKm)
    .filter((v): v is number => v !== null)
    // Ritmo menor é melhor: invertido, a linha sobe quando melhora.
    .map((v) => -v);

  const minis: {
    label: string;
    icon: IconName;
    iconClass: string;
    value: string;
    unit: string;
    chart: React.ReactNode;
  }[] = [
    {
      label: 'Passos',
      icon: 'steps',
      iconClass: 'text-steps',
      value: steps.data && stepValues.length ? formatInteger(steps.data.averageDaily) : '—',
      unit: '',
      chart: <MiniBars values={bucketize(stepValues, 12)} height={22} colorClass="bg-steps" />,
    },
    {
      label: 'Força',
      icon: 'dumbbell',
      iconClass: 'text-primary',
      value: strengthTrend === null ? '—' : signedPercent(strengthTrend),
      unit: '',
      chart: <Sparkline values={volumeValues} height={22} fill={false} />,
    },
    {
      label: 'Cardio',
      icon: 'heart',
      iconClass: 'text-danger',
      value: formatPace(pace),
      unit: pace === null ? '' : ' /km',
      chart: <Sparkline values={paceValues} height={22} fill={false} colorClass="text-danger" />,
    },
  ];

  const report = consistency.data;
  const last14 = report?.days.slice(-14) ?? [];
  const tally = achievements.data ? achievementTally(achievements.data) : null;
  const recordCount = records.data ? strengthRecordCount(records.data) : null;

  return (
    <div className="flex flex-col gap-3 px-4 pb-8 pt-2">
      <TopBarActions>
        <Segmented
          label="Período"
          options={OVERVIEW_RANGES.map((r) => ({ value: String(r.value), label: r.label }))}
          value={range}
          onChange={setRange}
          className="w-[210px]"
        />
      </TopBarActions>

      <section className="flex flex-col gap-3 rounded-card bg-card p-4">
        <Link
          href="/progress/charts"
          className="flex flex-col gap-1"
          aria-label="Peso, ver gráfico"
        >
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-muted-foreground">Peso</span>
            {w && weightValues.length >= 2 && (
              <ToneBadge tone="ok">{signedDelta(w.totalDeltaKg, 'kg')}</ToneBadge>
            )}
          </div>
          <span className="font-display text-[40px] font-bold leading-none tracking-tight tabular-nums">
            {current === null ? '—' : formatDecimal(current)}
            <span className="ml-1 text-base font-semibold text-muted-foreground">kg</span>
          </span>
          <Sparkline values={weightValues} height={56} className="mt-1" />
        </Link>

        <div className="grid grid-cols-3 gap-2">
          {minis.map((m) => (
            <Link
              key={m.label}
              href="/progress/charts"
              className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-muted px-2.5 pb-2 pt-2.5"
            >
              <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                <Icon name={m.icon} size={16} className={m.iconClass} />
                {m.label}
              </span>
              <b className="whitespace-nowrap text-base tabular-nums">
                {m.value}
                <span className="text-[11px] font-semibold text-muted-foreground">{m.unit}</span>
              </b>
              {m.chart}
            </Link>
          ))}
        </div>

        <Link
          href="/progress/charts"
          className="flex min-h-5 items-center justify-between pt-3 shadow-[inset_0_1px_0_hsl(var(--border))]"
        >
          <span className="text-sm font-bold">Ver todos os gráficos</span>
          <Icon name="chevR" size={16} className="text-faint" />
        </Link>
      </section>

      <Link href="/progress/consistency" className="flex flex-col gap-3 rounded-card bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] text-muted-foreground">
            Constância{' '}
            {report && (
              <span className="text-warning">
                · {report.streak.periodos}{' '}
                {report.streak.periodos === 1 ? 'dia seguido' : 'dias seguidos'}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-sm font-bold tabular-nums">
              {report ? `${report.activeDays}/${report.totalDays} dias` : '—'}
            </span>
            <Icon name="chevR" size={16} className="text-faint" />
          </span>
        </div>
        <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1">
          {last14.map((d) => (
            <HeatCell key={d.date} level={d.count} className="aspect-square" />
          ))}
        </div>
      </Link>

      <div className="grid grid-cols-3 gap-2">
        {/* % de gordura vem da avaliação física (Al-G2), que chega com a #383. Até lá o
            cartão fica, sem link e sem número: é o ponto de extensão da tela. */}
        <SmallCard icon="ruler" iconClass="text-steps" value="—" label="gordura" />
        <SmallCard
          href="/progress/records"
          icon="trophy"
          iconClass="text-steps"
          value={recordCount === null ? '—' : String(recordCount)}
          label="recordes"
        />
        <SmallCard
          href="/progress/achievements"
          icon="medal"
          iconClass="text-primary"
          value={tally ? `${tally.got}/${tally.total}` : '—'}
          label="conquistas"
        />
      </div>
    </div>
  );
}

function SmallCard({
  href,
  icon,
  iconClass,
  value,
  label,
}: {
  href?: string;
  icon: IconName;
  iconClass: string;
  value: string;
  label: string;
}) {
  const body = (
    <>
      <Icon name={icon} className={iconClass} />
      <span className="font-display text-[22px] font-bold leading-tight tabular-nums">{value}</span>
      <span className="text-[13px] text-muted-foreground">{label}</span>
    </>
  );
  const cls = cn('flex flex-col gap-1 rounded-card bg-card p-3.5');
  return href ? (
    <Link href={href} className={cls} aria-label={`${value} ${label}`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
