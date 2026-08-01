import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Scale, TrendingDown, TrendingUp } from 'lucide-react-native';
import { progressApi, type Exercise } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import {
  Button,
  Card,
  DrawerLayer,
  ErrorState,
  LoadingState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@/components/ui';
import { chartColors, formatDecimal } from '@/components/charts';
import { CardioChart } from '@/components/progress/cardio-chart';
import { ConsistencyCard } from '@/components/progress/consistency-card';
import {
  ExercisePickerDrawer,
  type ExercisePickerFilter,
} from '@/components/progress/exercise-picker-drawer';
import { LogStepsDrawer } from '@/components/progress/log-steps-drawer';
import { LogWeightDrawer } from '@/components/progress/log-weight-drawer';
import { PersonalRecords } from '@/components/progress/personal-records';
import { StepsChart } from '@/components/progress/steps-chart';
import { StrengthChart } from '@/components/progress/strength-chart';
import { TrainingIntensity } from '@/components/progress/training-intensity';
import { WeightChart } from '@/components/progress/weight-chart';
import { WeightMiniBars } from '@/components/progress/weight-mini-bars';

const RANGES = [14, 30, 90, 180] as const;
const MINI_BARS = 6;

interface PickerRequest {
  filter: ExercisePickerFilter;
  onPick: (exercise: Exercise) => void;
}

/** Réplica de `apps/web/src/app/(app)/progress/page.tsx`. */
export default function ProgressScreen() {
  const [days, setDays] = useState<number>(30);
  const [tab, setTab] = useState('overview');
  const [logWeightOpen, setLogWeightOpen] = useState(false);
  const [logStepsOpen, setLogStepsOpen] = useState(false);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const openPicker = useCallback(
    (filter: ExercisePickerFilter, onPick: (exercise: Exercise) => void) =>
      setPicker({ filter, onPick }),
    [],
  );

  const weight = useQuery({
    queryKey: ['progress', 'weight', days],
    queryFn: () => progressApi.weight(days),
  });
  const steps = useQuery({
    queryKey: ['progress', 'steps', days],
    queryFn: () => progressApi.steps(days),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Recarrega tudo o que está montado: a tela é um painel, e atualizar só o
      // peso deixaria constância, intensidade e recordes velhos na mesma rolagem.
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const points = weight.data?.points ?? [];
  const miniSeries = points.slice(-MINI_BARS).map((point) => point.weightKg);
  const currentWeight = weight.data?.currentWeightKg;
  const weightDelta = weight.data?.totalDeltaKg ?? 0;

  return (
    <>
      <Screen title="Evolução" onRefresh={onRefresh} refreshing={refreshing}>
        <View className="gap-5 px-5 pb-4 pt-1">
          <Text className="text-sm text-muted-foreground">
            Seus dados de performance dos últimos {days} dias.
          </Text>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="rounded-xl">
              <TabsTrigger value="overview" className="rounded-lg">
                <Text
                  className={cn(
                    'text-[11px] font-bold',
                    tab === 'overview' ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  Visão geral
                </Text>
              </TabsTrigger>
              <TabsTrigger value="charts" className="rounded-lg">
                <Text
                  className={cn(
                    'text-[11px] font-bold',
                    tab === 'charts' ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  Gráficos
                </Text>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 gap-4">
              <Card className="p-4">
                <View className="flex-row items-start justify-between">
                  <View>
                    <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">
                      PESO CORPORAL
                    </Text>
                    <View className="mt-1 flex-row items-baseline gap-2">
                      <Text className="text-3xl font-extrabold text-foreground">
                        {currentWeight != null ? formatDecimal(currentWeight, 1) : '—'}{' '}
                        <Text className="text-base font-bold text-foreground">kg</Text>
                      </Text>
                      {weight.data && points.length >= 2 ? (
                        <View className="flex-row items-center gap-0.5">
                          {weightDelta < 0 ? (
                            <TrendingDown size={12} color={chartColors.primary} />
                          ) : (
                            <TrendingUp size={12} color={chartColors.mutedForeground} />
                          )}
                          <Text
                            className={cn(
                              'text-xs font-bold',
                              weightDelta < 0 ? 'text-primary' : 'text-muted-foreground',
                            )}
                          >
                            {weightDelta > 0 ? '+' : ''}
                            {formatDecimal(weightDelta, 1)} kg
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Logar peso"
                    onPress={() => setLogWeightOpen(true)}
                    className="h-11 w-11 items-center justify-center rounded-xl bg-accent"
                  >
                    <Scale size={16} color={chartColors.primary} />
                  </Pressable>
                </View>

                <View className="mt-2">
                  <WeightMiniBars values={miniSeries} />
                </View>
              </Card>

              <ConsistencyCard />
              <TrainingIntensity />
              <PersonalRecords />
            </TabsContent>

            <TabsContent value="charts" className="mt-4 gap-4">
              <Tabs value={String(days)} onValueChange={(value) => setDays(Number(value))}>
                <TabsList className="self-end rounded-full">
                  {RANGES.map((range) => (
                    <TabsTrigger
                      key={range}
                      value={String(range)}
                      className="min-w-[52px] rounded-full px-3"
                    >
                      <Text
                        className={cn(
                          'text-xs font-bold',
                          days === range ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {range}d
                      </Text>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {weight.isLoading || steps.isLoading ? <LoadingState /> : null}

              {weight.error ? (
                <ErrorState error={weight.error} onRetry={() => weight.refetch()} />
              ) : null}
              {weight.data ? <WeightChart data={weight.data} /> : null}

              {steps.error ? (
                <ErrorState error={steps.error} onRetry={() => steps.refetch()} />
              ) : null}
              {steps.data ? <StepsChart data={steps.data} /> : null}

              <StrengthChart days={days} openPicker={openPicker} />
              <CardioChart days={days} openPicker={openPicker} />

              <Button variant="outline" onPress={() => setLogWeightOpen(true)}>
                <View className="flex-row items-center gap-2">
                  <Plus size={16} color={chartColors.foreground} />
                  <Text className="text-[13px] font-medium text-foreground">Logar peso</Text>
                </View>
              </Button>
              <Button variant="outline" onPress={() => setLogStepsOpen(true)}>
                <View className="flex-row items-center gap-2">
                  <Plus size={16} color={chartColors.foreground} />
                  <Text className="text-[13px] font-medium text-foreground">Logar passos</Text>
                </View>
              </Button>
            </TabsContent>
          </Tabs>
        </View>
      </Screen>

      <DrawerLayer>
        <LogWeightDrawer open={logWeightOpen} onClose={() => setLogWeightOpen(false)} />
        <LogStepsDrawer open={logStepsOpen} onClose={() => setLogStepsOpen(false)} />
        <ExercisePickerDrawer
          open={picker !== null}
          filter={picker?.filter ?? 'strength'}
          onClose={() => setPicker(null)}
          onPick={(exercise) => {
            picker?.onPick(exercise);
            setPicker(null);
          }}
        />
      </DrawerLayer>
    </>
  );
}
