'use client';

import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { mealTypeForTime, nutritionApi, type DayNutrient, type MealType } from '@fatia/api-client';
import { NutritionWeekStrip } from '@/components/nutrition/week-strip';
import { DayNutrientsCard } from '@/components/nutrition/day-nutrients-card';
import { DayMealSources } from '@/components/nutrition/day-meal-sources';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { LoadError } from '@/components/nutrition/load-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Icon } from '@/components/ui/icon';
import { TabHeader, headerButtonClass } from '@/components/layout/tab-header';

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
  const router = useRouter();
  const date = params.get('date') ?? todayIso();
  const goTo = (next: string) => {
    const q = new URLSearchParams(params);
    q.set('date', next);
    router.replace(`?${q.toString()}`, { scroll: false });
  };
  const [newMealType, setNewMealType] = useState<MealType | null>(null);
  // Tipo da refeição do atalho de escanear, pela hora — a mesma regra do "+".
  const [scanMealType, setScanMealType] = useState<MealType | null>(null);

  const summary = useQuery({
    queryKey: ['nutrition', 'summary', date],
    queryFn: () => nutritionApi.summary(date),
  });
  // O chip escolhido vale para o cartão e para o "De onde veio".
  const [nutrientKey, setNutrientKey] = useState<string | null>(null);
  const nutrients = summary.data?.nutrients ?? [];
  const selectedNutrient = nutrientKey ? nutrients.find((n) => n.key === nutrientKey) : undefined;

  return (
    <div className="space-y-4 px-5 pt-2 pb-4">
      {/* Cabeçalho da prancha Al-N1: o título grande e três atalhos quadrados —
        leitor (Al-N4), plano alimentar (Al-N5) e metas do dia (Al-N6). */}
      <TabHeader title="Nutrição">
        {/* Escanear fica no topo, e não só dentro do drawer de busca: o caso
            é "estou com a embalagem na mão". Como no app. */}
        <button
          type="button"
          onClick={() => setScanMealType(mealTypeForTime(new Date()))}
          className={headerButtonClass()}
          aria-label="Ler código ou rótulo"
        >
          <Icon name="scan" size={20} />
        </button>
        <Link href="/nutrition/plan" className={headerButtonClass()} aria-label="Plano alimentar">
          <Icon name="book" size={20} />
        </Link>
        <Link href="/nutrition/goals" className={headerButtonClass()} aria-label="Metas do dia">
          <Icon name="target" size={20} />
        </Link>
      </TabHeader>

      <NutritionWeekStrip date={date} today={todayIso()} onChange={goTo} />

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
            all={!selectedNutrient}
            onAddMeal={(mt) => setNewMealType(mt)}
          />
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
