import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Footprints, Trophy } from 'lucide-react-native';
import { workoutApi, type PersonalRecordEntry } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from '@/components/ui';
import { chartColors, dayMonth, formatDecimal, formatDuration } from '@/components/charts';

type SortKey = 'recent' | 'weight';

const RECENT_PR_DAYS = 30;

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Réplica de `apps/web/src/app/(app)/progress/records/page.tsx`. */
export default function RecordsScreen() {
  const [sort, setSort] = useState<SortKey>('recent');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const records = useQuery({
    queryKey: ['workout', 'records'],
    queryFn: () => workoutApi.listPersonalRecords(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await records.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [records]);

  const data = useMemo(() => records.data ?? [], [records.data]);

  const muscles = useMemo(
    () => [...new Set(data.map((record) => record.muscleGroup))].sort(),
    [data],
  );

  const filtered = useMemo(() => {
    const rows = muscle ? data.filter((record) => record.muscleGroup === muscle) : [...data];
    if (sort === 'weight') {
      rows.sort(
        (a, b) =>
          (b.maxWeightKg ?? b.maxDistanceMeters ?? 0) - (a.maxWeightKg ?? a.maxDistanceMeters ?? 0),
      );
    } else {
      rows.sort((a, b) => (b.lastPerformedAt ?? '').localeCompare(a.lastPerformedAt ?? ''));
    }
    return rows;
  }, [data, muscle, sort]);

  const recentPRs = useMemo(
    () =>
      data.filter((record) => {
        const elapsed = daysAgo(record.achievedAt);
        return elapsed != null && elapsed <= RECENT_PR_DAYS;
      }).length,
    [data],
  );

  const totalSets = useMemo(
    () => data.reduce((accumulated, record) => accumulated + record.totalSets, 0),
    [data],
  );

  return (
    <Screen back title="Recordes" onRefresh={onRefresh} refreshing={refreshing}>
      <View className="gap-5 px-5 pb-4 pt-1">
        <View className="flex-row gap-2">
          <StatCard label="Exercícios" value={String(data.length)} />
          <StatCard label="Recordes (30d)" value={String(recentPRs)} highlight />
          <StatCard label="Séries totais" value={String(totalSets)} />
        </View>

        {muscles.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            <Chip active={muscle === null} label="Todos" onPress={() => setMuscle(null)} />
            {muscles.map((group) => (
              <Chip
                key={group}
                active={muscle === group}
                label={group}
                onPress={() => setMuscle(group)}
              />
            ))}
          </View>
        ) : null}

        <Tabs value={sort} onValueChange={(value) => setSort(value as SortKey)}>
          <TabsList className="rounded-full">
            <TabsTrigger value="recent" className="rounded-full">
              <Text
                className={cn(
                  'text-[11px] font-bold',
                  sort === 'recent' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                Mais recentes
              </Text>
            </TabsTrigger>
            <TabsTrigger value="weight" className="rounded-full">
              <Text
                className={cn(
                  'text-[11px] font-bold',
                  sort === 'weight' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                Maior carga
              </Text>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {records.isLoading ? <LoadingState /> : null}

        {records.error ? (
          <ErrorState error={records.error} onRetry={() => records.refetch()} />
        ) : null}

        {records.data && filtered.length === 0 ? (
          <Card>
            <EmptyState
              title="Nenhum recorde ainda"
              description="Registre séries durante o treino para começar."
              className="py-8"
            />
          </Card>
        ) : null}

        <View className="gap-2">
          {filtered.map((record) => (
            <RecordRow key={record.exerciseId} record={record} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className="flex-1 items-center p-3">
      <Text
        className={cn('text-2xl font-extrabold', highlight ? 'text-primary' : 'text-foreground')}
      >
        {value}
      </Text>
      <Text className="text-center text-[10px] font-bold tracking-wide text-muted-foreground">
        {label}
      </Text>
    </Card>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Filtrar por ${label}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn(
        'min-h-[44px] justify-center rounded-full px-4',
        active ? 'bg-primary' : 'bg-muted',
      )}
    >
      <Text
        className={cn(
          'text-xs font-bold capitalize',
          active ? 'text-primary-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function RecordRow({ record }: { record: PersonalRecordEntry }) {
  const isCardio = record.type === 'cardio';
  return (
    <Card className="flex-row items-center gap-3 p-4">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
        {isCardio ? (
          <Footprints size={18} color={chartColors.primary} />
        ) : (
          <Dumbbell size={18} color={chartColors.primary} />
        )}
      </View>

      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-bold text-foreground">
          {record.exerciseName}
        </Text>
        <Text className="text-xs capitalize text-muted-foreground">
          {record.muscleGroup} • {record.totalSets} série{record.totalSets !== 1 ? 's' : ''} •{' '}
          {dayMonth(record.achievedAt)}
        </Text>
      </View>

      <View className="items-end">
        {isCardio ? (
          <>
            <Text className="text-lg font-extrabold text-primary">
              {record.maxDistanceMeters != null
                ? formatDecimal(record.maxDistanceMeters / 1000, 2)
                : '—'}{' '}
              <Text className="text-xs text-muted-foreground">km</Text>
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              {formatDuration(record.bestDurationSeconds)}
            </Text>
          </>
        ) : (
          <>
            <Text className="text-lg font-extrabold text-primary">
              {record.maxWeightKg ?? '—'} <Text className="text-xs text-muted-foreground">kg</Text>
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              {record.repsAtMax ?? '—'} reps · 1RM ~
              {record.estimated1RM != null ? Math.round(record.estimated1RM) : '—'}
            </Text>
          </>
        )}
      </View>

      <Trophy size={16} color={chartColors.mutedForeground} />
    </Card>
  );
}
