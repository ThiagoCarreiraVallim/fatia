import { useRef } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { historyDaysForWeek, nutritionApi, nutritionWeek, shiftWeek } from '@fatia/api-client';
import { DayStrip } from '@/components/ui';

/** Arrasto mínimo, em px, para trocar de semana. */
const SWIPE = 48;

/**
 * A semana do dia escolhido (prancha Al-N1), espelho de
 * `apps/web/src/components/nutrition/week-strip.tsx`: o dia escolhido em verde,
 * os dias com refeição contornados, e arrastar para o lado troca de semana.
 */
export function NutritionWeekStrip({
  date,
  today,
  onChange,
}: {
  date: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const days = historyDaysForWeek(date, today);
  const history = useQuery({
    queryKey: ['nutrition', 'history', days],
    queryFn: () => nutritionApi.history(days),
  });
  const week = nutritionWeek(date, history.data?.series ?? []);
  const startX = useRef<number | null>(null);

  return (
    <View
      onTouchStart={(e) => {
        startX.current = e.nativeEvent.pageX;
      }}
      onTouchEnd={(e) => {
        const from = startX.current;
        startX.current = null;
        if (from == null) return;
        const dx = e.nativeEvent.pageX - from;
        if (Math.abs(dx) >= SWIPE) onChange(shiftWeek(date, dx > 0 ? -1 : 1));
      }}
    >
      <DayStrip
        days={week}
        selected={week.findIndex((d) => d.iso === date)}
        onSelect={(i) => onChange(week[i]!.iso)}
      />
    </View>
  );
}
