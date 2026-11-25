import { useQuery } from '@tanstack/react-query';
import { historyDaysForWeek, nutritionApi, nutritionWeek } from '@fatia/api-client';
import { DayStrip } from '@/components/ui';
import { WeekPager } from '@/components/ui/week-pager';

/**
 * A semana do dia escolhido (prancha Al-N1), espelho de
 * `apps/web/src/components/nutrition/week-strip.tsx`: o dia escolhido em verde,
 * os dias com refeição contornados, e a faixa arrasta de semana em semana
 * acompanhando o dedo (#479, `WeekPager`, o mesmo do Treino).
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
  return (
    <WeekPager
      anchor={date}
      today={today}
      onAnchorChange={onChange}
      // A Nutrição tem `px-5`: a semana vizinha entra pela borda da tela.
      bleed={20}
      renderWeek={(monday) => (
        <NutritionWeek monday={monday} date={date} today={today} onChange={onChange} />
      )}
    />
  );
}

function NutritionWeek({
  monday,
  date,
  today,
  onChange,
}: {
  monday: string;
  date: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const days = historyDaysForWeek(monday, today);
  const history = useQuery({
    queryKey: ['nutrition', 'history', days],
    queryFn: () => nutritionApi.history(days),
  });
  const week = nutritionWeek(monday, history.data?.series ?? []);
  return (
    <DayStrip
      days={week}
      // Na semana vizinha, durante o arrasto, nenhum dia está escolhido.
      selected={week.findIndex((d) => d.iso === date)}
      onSelect={(i) => onChange(week[i]!.iso)}
    />
  );
}
