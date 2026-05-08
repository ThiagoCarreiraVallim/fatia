'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { nutritionApi, type Meal, type MealItem, type MealType } from '@/lib/api/nutrition';
import { FoodSearchDrawer } from './food-search-drawer';
import { EditMealItemDrawer } from './edit-meal-item-drawer';

const mealTypeLabel: Record<MealType, string> = {
  BREAKFAST: 'Café da manhã',
  LUNCH: 'Almoço',
  DINNER: 'Jantar',
  SNACK: 'Lanche',
};

export function MealList({ meals, date }: { meals: Meal[]; date: string }) {
  const qc = useQueryClient();
  const [addingTo, setAddingTo] = useState<{ mealId?: string; mealType?: MealType } | null>(null);
  const [editing, setEditing] = useState<MealItem | null>(null);

  const deleteItem = useMutation({
    mutationFn: (id: string) => nutritionApi.deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] }),
  });
  const deleteMeal = useMutation({
    mutationFn: (id: string) => nutritionApi.deleteMeal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] }),
  });

  return (
    <div className="space-y-3">
      {meals.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma refeição registrada hoje.
        </p>
      ) : (
        meals.map((meal) => (
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAddingTo({ mealId: meal.id })}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Adicionar item"
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteMeal.mutate(meal.id)}
                  className="rounded p-1 text-muted-foreground hover:text-rose-500"
                  aria-label="Remover refeição"
                >
                  <Trash2 size={16} />
                </button>
              </div>
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
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Editar item"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteItem.mutate(item.id)}
                      className="rounded p-1 text-muted-foreground hover:text-rose-500"
                      aria-label="Remover item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <FoodSearchDrawer
        open={addingTo !== null}
        onOpenChange={(open) => !open && setAddingTo(null)}
        mealId={addingTo?.mealId}
        mealType={addingTo?.mealType}
        date={date}
      />
      <EditMealItemDrawer item={editing} date={date} onClose={() => setEditing(null)} />
    </div>
  );
}

export function NewMealButton({
  date,
  onClick,
}: {
  date: string;
  onClick: (mealType: MealType) => void;
}) {
  void date;
  return (
    <div className="grid grid-cols-4 gap-2">
      {(Object.keys(mealTypeLabel) as MealType[]).map((mt) => (
        <button
          key={mt}
          type="button"
          onClick={() => onClick(mt)}
          className="rounded-md border bg-card px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          + {mealTypeLabel[mt].split(' ')[0]}
        </button>
      ))}
    </div>
  );
}
