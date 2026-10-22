'use client';

import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Copy, ScanBarcode, Settings } from 'lucide-react';
import { mealTypeForTime, nutritionApi, type MealType } from '@fatia/api-client';
import { DateNavigator } from '@/components/nutrition/date-navigator';
import { CaloriesRingCard } from '@/components/nutrition/calories-ring-card';
import { MacroBentoGrid } from '@/components/nutrition/macro-bento-grid';
import { MealTimeline } from '@/components/nutrition/meal-timeline';
import { WeeklyTrendChart } from '@/components/nutrition/weekly-trend-chart';
import { NutrientTargetsCard } from '@/components/nutrition/nutrient-targets-card';
import { CustomFoodsCard } from '@/components/nutrition/custom-foods-card';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { CopyDayDrawer } from '@/components/nutrition/copy-day-drawer';
import { LoadError } from '@/components/nutrition/load-error';
import { Skeleton } from '@/components/ui/skeleton';
import { TopBarActions, topBarActionClass } from '@/components/layout/app-top-bar';

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
  // Tipo da refeição do atalho de escanear, pela hora — a mesma regra do "+".
  const [scanMealType, setScanMealType] = useState<MealType | null>(null);

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
      <TopBarActions>
        {/* Escanear fica no topo, e não só dentro do drawer de busca: o caso é
          "estou com a embalagem na mão", e dois cliques até o leitor fazem a
          pessoa digitar o nome do produto assim mesmo. Como no app. */}
        <button
          type="button"
          onClick={() => setScanMealType(mealTypeForTime(new Date()))}
          className={topBarActionClass}
          aria-label="Escanear código de barras"
        >
          <ScanBarcode size={20} />
        </button>
        {mealCount > 0 && (
          <button
            type="button"
            onClick={() => setCopyingDay(true)}
            className={topBarActionClass}
            aria-label="Copiar dia"
          >
            <Copy size={20} />
          </button>
        )}
        <Link href="/nutrition/goals" className={topBarActionClass} aria-label="Metas">
          <Settings size={20} />
        </Link>
      </TopBarActions>

      <DateNavigator date={date} />

      {(summary.isLoading || goals.isLoading) && (
        <div className="space-y-4">
          <Skeleton className="h-80" />
          <Skeleton className="h-28" />
          <Skeleton className="h-48" />
        </div>
      )}

      {summary.error && <LoadError error={summary.error} onRetry={() => void summary.refetch()} />}

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

      <FoodSearchDrawer
        open={scanMealType !== null}
        onOpenChange={(open) => !open && setScanMealType(null)}
        mealType={scanMealType ?? undefined}
        date={date}
        initialMode="scan"
      />

      <CopyDayDrawer
        open={copyingDay}
        onOpenChange={setCopyingDay}
        date={date}
        today={todayIso()}
        mealCount={mealCount}
      />

      {goals.error && (
        <p role="alert" className="text-sm text-danger">
          Não foi possível carregar suas metas.
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
