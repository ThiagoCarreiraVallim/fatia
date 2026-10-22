'use client';

import { useMemo, useState } from 'react';
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
import {
  describeSeries,
  formatDecimal,
  formatInteger,
  progressApi,
  workoutApi,
  type Exercise,
  type StrengthProgress,
} from '@fatia/api-client';
import { ExercisePickerDrawer } from './exercise-picker-drawer';
import { Skeleton } from '@/components/ui/skeleton';
type StrengthMetric = 'max_weight' | 'estimated_1rm' | 'total_volume';

const METRICS: Array<{ value: StrengthMetric; label: string; unit: string }> = [
  { value: 'max_weight', label: 'Carga máx', unit: 'kg' },
  { value: 'estimated_1rm', label: '1RM est.', unit: 'kg' },
  { value: 'total_volume', label: 'Volume', unit: 'kg' },
];

export function StrengthChart({ days }: { days: number }) {
  const [picked, setPicked] = useState<Exercise | null>(null);
  const [metric, setMetric] = useState<StrengthMetric>('max_weight');
  const [pickerOpen, setPickerOpen] = useState(false);

  const records = useQuery({
    queryKey: ['workout', 'records'],
    queryFn: () => workoutApi.listPersonalRecords(),
  });

  // Pré-seleciona automaticamente o exercício de força treinado mais recentemente,
  // para o gráfico não nascer vazio. O usuário pode trocar pelo seletor.
  //
  // Derivado, e não copiado para dentro de um `useState` por efeito (#187): a
  // escolha automática é função pura dos recordes, e guardá-la em estado só
  // criava uma cópia que podia divergir da fonte. O que **é** estado é a escolha
  // explícita da pessoa, e ela ganha do automático. Efeito colateral assumido: se
  // os recordes forem revalidados e a cabeça da lista mudar antes de qualquer
  // escolha manual, o gráfico passa a mostrar o novo exercício mais recente — que
  // é o que a pré-seleção promete. Antes, ficava travado no primeiro que chegou.
  const auto = useMemo((): Exercise | null => {
    const top = records.data?.find((r) => r.type === 'strength');
    if (!top) return null;
    return {
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
    };
  }, [records.data]);

  const exercise = picked ?? auto;

  const progress = useQuery<StrengthProgress>({
    queryKey: ['progress', 'strength', exercise?.id, days, metric],
    queryFn: () => progressApi.strength(exercise!.id, days, metric),
    enabled: !!exercise,
  });

  const metricInfo = METRICS.find((m) => m.value === metric)!;

  return (
    <div className="space-y-3 rounded-2xl border border-subtle bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Evolução de força</h3>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label={exercise ? `Trocar exercício, atual ${exercise.name}` : 'Escolher exercício'}
          className="flex min-h-9 min-w-0 items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted/70"
        >
          <Search size={12} aria-hidden className="shrink-0" />
          <span className="truncate">{exercise ? exercise.name : 'Escolher exercício'}</span>
        </button>
      </div>

      <div role="group" aria-label="Métrica" className="flex gap-1">
        {METRICS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMetric(m.value)}
            aria-pressed={metric === m.value}
            className={`min-h-8 flex-1 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
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

      {exercise && progress.isLoading && <Skeleton className="h-[180px] rounded-lg bg-muted/40" />}

      {exercise && progress.data && (
        <ChartBody data={progress.data} unit={metricInfo.unit} name={exercise.name} />
      )}

      <ExercisePickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ex) => {
          setPicked(ex);
          setPickerOpen(false);
        }}
        filter="strength"
      />
    </div>
  );
}

function ChartBody({ data, unit, name }: { data: StrengthProgress; unit: string; name: string }) {
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
          {data.currentValue !== null ? formatInteger(data.currentValue) : '—'}{' '}
          <span className="text-sm font-bold text-muted-foreground">{unit}</span>
        </p>
        {data.deltaPercent !== null && (
          <span className={`text-xs font-bold ${deltaPct >= 0 ? 'text-primary' : 'text-warning'}`}>
            {deltaPct > 0 ? '+' : ''}
            {formatDecimal(deltaPct, 1)}%
          </span>
        )}
      </div>
      <div
        role="img"
        aria-label={describeSeries({
          name: `${name}, ${unit}`,
          labels: data.points.map((p) => p.sessionDate),
          values: data.points.map((p) => p.value),
          format: (v) => `${formatDecimal(v, 1)} ${unit}`,
        })}
      >
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
              formatter={(v: number) => [`${formatDecimal(v, 1)} ${unit}`, '']}
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
      </div>
    </>
  );
}
