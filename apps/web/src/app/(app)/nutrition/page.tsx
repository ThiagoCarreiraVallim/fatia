'use client';

import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Copy, Settings } from 'lucide-react';
import { nutritionApi, type MealType } from '@fatia/api-client';
import { DateNavigator } from '@/components/nutrition/date-navigator';
import { CaloriesRingCard } from '@/components/nutrition/calories-ring-card';
import { MacroBentoGrid } from '@/components/nutrition/macro-bento-grid';
import { MealTimeline } from '@/components/nutrition/meal-timeline';
import { WeeklyTrendChart } from '@/components/nutrition/weekly-trend-chart';
import { NutrientTargetsCard } from '@/components/nutrition/nutrient-targets-card';
import { CustomFoodsCard } from '@/components/nutrition/custom-foods-card';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { CopyDayDrawer } from '@/components/nutrition/copy-day-drawer';

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date());
}

function NutritionPageContent() {
  const params = useSearchParams();
  const date = params.get('date') ?? todayIso();
  const [newMealType, setNewMealType] = useState<MealType | null>(null);
  const [copyingDay, setCopyingDay] = useState(false);

  const summary = useQuery({
    queryKey: ['nutrition', 'summary', date],
    queryFn: () => nutritionApi.summary(date),
  });
  const goals = useQuery({
    queryKey: ['nutrition', 'goals'],
    queryFn: () => nutritionApi.goals(),
  });
  const mealCount = summary.data?.meals.filter((m) => m.items.length > 0).length ?? 0;

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <header className="flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-foreground">Nutrição</h1>
        <div className="flex items-center">
          {mealCount > 0 && (
            <button
              type="button"
              onClick={() => setCopyingDay(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Copiar dia"
            >
              <Copy size={18} />
            </button>
          )}
          <Link
            href="/nutrition/goals"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Metas"
          >
            <Settings size={18} />
          </Link>
        </div>
      </header>

      <DateNavigator date={date} />

      {(summary.isLoading || goals.isLoading) && (
        <div className="space-y-4">
          <div className="h-80 animate-pulse rounded-xl bg-card" />
          <div className="h-28 animate-pulse rounded-xl bg-card" />
          <div className="h-48 animate-pulse rounded-xl bg-card" />
        </div>
      )}

      {summary.data && (
        <>
          <CaloriesRingCard totals={summary.data.totals} goals={goals.data ?? null} />
          <MacroBentoGrid totals={summary.data.totals} goals={goals.data ?? null} />
          <NutrientTargetsCard date={date} />
          <MealTimeline
            meals={summary.data.meals}
            date={date}
            today={todayIso()}
            onAddMeal={(mt) => setNewMealType(mt)}
          />
          <WeeklyTrendChart today={todayIso()} />
          <CustomFoodsCard />
        </>
      )}

      <FoodSearchDrawer
        open={newMealType !== null}
        onOpenChange={(open) => !open && setNewMealType(null)}
        mealType={newMealType ?? undefined}
        date={date}
      />

      <CopyDayDrawer
        open={copyingDay}
        onOpenChange={setCopyingDay}
        date={date}
        today={todayIso()}
        mealCount={mealCount}
      />

      {summary.error && (
        <p className="text-sm text-rose-500">
          Erro ao carregar: {(summary.error as Error).message}
        </p>
      )}
    </div>
  );
}

export default function NutritionPage() {
  return (
    <Suspense>
      <NutritionPageContent />
    </Suspense>
  );
}
