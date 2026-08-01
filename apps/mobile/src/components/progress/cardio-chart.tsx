import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';
import { progressApi, type CardioProgress, type Exercise } from '@fatia/api-client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  LoadingState,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from '@/components/ui';
import {
  LineChart,
  chartColors,
  describeSeries,
  formatDecimal,
  formatInteger,
} from '@/components/charts';
import type { OpenExercisePicker } from './exercise-picker-drawer';

type CardioMetric = 'duration' | 'distance' | 'pace' | 'kcal';

const METRICS: Array<{ value: CardioMetric; label: string }> = [
  { value: 'duration', label: 'Duração' },
  { value: 'distance', label: 'Distância' },
  { value: 'pace', label: 'Pace' },
  { value: 'kcal', label: 'Calorias' },
];

function formatValue(metric: CardioMetric, value: number): string {
  if (metric === 'duration' || metric === 'pace') {
    const total = Math.round(value);
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return metric === 'pace' ? `${minutes}:${seconds} /km` : `${minutes}:${seconds}`;
  }
  if (metric === 'distance') return `${formatDecimal(value / 1000, 2)} km`;
  return `${formatInteger(value)} kcal`;
}

/** Rótulo curto para o eixo Y, onde não cabe a unidade por extenso. */
function formatAxis(metric: CardioMetric, value: number): string {
  if (metric === 'duration' || metric === 'pace') return `${Math.floor(value / 60)}m`;
  if (metric === 'distance') return `${formatDecimal(value / 1000, 1)}k`;
  return formatInteger(value);
}

/**
 * Réplica de `apps/web/src/components/progress/cardio-chart.tsx`.
 */
export function CardioChart({
  days,
  openPicker,
}: {
  days: number;
  openPicker: OpenExercisePicker;
}) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [metric, setMetric] = useState<CardioMetric>('duration');

  const progress = useQuery<CardioProgress>({
    queryKey: ['progress', 'cardio', exercise?.id, days, metric],
    queryFn: () => progressApi.cardio(exercise!.id, days, metric),
    enabled: Boolean(exercise),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">Evolução de cardio</CardTitle>
        <Button
          variant="secondary"
          size="sm"
          className="max-w-[60%] rounded-lg"
          accessibilityLabel={
            exercise ? `Trocar exercício, atual ${exercise.name}` : 'Escolher cardio'
          }
          onPress={() => openPicker('cardio', setExercise)}
        >
          <View className="flex-row items-center gap-1.5">
            <Search size={12} color={chartColors.foreground} />
            <Text numberOfLines={1} className="text-xs font-bold text-foreground">
              {exercise ? exercise.name : 'Escolher cardio'}
            </Text>
          </View>
        </Button>
      </CardHeader>

      <CardContent className="gap-3">
        <Tabs value={metric} onValueChange={(value) => setMetric(value as CardioMetric)}>
          <TabsList className="rounded-full">
            {METRICS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="rounded-full px-2">
                <Text
                  className={cn(
                    'text-[11px] font-bold',
                    metric === item.value ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </Text>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {!exercise ? (
          <Text className="py-8 text-center text-xs text-muted-foreground">
            Escolha um exercício de cardio para ver a evolução.
          </Text>
        ) : null}

        {exercise && progress.isLoading ? <LoadingState label="" /> : null}

        {exercise && progress.error ? (
          <ErrorState error={progress.error} onRetry={() => progress.refetch()} />
        ) : null}

        {exercise && progress.data ? <ChartBody data={progress.data} metric={metric} /> : null}
      </CardContent>
    </Card>
  );
}

function ChartBody({ data, metric }: { data: CardioProgress; metric: CardioMetric }) {
  if (!data.points.length) {
    return (
      <Text className="py-8 text-center text-xs text-muted-foreground">
        Sem registros de cardio no período.
      </Text>
    );
  }

  const last = data.points[data.points.length - 1];
  const labels = data.points.map((point) => point.sessionDate);
  const values = data.points.map((point) => point.value);

  return (
    <View className="gap-2">
      <View className="flex-row items-baseline gap-3">
        <Text className="text-2xl font-extrabold text-foreground">
          {formatValue(metric, last.value)}
        </Text>
        {data.bestSession ? (
          <Text className="text-[11px] text-muted-foreground">
            Melhor: {formatValue(metric, data.bestSession.value)}
          </Text>
        ) : null}
      </View>

      <LineChart
        name={data.exercise.name}
        labels={labels}
        values={values}
        formatValue={(value) => formatAxis(metric, value)}
        accessibilityLabel={describeSeries({
          name: data.exercise.name,
          labels,
          values,
          format: (value) => formatValue(metric, value),
        })}
      />
    </View>
  );
}
