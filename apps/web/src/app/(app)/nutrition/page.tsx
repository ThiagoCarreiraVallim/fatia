'use client';

import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Copy, ScanBarcode, Settings } from 'lucide-react';
import { mealTypeForTime, nutritionApi, type DayNutrient, type MealType } from '@fatia/api-client';
import { DateNavigator } from '@/components/nutrition/date-navigator';
import { DayNutrientsCard } from '@/components/nutrition/day-nutrients-card';
import { DayMealSources } from '@/components/nutrition/day-meal-sources';
import { WeeklyTrendChart } from '@/components/nutrition/weekly-trend-chart';
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

/** Uma API sem a faixa do dia (de antes da #374) ainda mostra as calorias. */
function kcalFallback(kcal: number): DayNutrient {
  return {
    key: 'kcal',
    label: 'Calorias',
    unit: 'kcal',
    value: kcal,
    min: null,
    max: null,
    status: 'none',
  };
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
  const mealCount = summary.data?.meals.filter((m) => m.items.length > 0).length ?? 0;
  // O chip escolhido vale para o cartão e para o "De onde veio".
  const [nutrientKey, setNutrientKey] = useState<string | null>(null);
  const nutrients = summary.data?.nutrients ?? [];
  const selectedNutrient = nutrientKey ? nutrients.find((n) => n.key === nutrientKey) : undefined;

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

      {summary.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-80" />
          <Skeleton className="h-28" />
          <Skeleton className="h-48" />
        </div>
      )}

      {summary.error && <LoadError error={summary.error} onRetry={() => void summary.refetch()} />}

      {summary.data && (
        <>
          <DayNutrientsCard
            nutrients={nutrients}
            selected={selectedNutrient?.key ?? null}
            onSelect={setNutrientKey}
          />
          <DayMealSources
            meals={summary.data.meals}
            nutrient={selectedNutrient ?? nutrients[0] ?? kcalFallback(summary.data.totals.kcal)}
            date={date}
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
