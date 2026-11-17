import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { Heart } from 'lucide-react-native';
import {
  HISTORY_FILTERS,
  feelingOf,
  historyDay,
  historyLine,
  historyTitle,
  historyTotals,
  sessionKindLabel,
  workoutApi,
  type WorkoutHistoryItem,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Text } from '@/components/ui/text';
import { EmptyState, ErrorState, LoadingState, Segmented, cn } from '@/components/ui';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { colors } from '@/theme/colors';

/**
 * Réplica de `apps/web/src/app/(app)/workout/history/page.tsx` (prancha
 * `Al-T10`, #381): os totais, o filtro por tipo e as sessões concluídas. O
 * toque abre o detalhe (`history/[id]`, Al-T11), que volta para cá.
 * A aba "Circuitos" é da #380 (`HISTORY_FILTERS`).
 */

type Filter = 'all' | 'plan' | 'circuit' | 'free';

const OPTIONS = HISTORY_FILTERS.map((f) => ({
  value: (f.kind ?? 'all') as Filter,
  label: f.label,
}));

function Row({ item, first }: { item: WorkoutHistoryItem; first: boolean }) {
  const router = useRouter();
  const units = useUnitPrefs();
  const day = historyDay(item.startedAt);
  const feeling = feelingOf(item.feeling);
  const title = historyTitle(item);
  const line = historyLine(item, units);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${day.weekday} ${day.day}. ${line}`}
      onPress={() => router.push(`/workout/history/${item.id}` as Href)}
      className={cn(
        'min-h-[68px] flex-row items-center gap-3 active:opacity-80',
        !first && 'border-t border-border',
      )}
    >
      <View className="w-10 items-center gap-0.5">
        <Text className="text-[11px] uppercase text-faint">{day.weekday}</Text>
        <Text className="font-sans-bold text-lg text-foreground">{day.day}</Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="shrink font-sans-semibold text-[15px] text-foreground">
            {title}
          </Text>
          <View className="rounded-[6px] bg-muted px-1.5 py-px">
            <Text className="text-[11px] text-faint">{sessionKindLabel(item.kind)}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-1">
          {item.cardio ? <Heart size={14} color={colors.danger} /> : null}
          <Text numberOfLines={1} className="shrink text-xs text-faint">
            {line}
          </Text>
        </View>
      </View>
      <View className="items-end gap-0.5">
        {feeling ? (
          <Text accessibilityLabel={feeling.label} className="text-lg leading-tight">
            {feeling.emoji}
          </Text>
        ) : null}
        {item.durationMinutes != null ? (
          <Text className="text-xs text-faint">{item.durationMinutes} min</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function WorkoutHistoryScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const units = useUnitPrefs();
  const kind = filter === 'all' ? undefined : filter;
  // A mesma chave da web: o que a pessoa terminou entra ao invalidar ['workout'].
  const history = useInfiniteQuery({
    queryKey: ['workout', 'history', kind ?? 'all'],
    queryFn: ({ pageParam }) => workoutApi.getHistory({ kind, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const first = history.data?.pages[0];
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen refreshing={history.isRefetching} onRefresh={() => void history.refetch()}>
      <View className="gap-4 px-4 pb-4 pt-2">
        {first ? (
          <View className="flex-row gap-2">
            {historyTotals(first.totals, units.loadUnit).map((t) => (
              <View
                key={t.label}
                accessible
                accessibilityLabel={`${t.value} ${t.label}`}
                className="flex-1 gap-0.5 rounded-[18px] bg-card p-3.5"
              >
                <Text className="font-sans-bold text-[22px] text-foreground">{t.value}</Text>
                <Text className="text-xs text-faint">{t.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Segmented options={OPTIONS} value={filter} onChange={setFilter} label="Tipo de treino" />

        {history.isLoading ? <LoadingState /> : null}
        {history.isError ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : null}
        {history.data && items.length === 0 ? (
          <EmptyState
            title={filter === 'all' ? 'Nenhum treino registrado ainda' : 'Nenhum treino deste tipo'}
            description="Os treinos que você terminar aparecem aqui."
          />
        ) : null}

        {items.length > 0 ? (
          <View accessibilityLabel="Sessões" className="rounded-card bg-card px-4">
            {items.map((item, i) => (
              <Row key={item.id} item={item} first={i === 0} />
            ))}
          </View>
        ) : null}

        {history.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: history.isFetchingNextPage }}
            disabled={history.isFetchingNextPage}
            onPress={() => void history.fetchNextPage()}
            className="min-h-11 items-center justify-center rounded-pill bg-card active:opacity-80"
          >
            <Text className="font-sans-bold text-sm text-foreground">
              {history.isFetchingNextPage ? 'Carregando...' : 'Ver mais'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}
