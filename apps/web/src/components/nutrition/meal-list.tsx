'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { nutritionApi, type Meal } from '@/lib/api/nutrition';

const mealTypeLabel: Record<Meal['mealType'], string> = {
  BREAKFAST: 'Café da manhã',
  LUNCH: 'Almoço',
  DINNER: 'Jantar',
  SNACK: 'Lanche',
};

export function MealList({ meals, date }: { meals: Meal[]; date: string }) {
  const qc = useQueryClient();
  const deleteItem = useMutation({
    mutationFn: (id: string) => nutritionApi.deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] }),
  });
  const deleteMeal = useMutation({
    mutationFn: (id: string) => nutritionApi.deleteMeal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] }),
  });

  if (meals.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhuma refeição registrada hoje.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {meals.map((meal) => (
        <div key={meal.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{mealTypeLabel[meal.mealType]}</h3>
              <p className="text-xs text-muted-foreground">
                {new Date(meal.eatenAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => deleteMeal.mutate(meal.id)}
              className="rounded p-1 text-muted-foreground hover:text-rose-500"
              aria-label="Remover refeição"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <ul className="mt-2 divide-y">
            {meal.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p>{item.foodName}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {item.grams}g · {Math.round(item.kcal)}kcal · P{Math.round(item.proteinG)} C
                    {Math.round(item.carbsG)} G{Math.round(item.fatG)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteItem.mutate(item.id)}
                  className="rounded p-1 text-muted-foreground hover:text-rose-500"
                  aria-label="Remover item"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
