'use client';

import { useEffect, useState } from 'react';
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
import { progressApi, type StrengthProgress } from '@/lib/api/progress';
import { ExercisePickerDrawer } from './exercise-picker-drawer';
import { workoutApi, type Exercise } from '@/lib/api/workout';

type StrengthMetric = 'max_weight' | 'estimated_1rm' | 'total_volume';

const METRICS: Array<{ value: StrengthMetric; label: string; unit: string }> = [
  { value: 'max_weight', label: 'Carga máx', unit: 'kg' },
  { value: 'estimated_1rm', label: '1RM est.', unit: 'kg' },
  { value: 'total_volume', label: 'Volume', unit: 'kg' },
];

export function StrengthChart({ days }: { days: number }) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [metric, setMetric] = useState<StrengthMetric>('max_weight');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Pré-seleciona automaticamente o exercício de força treinado mais recentemente,
  // para o gráfico não nascer vazio. O usuário pode trocar pelo seletor.
  const records = useQuery({
    queryKey: ['workout', 'records'],
    queryFn: () => workoutApi.listPersonalRecords(),
  });
  useEffect(() => {
    if (exercise || !records.data) return;
    const top = records.data.find((r) => r.type === 'strength');
    if (top) {
      setExercise({
        id: top.exerciseId,
        name: top.exerciseName,
        muscleGroup: top.muscleGroup,
        source: 'SEED',
        createdByUserId: null,
        primaryMuscles: [],
        secondaryMuscles: [],
        equipment: null,
        level: null,
        mechanic: null,
        instructions: [],
        youtubeVideoId: null,
        youtubeVideoIdPt: null,
      });
    }
  }, [records.data, exercise]);

  const progress = useQuery<StrengthProgress>({
    queryKey: ['progress', 'strength', exercise?.id, days, metric],
    queryFn: () => progressApi.strength(exercise!.id, days, metric),
    enabled: !!exercise,
  });

  const metricInfo = METRICS.find((m) => m.value === metric)!;

  return (
    <div className="space-y-3 rounded-2xl border border-white/5 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Evolução de força</h3>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted/70"
        >
          <Search size={12} />
          {exercise ? exercise.name : 'Escolher exercício'}
        </button>
      </div>

      <div className="flex gap-1">
        {METRICS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMetric(m.value)}
            className={`flex-1 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
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
          Escolha um exercício de força para ver a evolução.
        </p>
      )}

      {exercise && progress.isLoading && (
        <div className="h-[180px] animate-pulse rounded-lg bg-muted/40" />
      )}

      {exercise && progress.data && <ChartBody data={progress.data} unit={metricInfo.unit} />}

      <ExercisePickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ex) => {
          setExercise(ex);
          setPickerOpen(false);
        }}
        filter="strength"
      />
    </div>
  );
}

function ChartBody({ data, unit }: { data: StrengthProgress; unit: string }) {
  if (!data.points.length) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        Sem séries logadas no período.
      </p>
    );
  }
  const deltaPct = data.deltaPercent ?? 0;
  return (
    <>
      <div className="flex items-baseline gap-3">
        <p className="text-2xl font-extrabold tabular-nums text-foreground">
          {data.currentValue !== null ? Math.round(data.currentValue) : '—'}{' '}
          <span className="text-sm font-bold text-muted-foreground">{unit}</span>
        </p>
        {data.deltaPercent !== null && (
          <span
            className={`text-xs font-bold ${deltaPct >= 0 ? 'text-primary' : 'text-amber-400'}`}
          >
            {deltaPct > 0 ? '+' : ''}
            {deltaPct.toFixed(1)}%
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
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => [`${v.toFixed(1)} ${unit}`, '']}
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
