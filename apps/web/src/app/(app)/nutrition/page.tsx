'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Settings } from 'lucide-react';
import { nutritionApi, type MealType } from '@/lib/api/nutrition';
import { DateNavigator } from '@/components/nutrition/date-navigator';
import { MacroBar } from '@/components/nutrition/macro-bar';
import { MealList, NewMealButton } from '@/components/nutrition/meal-list';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NutritionPage() {
  const params = useSearchParams();
  const date = params.get('date') ?? todayIso();
  const [newMealType, setNewMealType] = useState<MealType | null>(null);

  const summary = useQuery({
    queryKey: ['nutrition', 'summary', date],
    queryFn: () => nutritionApi.summary(date),
  });
  const goals = useQuery({
    queryKey: ['nutrition', 'goals'],
    queryFn: () => nutritionApi.goals(),
  });

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Nutrição</h1>
        <Link
          href="/nutrition/goals"
          className="rounded p-2 text-muted-foreground hover:text-foreground"
          aria-label="Metas"
        >
          <Settings size={18} />
        </Link>
      </header>

      <DateNavigator date={date} />

      {summary.isLoading && (
        <div className="space-y-2">
          <div className="h-2 animate-pulse rounded bg-muted" />
          <div className="h-2 animate-pulse rounded bg-muted" />
          <div className="h-2 animate-pulse rounded bg-muted" />
          <div className="h-2 animate-pulse rounded bg-muted" />
        </div>
      )}

      {summary.data && (
        <section className="space-y-2 rounded-lg border bg-card p-4">
          {goals.data ? (
            <>
              <MacroBar
                label="Calorias"
                value={summary.data.totals.kcal}
                min={goals.data.kcalMin}
                max={goals.data.kcalMax}
                unit=""
              />
              <MacroBar
                label="Proteína"
                value={summary.data.totals.proteinG}
                min={goals.data.proteinMinG}
                max={goals.data.proteinMaxG}
              />
              <MacroBar
                label="Carboidratos"
                value={summary.data.totals.carbsG}
                min={goals.data.carbsMinG}
                max={goals.data.carbsMaxG}
              />
              <MacroBar
                label="Gordura"
                value={summary.data.totals.fatG}
                min={goals.data.fatMinG}
                max={goals.data.fatMaxG}
              />
            </>
          ) : (
            <div className="text-sm">
              <p className="tabular-nums">
                {Math.round(summary.data.totals.kcal)} kcal · P
                {Math.round(summary.data.totals.proteinG)} · C
                {Math.round(summary.data.totals.carbsG)} · G{Math.round(summary.data.totals.fatG)}
              </p>
              <p className="mt-2 text-muted-foreground">
                Defina suas{' '}
                <Link href="/nutrition/goals" className="underline">
                  metas
                </Link>{' '}
                para ver as faixas.
              </p>
            </div>
          )}
        </section>
      )}

      {summary.data && <MealList meals={summary.data.meals} date={date} />}

      {summary.data && <NewMealButton date={date} onClick={(mt) => setNewMealType(mt)} />}

      <FoodSearchDrawer
        open={newMealType !== null}
        onOpenChange={(open) => !open && setNewMealType(null)}
        mealType={newMealType ?? undefined}
        date={date}
      />

      {summary.error && (
        <p className="text-sm text-rose-500">
          Erro ao carregar: {(summary.error as Error).message}
        </p>
      )}
    </div>
  );
}
