import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Screen } from '@/components/layout/screen';
import { Segmented } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { MiniBars, Sparkline, ToneBadge, heatColor } from '@/components/progress/progress-ui';
import { colors } from '@/theme/colors';

/**
 * Progresso (prancha Al-G1, #382) — réplica de
 * `apps/web/src/components/progress/progress-screen.tsx`.
 */
export default function ProgressScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [range, setRange] = useState('30');
  const [refreshing, setRefreshing] = useState(false);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['progress'] }),
      qc.invalidateQueries({ queryKey: ['workout', 'records', 'overview'] }),
      qc.invalidateQueries({ queryKey: ['achievements', 'list'] }),
    ]);
    setRefreshing(false);
  };

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

  const report = consistency.data;
  const last14 = report?.days.slice(-14) ?? [];
  const tally = achievements.data ? achievementTally(achievements.data) : null;
  const recordCount = records.data ? strengthRecordCount(records.data) : null;

  const minis: {
    label: string;
    icon: IconName;
    color: string;
    value: string;
    unit: string;
    chart: ReactNode;
  }[] = [
    {
      label: 'Passos',
      icon: 'steps',
      color: colors.steps,
      value: steps.data && stepValues.length ? formatInteger(steps.data.averageDaily) : '—',
      unit: '',
      chart: <MiniBars values={bucketize(stepValues, 12)} height={22} />,
    },
    {
      label: 'Força',
      icon: 'dumbbell',
      color: colors.primary,
      value: strengthTrend === null ? '—' : signedPercent(strengthTrend),
      unit: '',
      chart: <Sparkline values={volumeValues} height={22} fill={false} />,
    },
    {
      label: 'Cardio',
      icon: 'heart',
      color: colors.danger,
      value: formatPace(pace),
      unit: pace === null ? '' : ' /km',
      chart: <Sparkline values={paceValues} height={22} fill={false} color={colors.danger} />,
    },
  ];

  const go = (href: string) => router.push(href as never);

  return (
    <Screen
      onRefresh={() => void onRefresh()}
      refreshing={refreshing}
      actions={
        <View style={{ width: 200 }}>
          <Segmented
            label="Período"
            options={OVERVIEW_RANGES.map((r) => ({ value: String(r.value), label: r.label }))}
            value={range}
            onChange={setRange}
          />
        </View>
      }
    >
      <View className="gap-3 px-4 pb-8 pt-2">
        <View className="gap-3 rounded-card bg-card p-4">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Peso: ${current === null ? 'sem registro' : `${formatDecimal(current)} kg`}. Ver gráfico`}
            onPress={() => go('/progress/charts')}
            className="gap-1"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-[15px] text-muted-foreground">Peso</Text>
              {w && weightValues.length >= 2 ? (
                <ToneBadge tone="ok" label={signedDelta(w.totalDeltaKg, 'kg')} />
              ) : null}
            </View>
            <View className="flex-row items-baseline">
              <Text className="font-display text-[40px] leading-[44px] text-foreground">
                {current === null ? '—' : formatDecimal(current)}
              </Text>
              <Text className="ml-1 font-sans-semibold text-base text-muted-foreground">kg</Text>
            </View>
            <Sparkline values={weightValues} height={56} />
          </Pressable>

          <View className="flex-row gap-2">
            {minis.map((m) => (
              <Pressable
                key={m.label}
                accessibilityRole="link"
                accessibilityLabel={`${m.label}: ${m.value}${m.unit}`}
                onPress={() => go('/progress/charts')}
                className="flex-1 basis-0 gap-0.5 rounded-[14px] bg-muted px-2.5 pb-2 pt-2.5"
              >
                <View className="flex-row items-center gap-1">
                  <Icon name={m.icon} size={16} color={m.color} />
                  <Text className="text-[12px] text-muted-foreground">{m.label}</Text>
                </View>
                <Text className="font-sans-bold text-base text-foreground" numberOfLines={1}>
                  {m.value}
                  <Text className="font-sans-semibold text-[11px] text-muted-foreground">
                    {m.unit}
                  </Text>
                </Text>
                {m.chart}
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="link"
            onPress={() => go('/progress/charts')}
            className="min-h-[32px] flex-row items-center justify-between border-t border-border pt-3"
          >
            <Text className="font-sans-bold text-sm text-foreground">Ver todos os gráficos</Text>
            <Icon name="chevR" size={16} color={colors.faintForeground} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={
            report
              ? `Constância: ${report.streak.periodos} dias seguidos, ${report.activeDays} de ${report.totalDays} dias ativos`
              : 'Constância'
          }
          onPress={() => go('/progress/consistency')}
          className="gap-3 rounded-card bg-card p-4"
        >
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-[15px] text-muted-foreground" numberOfLines={1}>
              Constância
              {report ? (
                <Text className="text-warning">
                  {' '}
                  · {report.streak.periodos}{' '}
                  {report.streak.periodos === 1 ? 'dia seguido' : 'dias seguidos'}
                </Text>
              ) : null}
            </Text>
            <View className="flex-row items-center gap-1">
              <Text className="font-sans-bold text-sm text-foreground">
                {report ? `${report.activeDays}/${report.totalDays} dias` : '—'}
              </Text>
              <Icon name="chevR" size={16} color={colors.faintForeground} />
            </View>
          </View>
          <View className="flex-row gap-1">
            {last14.map((d) => (
              <View
                key={d.date}
                style={[{ flex: 1, aspectRatio: 1, borderRadius: 5 }, heatColor(d.count)]}
              />
            ))}
          </View>
        </Pressable>

        <View className="flex-row gap-2">
          {/* % de gordura vem da avaliação física (Al-G2), que chega com a #383. Até lá o
              cartão fica, sem link e sem número: é o ponto de extensão da tela. */}
          <SmallCard icon="ruler" color={colors.steps} value="—" label="gordura" />
          <SmallCard
            onPress={() => go('/progress/records')}
            icon="trophy"
            color={colors.steps}
            value={recordCount === null ? '—' : String(recordCount)}
            label="recordes"
          />
          <SmallCard
            onPress={() => go('/progress/achievements')}
            icon="medal"
            color={colors.primaryText}
            value={tally ? `${tally.got}/${tally.total}` : '—'}
            label="conquistas"
          />
        </View>
      </View>
    </Screen>
  );
}

function SmallCard({
  onPress,
  icon,
  color,
  value,
  label,
}: {
  onPress?: () => void;
  icon: IconName;
  color: string;
  value: string;
  label: string;
}) {
  const body = (
    <>
      <Icon name={icon} color={color} />
      <Text className="font-display text-[22px] leading-[28px] text-foreground">{value}</Text>
      <Text className="text-[13px] text-muted-foreground">{label}</Text>
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${value} ${label}`}
      onPress={onPress}
      className="flex-1 basis-0 gap-1 rounded-card bg-card p-3.5"
    >
      {body}
    </Pressable>
  ) : (
    <View className="flex-1 basis-0 gap-1 rounded-card bg-card p-3.5">{body}</View>
  );
}
