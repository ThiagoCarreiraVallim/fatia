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

const mealTypeEmoji: Record<MealType, string> = {
  BREAKFAST: '☀️',
  LUNCH: '🍽️',
  DINNER: '🌙',
  SNACK: '🍎',
};

const ALL_MEAL_TYPES: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

interface Props {
  meals: Meal[];
  date: string;
  onAddMeal: (type: MealType) => void;
}

export function MealTimeline({ meals, date, onAddMeal }: Props) {
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

  const loggedTypes = new Set(meals.map((m) => m.mealType));
  const upcomingTypes = ALL_MEAL_TYPES.filter((t) => !loggedTypes.has(t));

  return (
    <div>
      <h2 className="mb-4 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
        Timeline de Hoje
      </h2>

      <div className="relative">
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-white/10" />

        <div className="space-y-3">
          {meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              onAddItem={() => setAddingTo({ mealId: meal.id })}
              onEditItem={setEditing}
              onDeleteItem={(id) => deleteItem.mutate(id)}
              onDeleteMeal={() => deleteMeal.mutate(meal.id)}
            />
          ))}

          {upcomingTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onAddMeal(type)}
              className="relative flex w-full items-center gap-3 text-left"
            >
              <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-white/20 bg-background text-base">
                {mealTypeEmoji[type]}
              </div>
              <div className="flex flex-1 items-center justify-between rounded-xl border border-dashed border-white/10 bg-card/50 px-4 py-3">
                <span className="text-[13px] text-muted-foreground">{mealTypeLabel[type]}</span>
                <Plus size={14} className="text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      </div>

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

function MealCard({
  meal,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onDeleteMeal,
}: {
  meal: Meal;
  onAddItem: () => void;
  onEditItem: (item: MealItem) => void;
  onDeleteItem: (id: string) => void;
  onDeleteMeal: () => void;
}) {
  const totalKcal = meal.items.reduce((sum, i) => sum + i.kcal, 0);
  const time = new Date(meal.eatenAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="relative flex items-start gap-3">
      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-base">
        {mealTypeEmoji[meal.mealType]}
      </div>

      <div className="flex-1 overflow-hidden rounded-xl border border-white/5 bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <span className="text-[14px] font-semibold text-foreground">
              {mealTypeLabel[meal.mealType]}
            </span>
            <span className="ml-2 text-[12px] text-muted-foreground">{time}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[12px] font-bold tabular-nums text-muted-foreground">
              {Math.round(totalKcal)} kcal
            </span>
            <button
              type="button"
              onClick={onAddItem}
              className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Adicionar item"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={onDeleteMeal}
              className="rounded p-1 text-muted-foreground hover:text-rose-500"
              aria-label="Remover refeição"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {meal.items.length > 0 && (
          <div className="divide-y divide-white/5 border-t border-white/5">
            {meal.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-[13px] text-foreground">{item.foodName}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {item.grams}g · {Math.round(item.kcal)} kcal · P{Math.round(item.proteinG)} C
                    {Math.round(item.carbsG)} G{Math.round(item.fatG)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onEditItem(item)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Editar"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteItem(item.id)}
                    className="rounded p-1 text-muted-foreground hover:text-rose-500"
                    aria-label="Remover"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
