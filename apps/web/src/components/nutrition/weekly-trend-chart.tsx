'use client';

import { useQuery } from '@tanstack/react-query';
import { nutritionApi } from '@/lib/api/nutrition';

const PT_DAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const BAR_MAX_HEIGHT = 80;

interface Props {
  today: string;
}

export function WeeklyTrendChart({ today }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['nutrition', 'history', 7],
    queryFn: () => nutritionApi.history(7),
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-card" />;
  if (!data) return null;

  const maxKcal = Math.max(...data.series.map((d) => d.kcal), 1);

  return (
    <div className="rounded-xl border border-white/5 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-foreground">Tendência Semanal</h2>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          KCAL
        </span>
      </div>

      <div className="flex items-end justify-between gap-1.5">
        {data.series.map((day) => {
          const isToday = day.date === today;
          const barH = Math.max(4, Math.round((day.kcal / maxKcal) * BAR_MAX_HEIGHT));
          const dayOfWeek = new Date(`${day.date}T12:00:00`).getDay();

          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
              {day.kcal > 0 && (
                <span
                  className={`text-[10px] font-bold tabular-nums ${isToday ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  {Math.round(day.kcal / 100) * 100}
                </span>
              )}
              <div
                className={`w-full rounded-t-md ${isToday ? 'bg-primary' : 'bg-muted'}`}
                style={{ height: barH }}
              />
              <span
                className={`text-[11px] font-bold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {PT_DAY_INITIALS[dayOfWeek]}
              </span>
            </div>
          );
        })}
      </div>

      {data.averages.kcal > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Média:{' '}
          <span className="font-bold text-foreground tabular-nums">
            {Math.round(data.averages.kcal)}
          </span>{' '}
          kcal/dia
        </p>
      )}
    </div>
  );
}
