'use client';

import { useQuery } from '@tanstack/react-query';
import { nutritionApi } from '@fatia/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError } from './load-error';

const PT_DAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const BAR_MAX_HEIGHT = 80;

interface Props {
  today: string;
}

export function WeeklyTrendChart({ today }: Props) {
  const history = useQuery({
    queryKey: ['nutrition', 'history', 7],
    queryFn: () => nutritionApi.history(7),
  });
  const data = history.data;

  const maxKcal = Math.max(...(data?.series ?? []).map((d) => d.kcal), 1);
  const initial = (iso: string) => PT_DAY_INITIALS[new Date(`${iso}T12:00:00`).getDay()];

  return (
    <div className="rounded-xl border border-subtle bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-foreground">Tendência Semanal</h2>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          KCAL
        </span>
      </div>

      {/* O título fica à vista no carregamento e no erro, como no app. Antes o
        card sumia quando a consulta falhava, sem dizer nada nem tentar de novo. */}
      {history.isLoading && <Skeleton className="h-28" />}
      {history.error && <LoadError error={history.error} onRetry={() => void history.refetch()} />}
      {data && (
        <>
          <div
            className="flex items-end justify-between gap-1.5"
            role="img"
            // As barras são desenho; o leitor de tela ouve a série, como no app.
            aria-label={`Calorias dos últimos ${data.series.length} dias: ${data.series
              .map((day) => `${initial(day.date)} ${Math.round(day.kcal)}`)
              .join(', ')}`}
          >
            {data.series.map((day) => {
              const isToday = day.date === today;
              const barH = Math.max(4, Math.round((day.kcal / maxKcal) * BAR_MAX_HEIGHT));

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
                    {initial(day.date)}
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
        </>
      )}
    </div>
  );
}
