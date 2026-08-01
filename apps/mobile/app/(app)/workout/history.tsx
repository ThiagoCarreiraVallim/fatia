import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight, Dumbbell } from 'lucide-react-native';
import { workoutApi, type WorkoutSession } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import {
  formatSessionDuration,
  pluralize,
  summarizeSession,
} from '@/components/workout/workout-stats';

/** Réplica de `apps/web/src/app/(app)/workout/history/page.tsx`. */

function SessionRow({ session }: { session: WorkoutSession }) {
  const router = useRouter();
  const { uniqueExercises, totalSets, totalVolumeKg } = summarizeSession(session);

  const dateLabel = new Date(session.startedAt).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const stats = `${uniqueExercises} ${pluralize(uniqueExercises, 'exercício', 'exercícios')} · ${totalSets} ${pluralize(totalSets, 'série', 'séries')}${
    totalVolumeKg > 0 ? ` · ${Math.round(totalVolumeKg)}kg` : ''
  }`;
  const duration = formatSessionDuration(session.startedAt, session.completedAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Treino de ${dateLabel}. ${stats}. Duração ${duration}`}
      onPress={() => router.push(`/workout/session/${session.id}`)}
      className="min-h-[44px] flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
    >
      <View className="h-12 w-12 items-center justify-center rounded-lg bg-muted">
        <Dumbbell size={20} color="#2ce500" />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-base font-bold capitalize text-foreground">
          {dateLabel}
        </Text>
        <Text className="text-xs text-muted-foreground">{stats}</Text>
        <Text className="text-[11px] text-muted-foreground">{duration}</Text>
      </View>
      <ChevronRight size={16} color="#baccaf" />
    </Pressable>
  );
}

export default function WorkoutHistoryScreen() {
  const sessions = useQuery({
    queryKey: ['workout', 'sessions'],
    queryFn: () => workoutApi.listSessions({ limit: 50 }),
  });

  return (
    <Screen
      back
      title="Histórico"
      refreshing={sessions.isRefetching}
      onRefresh={() => void sessions.refetch()}
    >
      <View className="gap-2 px-5 pb-4 pt-4">
        {sessions.isLoading ? <LoadingState /> : null}
        {sessions.isError ? (
          <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
        ) : null}
        {sessions.data && sessions.data.length === 0 ? (
          <EmptyState title="Nenhum treino registrado ainda." />
        ) : null}
        {sessions.data?.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </View>
    </Screen>
  );
}
