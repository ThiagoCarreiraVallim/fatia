'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Search } from 'lucide-react';
import { progressApi, type CardioProgress } from '@/lib/api/progress';
import { ExercisePickerDrawer } from './exercise-picker-drawer';
import type { Exercise } from '@/lib/api/workout';

type CardioMetric = 'duration' | 'distance' | 'pace' | 'kcal';

const METRICS: Array<{ value: CardioMetric; label: string; unit: string }> = [
  { value: 'duration', label: 'Duração', unit: 's' },
  { value: 'distance', label: 'Distância', unit: 'm' },
  { value: 'pace', label: 'Pace', unit: 's/km' },
  { value: 'kcal', label: 'Calorias', unit: 'kcal' },
];

function formatValue(metric: CardioMetric, value: number): string {
  if (metric === 'duration') {
    const totalSec = Math.round(value);
    const min = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${min}:${s.toString().padStart(2, '0')}`;
  }
  if (metric === 'distance') {
    return `${(value / 1000).toFixed(2)} km`;
  }
  if (metric === 'pace') {
    const total = Math.round(value);
    const min = Math.floor(total / 60);
    const s = total % 60;
    return `${min}:${s.toString().padStart(2, '0')} /km`;
  }
  return `${Math.round(value)} kcal`;
}

export function CardioChart({ days }: { days: number }) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [metric, setMetric] = useState<CardioMetric>('duration');
  const [pickerOpen, setPickerOpen] = useState(false);

  const progress = useQuery<CardioProgress>({
    queryKey: ['progress', 'cardio', exercise?.id, days, metric],
    queryFn: () => progressApi.cardio(exercise!.id, days, metric),
    enabled: !!exercise,
  });

  return (
    <div className="space-y-3 rounded-2xl border border-white/5 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Evolução de cardio</h3>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted/70"
        >
          <Search size={12} />
          {exercise ? exercise.name : 'Escolher cardio'}
        </button>
      </div>

      <div className="flex gap-1">
        {METRICS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMetric(m.value)}
            className={`flex-1 rounded-full px-2 py-1 text-[11px] font-bold transition-colors ${
              metric === m.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {!exercise && (
        <p className="py-8 text-center text-xs text-muted-foreground">
          Escolha um exercício de cardio para ver a evolução.
        </p>
      )}

      {exercise && progress.isLoading && (
        <div className="h-[180px] animate-pulse rounded-lg bg-muted/40" />
      )}

      {exercise && progress.data && <ChartBody data={progress.data} metric={metric} />}

      <ExercisePickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ex) => {
          setExercise(ex);
          setPickerOpen(false);
        }}
        filter="cardio"
      />
    </div>
  );
}

function ChartBody({ data, metric }: { data: CardioProgress; metric: CardioMetric }) {
  if (!data.points.length) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        Sem registros de cardio no período.
      </p>
    );
  }
  const last = data.points[data.points.length - 1];
  return (
    <>
      <div className="flex items-baseline gap-3">
        <p className="text-2xl font-extrabold tabular-nums text-foreground">
          {formatValue(metric, last.value)}
        </p>
        {data.bestSession && (
          <span className="text-[11px] text-muted-foreground">
            Melhor: {formatValue(metric, data.bestSession.value)}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="sessionDate"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => {
              if (metric === 'duration' || metric === 'pace') {
                const m = Math.floor(v / 60);
                return `${m}m`;
              }
              if (metric === 'distance') return `${(v / 1000).toFixed(1)}k`;
              return Math.round(v).toString();
            }}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => [formatValue(metric, v), '']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
