import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  RECORDS_NOTE,
  RECORD_GROUP_FILTERS,
  recordHighlight,
  strengthRecordRows,
  workoutApi,
  type RecordGroupFilter,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Chip, EmptyState, ErrorState, LoadingState, cn } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { colors } from '@/theme/colors';

/**
 * Recordes (prancha Al-G5, #382) — réplica de
 * `apps/web/src/components/progress/records-screen.tsx`.
 */
export default function RecordsScreen() {
  const { loadUnit } = useUnitPrefs();
  const [group, setGroup] = useState<RecordGroupFilter>('all');
  const query = useQuery({
    queryKey: ['workout', 'records', 'overview'],
    queryFn: () => workoutApi.recordsOverview(),
  });
  const highlight = query.data ? recordHighlight(query.data, loadUnit) : null;
  const rows = query.data ? strengthRecordRows(query.data, group, loadUnit) : [];

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View className="gap-3 px-4 pb-8 pt-2">
        {query.isLoading ? <LoadingState label="Carregando os recordes…" /> : null}
        {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}

        {highlight ? (
          <View className="gap-2 rounded-card bg-primary p-4">
            <Text className="font-sans-bold text-[11px] uppercase tracking-widest text-primary-foreground opacity-70">
              Maior evolução do mês
            </Text>
            <View className="flex-row items-baseline justify-between gap-2">
              <Text className="flex-1 font-display text-[20px] leading-[24px] text-primary-foreground">
                {highlight.title}
              </Text>
              <Text className="font-display text-[28px] leading-[32px] text-primary-foreground">
                {highlight.percent}
              </Text>
            </View>
            <View className="h-1.5 w-full overflow-hidden rounded-pill" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}>
              <View
                style={{
                  width: `${highlight.barPercent}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: colors.primaryForeground,
                }}
              />
            </View>
            <Text className="font-sans-semibold text-[13px] text-primary-foreground opacity-80">
              {highlight.scale}
            </Text>
          </View>
        ) : null}

        {query.data ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {RECORD_GROUP_FILTERS.map((f) => (
                <Chip key={f.value} label={f.label} selected={group === f.value} onPress={() => setGroup(f.value)} />
              ))}
            </ScrollView>

            {rows.length > 0 ? (
              <View accessibilityLabel="Recordes" className="overflow-hidden rounded-card bg-card">
                {rows.map((r, i) => (
                  <View
                    key={r.id}
                    accessible
                    accessibilityLabel={`${r.title}: ${r.value} ${r.unit}. ${r.subtitle}`}
                    className={cn('flex-row items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border')}
                  >
                    <View
                      className="h-10 w-10 items-center justify-center rounded-[12px]"
                      style={{ backgroundColor: `${colors.steps}24` }}
                    >
                      <Icon name="trophy" size={18} color={colors.steps} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-semibold text-foreground" numberOfLines={1}>
                        {r.title}
                      </Text>
                      <Text className="text-[12px] text-muted-foreground" numberOfLines={1}>
                        {r.subtitle}
                      </Text>
                    </View>
                    <Text className="font-display text-[18px] text-foreground">
                      {r.value}
                      <Text className="font-sans-semibold text-[12px] text-muted-foreground"> {r.unit}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState
                title="Nenhum recorde aqui"
                description="Os recordes aparecem conforme você registra séries com carga."
              />
            )}

            <Text className="px-1 text-[13px] text-muted-foreground">{RECORDS_NOTE}</Text>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
