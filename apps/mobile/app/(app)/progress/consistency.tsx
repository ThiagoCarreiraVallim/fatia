import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  CONSISTENCY_RANGE_OPTIONS,
  CONSISTENCY_WEEKDAY_LABELS,
  consistencyAreaRows,
  consistencyCells,
  consistencyGridCaption,
  consistencyGridTitle,
  consistencyStats,
  consistencyTip,
  consistencyYearMonths,
  progressApi,
  shortDay,
  type ConsistencyCell,
  type ConsistencyRange,
  type ConsistencyReport,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { ErrorState, LoadingState, Segmented } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ProgressBar, heatColor } from '@/components/progress/progress-ui';
import { colors } from '@/theme/colors';

/**
 * Constância (prancha Al-G12, #382) — réplica de
 * `apps/web/src/components/progress/consistency-screen.tsx`.
 */
export default function ConsistencyScreen() {
  const [range, setRange] = useState<ConsistencyRange>('month');
  const query = useQuery({
    queryKey: ['progress', 'consistency', range],
    queryFn: () => progressApi.consistency(range),
  });
  const report = query.data;
  const areaColor: Record<string, string> = {
    primary: colors.primary,
    protein: colors.protein,
    water: colors.water,
    steps: colors.steps,
  };

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View className="gap-3 px-4 pb-8 pt-2">
        <Segmented
          label="Período"
          options={CONSISTENCY_RANGE_OPTIONS}
          value={range}
          onChange={setRange}
        />

        {query.isLoading ? <LoadingState label="Carregando a constância…" /> : null}
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : null}

        {report ? (
          <>
            <View className="flex-row gap-2">
              {consistencyStats(report).map((s) => (
                <View
                  key={s.label}
                  className="flex-1 basis-0 gap-0.5 rounded-card bg-card px-3.5 py-3"
                >
                  <View className="flex-row items-center gap-1">
                    <Text className="font-display text-[22px] leading-[28px] text-foreground">
                      {s.value}
                    </Text>
                    {s.fire ? <Icon name="flame" size={18} color={colors.warning} /> : null}
                  </View>
                  <Text className="text-[13px] text-muted-foreground">{s.label}</Text>
                </View>
              ))}
            </View>

            <View className="gap-3 rounded-card bg-card p-4">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className="font-sans-bold text-[15px] text-foreground">
                    {consistencyGridTitle(report)}
                  </Text>
                  <Text className="text-[12px] text-muted-foreground">
                    {consistencyGridCaption(report)}
                  </Text>
                </View>
                {report.range !== 'year' ? (
                  <View className="flex-row items-center gap-1" accessibilityElementsHidden>
                    <Text className="text-[11px] text-muted-foreground">0</Text>
                    {[0, 1, 2, 3, 4].map((l) => (
                      <View
                        key={l}
                        style={[{ width: 10, height: 10, borderRadius: 3 }, heatColor(l)]}
                      />
                    ))}
                    <Text className="text-[11px] text-muted-foreground">4</Text>
                  </View>
                ) : null}
              </View>
              <Grid report={report} />
            </View>

            <View className="gap-3 rounded-card bg-card p-4">
              <Text className="font-sans-bold text-[15px] text-foreground">
                Por área <Text className="text-muted-foreground">· dias na meta</Text>
              </Text>
              {consistencyAreaRows(report).map((row) => (
                <View key={row.area} className="flex-row items-center gap-3">
                  <Icon name={row.icon} size={18} color={areaColor[row.tone]} />
                  <Text className="w-[92px] text-sm text-foreground">{row.label}</Text>
                  <View className="flex-1">
                    <ProgressBar percent={row.percent} color={areaColor[row.tone]} />
                  </View>
                  <Text className="w-[56px] text-right font-sans-bold text-[13px] text-foreground">
                    {row.text}
                  </Text>
                </View>
              ))}
            </View>

            <View className="flex-row items-start gap-2 px-1">
              <Icon name="info" size={16} color={colors.mutedForeground} />
              <Text className="flex-1 text-[13px] text-muted-foreground">
                {consistencyTip(report)}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function Grid({ report }: { report: ConsistencyReport }) {
  if (report.range === 'year') {
    const months = consistencyYearMonths(report);
    return (
      <View
        accessible
        accessibilityLabel={months.map((m) => `${m.name}: ${m.percent}%`).join(', ')}
        className="h-[150px] flex-row items-end gap-1.5"
      >
        {months.map((m) => (
          <View key={m.key} className="h-full flex-1 items-center justify-end gap-1">
            <Text className="text-[10px] text-muted-foreground">{m.percent}</Text>
            <View
              style={{
                width: '100%',
                height: `${Math.max(4, m.percent * 0.75)}%`,
                borderRadius: 4,
                backgroundColor: colors.primary,
                opacity: m.current ? 1 : 0.45,
              }}
            />
            <Text className="text-[11px] text-muted-foreground">{m.label}</Text>
          </View>
        ))}
      </View>
    );
  }

  const cells = consistencyCells(report);
  const active = report.days.filter((d) => d.count > 0).length;
  const label = `${active} de ${report.days.length} dias ativos entre ${shortDay(report.from)} e ${shortDay(report.to)}`;
  const weeks: ConsistencyCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  if (report.range === 'quarter') {
    // Cada coluna é uma semana; as linhas são os dias, de segunda a domingo.
    return (
      <View accessible accessibilityLabel={label} className="flex-row gap-1">
        {weeks.map((week) => (
          <View key={week[0]!.date} className="flex-1 gap-1">
            {week.map((c) => (
              <Cell key={c.date} cell={c} />
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View className="gap-1.5">
      <View className="flex-row gap-1.5" accessibilityElementsHidden>
        {CONSISTENCY_WEEKDAY_LABELS.map((l, i) => (
          <Text key={i} className="flex-1 text-center text-[11px] text-muted-foreground">
            {l}
          </Text>
        ))}
      </View>
      <View accessible accessibilityLabel={label} className="gap-1.5">
        {weeks.map((week) => (
          <View key={week[0]!.date} className="flex-row gap-1.5">
            {week.map((c) => (
              <Cell key={c.date} cell={c} showDay />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function Cell({ cell, showDay = false }: { cell: ConsistencyCell; showDay?: boolean }) {
  if (cell.kind === 'outside') return <View style={{ flex: 1, aspectRatio: 1 }} />;
  const future = cell.kind === 'future';
  return (
    <View
      style={[
        {
          flex: 1,
          aspectRatio: 1,
          borderRadius: 6,
          alignItems: 'center',
          justifyContent: 'center',
        },
        future ? { borderWidth: 1, borderColor: colors.border } : heatColor(cell.level),
      ]}
    >
      {showDay ? (
        <Text
          style={{
            fontSize: 11,
            color: !future && cell.level >= 3 ? colors.primaryForeground : colors.mutedForeground,
          }}
        >
          {cell.day}
        </Text>
      ) : null}
    </View>
  );
}
