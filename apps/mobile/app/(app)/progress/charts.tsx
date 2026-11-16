import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  CHART_KINDS,
  CHART_NOTES,
  CHART_RANGES,
  STRENGTH_METRICS,
  chartCardView,
  describeSeries,
  formatDecimal,
  progressApi,
  shortDayOf,
  workoutApi,
  type ChartKind,
  type Exercise,
  type StrengthChartMetric,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Screen } from '@/components/layout/screen';
import { Button, DrawerLayer, ErrorState, LoadingState, Segmented } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { BodyLogSheet } from '@/components/progress/body-log-sheet';
import { ExercisePickerDrawer } from '@/components/progress/exercise-picker-drawer';
import { IconChip, MiniBars, Sparkline, ToneBadge } from '@/components/progress/progress-ui';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { colors } from '@/theme/colors';

/**
 * Gráficos (prancha Al-G6, #382) — réplica de
 * `apps/web/src/components/progress/charts-screen.tsx`.
 */
export default function ChartsScreen() {
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

  const view = chartCardView(
    kind,
    { weight: weight.data, steps: steps.data, strength: strength.data, cardio: cardio.data },
    { loadUnit, metric },
  );
  const active = { weight, steps, strength, cardio }[kind];
  const loading = active.isLoading || (kind === 'strength' && records.isLoading);
  const error = active.error ?? (kind === 'strength' ? records.error : null);
  const from = shortDayOf(new Date(nowMs - days * 86_400_000).toISOString());

  return (
    <>
      <Screen onRefresh={() => void active.refetch()} refreshing={active.isRefetching}>
        <View className="gap-3 px-4 pb-8 pt-2">
          <Segmented
            label="Período"
            options={CHART_RANGES.map((r) => ({ value: String(r.value), label: r.label }))}
            value={range}
            onChange={setRange}
          />

          <View className="flex-row gap-1.5">
            {CHART_KINDS.map((k) => (
              <IconChip
                key={k.value}
                icon={k.icon as IconName}
                label={k.label}
                selected={kind === k.value}
                onPress={() => setKind(k.value)}
                className="flex-1 px-1.5"
              />
            ))}
          </View>

          <View className="gap-2.5 rounded-card bg-card p-4">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-[15px] text-muted-foreground">{view.label}</Text>
              {kind === 'strength' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Exercício: ${exercise?.name ?? 'escolher'}`}
                  onPress={() => setPickerOpen(true)}
                  className="h-8 max-w-[170px] flex-row items-center gap-1 rounded-chip bg-muted px-3"
                >
                  <Icon name="search" size={16} color={colors.mutedForeground} />
                  <Text
                    className="font-sans-semibold text-[12px] text-foreground"
                    numberOfLines={1}
                  >
                    {exercise?.name ?? 'Escolher'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View className="flex-row items-baseline gap-2">
              <Text className="font-display text-[32px] leading-[36px] text-foreground">
                {view.big}
              </Text>
              {view.delta ? <ToneBadge tone={view.deltaTone} label={view.delta} /> : null}
            </View>

            {error ? (
              <ErrorState error={error} onRetry={() => void active.refetch()} />
            ) : loading ? (
              <LoadingState label="Carregando o gráfico…" />
            ) : (
              <View
                accessible
                accessibilityLabel={describeSeries({
                  name: view.label,
                  labels: [],
                  values: view.line ?? view.bars ?? [],
                  format: (v) => formatDecimal(v),
                })}
              >
                {view.bars ? (
                  <MiniBars
                    values={view.bars}
                    height={150}
                    gap={6}
                    color={kind === 'steps' ? colors.steps : colors.danger}
                  />
                ) : (
                  <Sparkline values={view.line ?? []} height={150} />
                )}
              </View>
            )}
            <View className="flex-row justify-between">
              <Text className="text-[12px] text-muted-foreground">{from}</Text>
              <Text className="text-[12px] text-muted-foreground">hoje</Text>
            </View>
          </View>

          {kind === 'strength' ? (
            <Segmented
              label="Métrica"
              options={STRENGTH_METRICS}
              value={metric}
              onChange={setMetric}
            />
          ) : null}

          {view.summary.length > 0 ? (
            <View className="flex-row gap-2">
              {view.summary.map((x) => (
                <View
                  key={x.label}
                  className="flex-1 basis-0 gap-0.5 rounded-card bg-card px-3.5 py-3"
                >
                  <Text className="font-sans-bold text-[17px] text-foreground" numberOfLines={1}>
                    {x.value}
                  </Text>
                  <Text className="text-[12px] text-muted-foreground">{x.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text className="px-1 text-[13px] text-muted-foreground">{CHART_NOTES[kind]}</Text>

          {/* A prancha não tem o botão; sem ele, corrigir um peso daqui pedia voltar ao Hoje. */}
          {kind === 'weight' || kind === 'steps' ? (
            <Button variant="outline" onPress={() => setLogOpen(true)}>
              {kind === 'weight' ? 'Registrar peso' : 'Registrar passos'}
            </Button>
          ) : null}
        </View>
      </Screen>

      <DrawerLayer>
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
      </DrawerLayer>
    </>
  );
}
