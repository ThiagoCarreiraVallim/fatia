import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { achievementDetail, achievementIcon, achievementTally, progressApi } from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Screen } from '@/components/layout/screen';
import { ErrorState, LoadingState, Ring, cn } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

/**
 * Conquistas (prancha Al-G11, #382) — réplica de
 * `apps/web/src/components/progress/achievements-screen.tsx`.
 */
export default function AchievementsScreen() {
  const query = useQuery({
    queryKey: ['achievements', 'list'],
    queryFn: () => progressApi.listAchievements(),
  });
  const list = query.data ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = list.find((a) => a.key === selectedKey) ?? list.find((a) => a.unlockedAt) ?? list[0];
  const tally = achievementTally(list);

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View className="gap-3 px-4 pb-8 pt-2">
        {query.isLoading ? <LoadingState label="Carregando as conquistas…" /> : null}
        {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}

        {query.data ? (
          <>
            <View className="flex-row items-center justify-between gap-3 rounded-card bg-card p-4">
              <View className="flex-1">
                <Text className="font-display text-[22px] leading-[28px] text-foreground">
                  {tally.got} de {tally.total} desbloqueadas
                </Text>
                <Text className="text-[13px] text-muted-foreground">Toque numa para ver os detalhes.</Text>
              </View>
              <Ring value={tally.got} max={tally.total} size={64} stroke={7} label="conquistas">
                <Text className="font-sans-bold text-sm text-foreground">
                  {tally.total ? Math.round((tally.got / tally.total) * 100) : 0}%
                </Text>
              </Ring>
            </View>

            <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
              {list.map((a) => {
                const unlocked = !!a.unlockedAt;
                const on = selected?.key === a.key;
                return (
                  <View key={a.key} style={{ width: '33.333%', padding: 4 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${a.title}, ${unlocked ? 'desbloqueada' : 'bloqueada'}`}
                      accessibilityState={{ selected: on }}
                      onPress={() => setSelectedKey(a.key)}
                      className={cn(
                        'items-center gap-2 rounded-card bg-card px-2 py-3.5',
                        on && 'border-[1.5px] border-primary',
                      )}
                    >
                      <View
                        className={cn(
                          'h-12 w-12 items-center justify-center rounded-full',
                          unlocked ? 'bg-primary' : 'bg-surface-3 opacity-50',
                        )}
                      >
                        <Icon
                          name={unlocked ? (achievementIcon(a.key) as IconName) : 'lock'}
                          size={22}
                          color={unlocked ? colors.primaryForeground : colors.mutedForeground}
                        />
                      </View>
                      <Text
                        className={cn(
                          'text-center font-sans-semibold text-[12px] leading-[15px]',
                          unlocked ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {a.title}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {selected ? (
              <View accessibilityLiveRegion="polite" className="flex-row items-center gap-3 rounded-card bg-card p-4">
                <View
                  className={cn(
                    'h-11 w-11 items-center justify-center rounded-full',
                    selected.unlockedAt ? 'bg-primary' : 'bg-surface-3',
                  )}
                >
                  <Icon
                    name={selected.unlockedAt ? (achievementIcon(selected.key) as IconName) : 'lock'}
                    size={20}
                    color={selected.unlockedAt ? colors.primaryForeground : colors.mutedForeground}
                  />
                </View>
                <View className="flex-1">
                  <Text className="font-sans-bold text-foreground">{selected.title}</Text>
                  <Text className="text-[13px] text-muted-foreground">{achievementDetail(selected).text}</Text>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}
