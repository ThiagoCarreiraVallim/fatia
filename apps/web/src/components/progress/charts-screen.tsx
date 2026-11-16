'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CHART_KINDS,
  CHART_NOTES,
  CHART_RANGES,
  STRENGTH_METRICS,
  averagePace,
  bucketize,
  describeSeries,
  cardioSummary,
  formatDecimal,
  formatInteger,
  formatPace,
  loadNumber,
  loadUnitLabel,
  progressApi,
  shortDayOf,
  signedDelta,
  signedPercent,
  stepsSummary,
  strengthSummary,
  trendPercent,
  weightSummary,
  workoutApi,
  type ChartKind,
  type ChartSummaryItem,
  type Exercise,
  type StrengthChartMetric,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ErrorState } from '@/components/ui/error-state';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { BodyLogSheet } from './body-log-sheet';
import { ExercisePickerDrawer } from './exercise-picker-drawer';
import { MiniBars, Sparkline, ToneBadge } from './progress-ui';

interface ChartView {
  label: string;
  big: string;
  delta: string | null;
  deltaTone: 'ok' | 'warn' | 'mute';
  bars: number[] | null;
  line: number[] | null;
  summary: ChartSummaryItem[];
  loading: boolean;
  error: boolean;
  retry: () => void;
}

/**
 * Gráficos (prancha Al-G6, #382): Peso, Passos, Força e Cardio no mesmo cartão, com o
 * período, o resumo de três números e de onde o dado vem.
 */
export function ChartsScreen() {
  const { loadUnit } = useUnitPrefs();
  const [range, setRange] = useState('30');
  const days = Number(range);
  const [kind, setKind] = useState<ChartKind>('weight');
  const [metric, setMetric] = useState<StrengthChartMetric>('max_weight');
  const [picked, setPicked] = useState<Exercise | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const weight = useQuery({
    queryKey: ['progress', 'weight', days],
    queryFn: () => progressApi.weight(days),
    enabled: kind === 'weight',
  });
  const steps = useQuery({
    queryKey: ['progress', 'steps', days],
    queryFn: () => progressApi.steps(days),
    enabled: kind === 'steps',
  });
  const records = useQuery({
    queryKey: ['workout', 'records', 'overview'],
    queryFn: () => workoutApi.recordsOverview(),
    enabled: kind === 'strength',
  });
  // Sem escolha, o exercício de força de maior carga: o gráfico não nasce vazio.
  const auto = useMemo(() => {
    const top = records.data?.records
      .filter((r) => r.type === 'strength')
      .sort((a, b) => (b.estimated1RM ?? 0) - (a.estimated1RM ?? 0))[0];
    return top ? { id: top.exerciseId, name: top.exerciseName } : null;
  }, [records.data]);
  const exercise = picked ? { id: picked.id, name: picked.name } : auto;
  const strength = useQuery({
    queryKey: ['progress', 'strength', exercise?.id, days, metric],
    queryFn: () => progressApi.strength(exercise!.id, days, metric),
    enabled: kind === 'strength' && !!exercise,
  });
  const cardio = useQuery({
    queryKey: ['progress', 'cardio', 'all', days, 'duration'],
    queryFn: () => progressApi.cardio(null, days, 'duration'),
    enabled: kind === 'cardio',
  });

  const unit = loadUnitLabel(loadUnit);
  const view: ChartView = (() => {
    switch (kind) {
      case 'weight': {
        const w = weight.data;
        return {
          label: 'Peso',
          big: w?.currentWeightKg != null ? `${formatDecimal(w.currentWeightKg)} kg` : '—',
          delta: w && w.points.length >= 2 ? signedDelta(w.totalDeltaKg, 'kg') : null,
          deltaTone: 'ok',
          bars: null,
          line: w?.points.map((p) => p.weightKg) ?? [],
          summary: w ? weightSummary(w) : [],
          loading: weight.isLoading,
          error: weight.isError,
          retry: () => void weight.refetch(),
        };
      }
      case 'steps': {
        const s = steps.data;
        const trend = s ? trendPercent(s.weeklyAverages.map((x) => x.avgSteps)) : null;
        return {
          label: 'Passos por dia',
          big: s && s.points.length ? formatInteger(s.averageDaily) : '—',
          delta: trend === null ? null : signedPercent(trend),
          deltaTone: trend !== null && trend < 0 ? 'warn' : 'ok',
          bars: bucketize(s?.points.map((p) => p.steps) ?? [], 12),
          line: null,
          summary: s ? stepsSummary(s) : [],
          loading: steps.isLoading,
          error: steps.isError,
          retry: () => void steps.refetch(),
        };
      }
      case 'strength': {
        const st = strength.data;
        const label = STRENGTH_METRICS.find((m) => m.value === metric)!.label;
        return {
          label,
          big:
            st?.currentValue != null
              ? metric === 'total_volume'
                ? `${formatInteger(st.currentValue)} ${unit}`
                : `${loadNumber(st.currentValue, loadUnit)} ${unit}`
              : '—',
          delta: st?.deltaPercent != null ? signedPercent(Math.round(st.deltaPercent)) : null,
          deltaTone: st?.deltaPercent != null && st.deltaPercent < 0 ? 'warn' : 'ok',
          bars: null,
          line: st?.points.map((p) => p.value) ?? [],
          summary: st ? strengthSummary(st, loadUnit) : [],
          loading: records.isLoading || strength.isLoading,
          error: records.isError || strength.isError,
          retry: () => void (records.isError ? records.refetch() : strength.refetch()),
        };
      }
      case 'cardio': {
        const c = cardio.data;
        const pace = c ? averagePace(c) : null;
        return {
          label: 'Ritmo médio',
          big: pace !== null ? `${formatPace(pace)} /km` : c ? `${c.points.length} sessões` : '—',
          delta: c ? `${c.points.length} ${c.points.length === 1 ? 'sessão' : 'sessões'}` : null,
          deltaTone: 'mute',
          bars: bucketize(c?.points.map((p) => p.durationSeconds / 60) ?? [], 12),
          line: null,
          summary: c ? cardioSummary(c) : [],
          loading: cardio.isLoading,
          error: cardio.isError,
          retry: () => void cardio.refetch(),
        };
      }
    }
  })();

  const from = shortDayOf(new Date(nowMs - days * 86_400_000).toISOString());

  return (
    <div className="flex flex-col gap-3 px-4 pb-8 pt-2">
      <Segmented
        label="Período"
        options={CHART_RANGES.map((r) => ({ value: String(r.value), label: r.label }))}
        value={range}
        onChange={setRange}
      />

      <div className="grid grid-cols-4 gap-1.5">
        {CHART_KINDS.map((k) => (
          <Chip
            key={k.value}
            selected={kind === k.value}
            onClick={() => setKind(k.value)}
            className="justify-center gap-1 px-1.5"
          >
            <Icon name={k.icon as 'scale'} size={16} />
            {k.label}
          </Chip>
        ))}
      </div>

      <section className="flex flex-col gap-2.5 rounded-card bg-card p-4" aria-label={view.label}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] text-muted-foreground">{view.label}</span>
          {kind === 'strength' && (
            <Chip
              className="h-8 text-[12px]"
              onClick={() => setPickerOpen(true)}
              aria-label={`Exercício: ${exercise?.name ?? 'escolher'}`}
            >
              <Icon name="search" size={16} />
              <span className="max-w-[140px] truncate">{exercise?.name ?? 'Escolher'}</span>
            </Chip>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[32px] font-bold leading-none tracking-tight tabular-nums">
            {view.big}
          </span>
          {view.delta && <ToneBadge tone={view.deltaTone}>{view.delta}</ToneBadge>}
        </div>

        {view.error ? (
          <ErrorState message="Não deu para carregar o gráfico." onRetry={view.retry} />
        ) : view.loading ? (
          <Skeleton className="h-[150px] rounded-field" />
        ) : view.bars ? (
          <MiniBars
            values={view.bars}
            height={150}
            gap="gap-1.5"
            colorClass={kind === 'steps' ? 'bg-steps' : 'bg-danger'}
          />
        ) : (
          <Sparkline values={view.line ?? []} height={150} />
        )}
        {/* As linhas e barras são desenho (aria-hidden): o leitor de tela ouve o resumo. */}
        <p className="sr-only">
          {describeSeries({
            name: view.label,
            labels: [],
            values: view.line ?? view.bars ?? [],
            format: (v) => formatDecimal(v),
          })}
        </p>
        <div className="flex justify-between text-[12px] text-muted-foreground">
          <span>{from}</span>
          <span>hoje</span>
        </div>
      </section>

      {kind === 'strength' && (
        <Segmented label="Métrica" options={STRENGTH_METRICS} value={metric} onChange={setMetric} />
      )}

      {view.summary.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {view.summary.map((x) => (
            <div key={x.label} className="flex flex-col gap-0.5 rounded-card bg-card px-3.5 py-3">
              <b className="whitespace-nowrap text-[17px] tabular-nums">{x.value}</b>
              <span className="text-[12px] text-muted-foreground">{x.label}</span>
            </div>
          ))}
        </div>
      )}

      <p className="px-1 text-[13px] text-muted-foreground">{CHART_NOTES[kind]}</p>

      {/* A prancha não tem o botão; sem ele, corrigir um peso daqui pedia voltar ao Hoje. */}
      {(kind === 'weight' || kind === 'steps') && (
        <Button variant="outline" onClick={() => setLogOpen(true)}>
          {kind === 'weight' ? 'Registrar peso' : 'Registrar passos'}
        </Button>
      )}

      <ExercisePickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(e) => {
          setPicked(e);
          setPickerOpen(false);
        }}
        filter="strength"
      />
      <BodyLogSheet
        open={logOpen}
        onClose={() => setLogOpen(false)}
        initialKind={kind === 'steps' ? 'steps' : 'weight'}
      />
    </div>
  );
}
