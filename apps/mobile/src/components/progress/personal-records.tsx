import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight, Dumbbell, Footprints, Trophy } from 'lucide-react-native';
import { workoutApi } from '@fatia/api-client';
import { Button, Card, EmptyState, LoadingState } from '@/components/ui';
import { chartColors, formatDuration } from '@/components/charts';

const TOP_N = 3;

// Derivado do cliente, não redeclarado: o endpoint devolve uma forma para força
// (`weightKg`/`reps`) e outra para cardio (`distanceMeters`/`durationSeconds`).
type PersonalRecord = Awaited<ReturnType<typeof workoutApi.getPersonalRecord>>;
type CardioRecord = Extract<NonNullable<PersonalRecord>, { durationSeconds: number | null }>;

function isCardioRecord(record: NonNullable<PersonalRecord>): record is CardioRecord {
  return 'durationSeconds' in record;
}

interface UsedExercise {
  id: number;
  name: string;
  muscleGroup: string;
  isCardio: boolean;
  lastSeen: string;
}

/**
 * Réplica de `apps/web/src/components/progress/personal-records.tsx`.
 */
export function PersonalRecords() {
  const router = useRouter();

  const sessions = useQuery({
    queryKey: ['workout', 'sessions', 'recent'],
    queryFn: () => workoutApi.listSessions({ limit: 20 }),
  });

  const topExercises: UsedExercise[] = useMemo(() => {
    if (!sessions.data) return [];
    const counts = new Map<number, UsedExercise & { count: number }>();
    for (const session of sessions.data) {
      for (const set of session.sets ?? []) {
        const exercise = set.exercise;
        if (!exercise) continue;
        const current = counts.get(exercise.id);
        if (current) {
          current.count++;
          if (session.startedAt > current.lastSeen) current.lastSeen = session.startedAt;
        } else {
          counts.set(exercise.id, {
            id: exercise.id,
            name: exercise.name,
            muscleGroup: exercise.muscleGroup,
            isCardio: exercise.muscleGroup === 'cardio',
            lastSeen: session.startedAt,
            count: 1,
          });
        }
      }
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, TOP_N)
      .map(({ count: _count, ...rest }) => rest);
  }, [sessions.data]);

  const records = useQueries({
    queries: topExercises.map((exercise) => ({
      queryKey: ['workout', 'pr', exercise.id],
      queryFn: () => workoutApi.getPersonalRecord(exercise.id),
    })),
  });

  const loading = sessions.isLoading || records.some((query) => query.isLoading);

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Trophy size={16} color={chartColors.primary} />
        <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
          Recordes Pessoais
        </Text>
      </View>

      {loading ? <LoadingState label="" /> : null}

      {!loading && topExercises.length === 0 ? (
        <Card>
          <EmptyState
            title="Sem recordes ainda"
            description="Logue treinos para ver seus recordes pessoais."
            className="py-6"
          />
        </Card>
      ) : null}

      {!loading
        ? topExercises.map((exercise, index) => (
            <RecordRow
              key={exercise.id}
              exercise={exercise}
              record={records[index]?.data ?? null}
            />
          ))
        : null}

      {!loading && topExercises.length > 0 ? (
        <View className="flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1 rounded-2xl"
            accessibilityLabel="Ver todos os recordes"
            onPress={() => router.push('/progress/records')}
          >
            <View className="flex-row items-center gap-1.5">
              <Text className="text-sm font-bold text-foreground">Todos os recordes</Text>
              <ChevronRight size={14} color={chartColors.foreground} />
            </View>
          </Button>
          <Button
            variant="secondary"
            className="flex-1 rounded-2xl"
            accessibilityLabel="Ver histórico de treinos"
            onPress={() => router.push('/workout/history')}
          >
            <View className="flex-row items-center gap-1.5">
              <Text className="text-sm font-bold text-foreground">Histórico</Text>
              <ChevronRight size={14} color={chartColors.foreground} />
            </View>
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function RecordRow({
  exercise,
  record,
}: {
  exercise: UsedExercise;
  record: PersonalRecord | null;
}) {
  return (
    <Card className="flex-row items-center gap-3 p-3">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
        {exercise.isCardio ? (
          <Footprints size={18} color={chartColors.primary} />
        ) : (
          <Dumbbell size={18} color={chartColors.primary} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-bold text-foreground">
          {exercise.name}
        </Text>
        <Text className="text-xs capitalize text-muted-foreground">
          {exercise.isCardio ? 'Cardio' : 'Força'} • {exercise.muscleGroup}
        </Text>
      </View>
      <View className="items-end">
        {record ? (
          <RecordValue isCardio={exercise.isCardio} record={record} />
        ) : (
          <Text className="text-xs text-muted-foreground">—</Text>
        )}
      </View>
    </Card>
  );
}

function RecordValue({
  isCardio,
  record,
}: {
  isCardio: boolean;
  record: NonNullable<PersonalRecord>;
}) {
  if (isCardio && isCardioRecord(record)) {
    const distance =
      record.distanceMeters !== null ? `${(record.distanceMeters / 1000).toFixed(2)} km` : null;
    return (
      <>
        <Text className="text-lg font-extrabold text-primary">
          {formatDuration(record.durationSeconds ?? 0)}
        </Text>
        <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">
          {distance ?? 'TEMPO'}
        </Text>
      </>
    );
  }

  if (!isCardio && !isCardioRecord(record)) {
    return (
      <>
        <Text className="text-lg font-extrabold text-primary">
          {record.weightKg ?? '—'} <Text className="text-sm">kg</Text>
        </Text>
        <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">
          {record.reps ? `${record.reps} reps` : 'PR'}
        </Text>
      </>
    );
  }

  return <Text className="text-xs text-muted-foreground">—</Text>;
}
