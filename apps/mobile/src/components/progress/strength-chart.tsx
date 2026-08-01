import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';
import { progressApi, workoutApi, type Exercise, type StrengthProgress } from '@fatia/api-client';
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
import { LineChart, chartColors, describeSeries, formatDecimal } from '@/components/charts';
import type { OpenExercisePicker } from './exercise-picker-drawer';

type StrengthMetric = 'max_weight' | 'estimated_1rm' | 'total_volume';

const METRICS: Array<{ value: StrengthMetric; label: string; unit: string }> = [
  { value: 'max_weight', label: 'Carga máx', unit: 'kg' },
  { value: 'estimated_1rm', label: '1RM est.', unit: 'kg' },
  { value: 'total_volume', label: 'Volume', unit: 'kg' },
];

/**
 * Réplica de `apps/web/src/components/progress/strength-chart.tsx`.
 */
export function StrengthChart({
  days,
  openPicker,
}: {
  days: number;
  openPicker: OpenExercisePicker;
}) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [metric, setMetric] = useState<StrengthMetric>('max_weight');

  const records = useQuery({
    queryKey: ['workout', 'records'],
    queryFn: () => workoutApi.listPersonalRecords(),
  });

  // Pré-seleciona o exercício de força treinado mais recentemente, para o
  // gráfico não nascer vazio. O usuário pode trocar pelo seletor.
  useEffect(() => {
    if (exercise || !records.data) return;
    const top = records.data.find((record) => record.type === 'strength');
    if (!top) return;
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
  }, [records.data, exercise]);

  const progress = useQuery<StrengthProgress>({
    queryKey: ['progress', 'strength', exercise?.id, days, metric],
    queryFn: () => progressApi.strength(exercise!.id, days, metric),
    enabled: Boolean(exercise),
  });

  const metricInfo = METRICS.find((item) => item.value === metric) ?? METRICS[0];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">Evolução de força</CardTitle>
        <Button
          variant="secondary"
          size="sm"
          className="max-w-[60%] rounded-lg"
          accessibilityLabel={
            exercise ? `Trocar exercício, atual ${exercise.name}` : 'Escolher exercício'
          }
          onPress={() => openPicker('strength', setExercise)}
        >
          <View className="flex-row items-center gap-1.5">
            <Search size={12} color={chartColors.foreground} />
            <Text numberOfLines={1} className="text-xs font-bold text-foreground">
              {exercise ? exercise.name : 'Escolher exercício'}
            </Text>
          </View>
        </Button>
      </CardHeader>

      <CardContent className="gap-3">
        <Tabs value={metric} onValueChange={(value) => setMetric(value as StrengthMetric)}>
          <TabsList className="rounded-full">
            {METRICS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="rounded-full">
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
            Escolha um exercício de força para ver a evolução.
          </Text>
        ) : null}

        {exercise && progress.isLoading ? <LoadingState label="" /> : null}

        {exercise && progress.error ? (
          <ErrorState error={progress.error} onRetry={() => progress.refetch()} />
        ) : null}

        {exercise && progress.data ? (
          <ChartBody data={progress.data} unit={metricInfo.unit} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartBody({ data, unit }: { data: StrengthProgress; unit: string }) {
  if (!data.points.length) {
    return (
      <Text className="py-8 text-center text-xs text-muted-foreground">
        Sem séries logadas no período.
      </Text>
    );
  }

  const deltaPercent = data.deltaPercent ?? 0;
  const labels = data.points.map((point) => point.sessionDate);
  const values = data.points.map((point) => point.value);

  return (
    <View className="gap-2">
      <View className="flex-row items-baseline gap-3">
        <Text className="text-2xl font-extrabold text-foreground">
          {data.currentValue !== null ? Math.round(data.currentValue) : '—'}{' '}
          <Text className="text-sm font-bold text-muted-foreground">{unit}</Text>
        </Text>
        {data.deltaPercent !== null ? (
          <Text
            className={cn(
              'text-xs font-bold',
              deltaPercent >= 0 ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {deltaPercent > 0 ? '+' : ''}
            {formatDecimal(deltaPercent, 1)}%
          </Text>
        ) : null}
      </View>

      <LineChart
        name={data.exercise.name}
        labels={labels}
        values={values}
        accessibilityLabel={describeSeries({
          name: `${data.exercise.name}, ${unit}`,
          labels,
          values,
          format: (value) => `${formatDecimal(value, 1)} ${unit}`,
        })}
      />
    </View>
  );
}
