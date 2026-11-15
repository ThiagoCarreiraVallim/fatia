'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { historyDaysForWeek, nutritionApi, nutritionWeek, shiftWeek } from '@fatia/api-client';
import { DayStrip } from '@/components/ui/day-strip';

/** Arrasto mínimo, em px, para trocar de semana. */
const SWIPE = 48;

/**
 * A semana do dia escolhido (prancha Al-N1): o dia escolhido em verde e os dias
 * com refeição contornados. Arrastar para o lado troca de semana: a prancha só
 * mostra a semana, mas os dias de antes precisam continuar alcançáveis.
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
    <div
      className="touch-pan-y select-none"
      onPointerDown={(e) => {
        startX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        const from = startX.current;
        startX.current = null;
        if (from == null) return;
        const dx = e.clientX - from;
        if (Math.abs(dx) >= SWIPE) onChange(shiftWeek(date, dx > 0 ? -1 : 1));
      }}
    >
      <DayStrip
        days={week}
        selected={week.findIndex((d) => d.iso === date)}
        onSelect={(i) => onChange(week[i]!.iso)}
      />
    </div>
  );
}
