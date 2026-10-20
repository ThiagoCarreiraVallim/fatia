'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  buildMealTimeline,
  itemAmountText,
  mealItemRestoreInput,
  mealTimelineTitle,
  nutritionApi,
  undoMessage,
  type Meal,
  type MealItem,
  type MealType,
} from '@fatia/api-client';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FoodSearchDrawer } from './food-search-drawer';
import { EditMealItemDrawer } from './edit-meal-item-drawer';
import { MealActionsDrawer } from './meal-actions-drawer';
import { MEAL_TYPE_LABEL as mealTypeLabel } from './meal-labels';
import { invalidateNutritionDay } from '@/lib/nutrition-cache';

const mealTypeEmoji: Record<MealType, string> = {
  BREAKFAST: '☀️',
  LUNCH: '🍽️',
  DINNER: '🌙',
  SNACK: '🍎',
};

interface Props {
  meals: Meal[];
  date: string;
  /** `yyyy-MM-dd` de hoje no fuso da pessoa, para o título ("hoje", "ontem"). */
  today: string;
  onAddMeal: (type: MealType) => void;
}

export function MealTimeline({ meals, date, today, onAddMeal }: Props) {
  const qc = useQueryClient();
  const [addingTo, setAddingTo] = useState<{ mealId?: string; mealType?: MealType } | null>(null);
  const [editing, setEditing] = useState<MealItem | null>(null);
  // Só a refeição inteira pede confirmação; o item apaga na hora e oferece "Desfazer".
  const [pendingDelete, setPendingDelete] = useState<Meal | null>(null);
  const [acting, setActing] = useState<Meal | null>(null);

  const refresh = () => invalidateNutritionDay(qc, date);
  // A refeição não some com o último item, então o item volta para ela.
  const restoreItem = useMutation({
    mutationFn: (item: MealItem) => nutritionApi.addItem(item.mealId, mealItemRestoreInput(item)),
    onSuccess: refresh,
    onError: () => toast.error('Não deu para desfazer. Adicione o item de novo.'),
  });
  const deleteItem = useMutation({
    mutationFn: (item: MealItem) => nutritionApi.deleteItem(item.id),
    onSuccess: (_data, item) => {
      refresh();
      toast(`${undoMessage('mealItem')}: ${item.foodName}`, {
        action: { label: 'Desfazer', onClick: () => restoreItem.mutate(item) },
      });
    },
  });
  const deleteMeal = useMutation({
    mutationFn: (id: string) => nutritionApi.deleteMeal(id),
    onSuccess: () => {
      refresh();
      setPendingDelete(null);
    },
  });

  return (
    <div>
      <h2 className="mb-4 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
        {mealTimelineTitle(date, today)}
      </h2>

      <div className="relative">
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-white/10" />

        <div className="space-y-3">
          {buildMealTimeline(meals).map((entry) =>
            entry.kind === 'meal' ? (
              <MealCard
                key={entry.meal.id}
                meal={entry.meal}
                onAddItem={() => setAddingTo({ mealId: entry.meal.id })}
                onEditItem={setEditing}
                onDeleteItem={(item) => deleteItem.mutate(item)}
                onDeleteMeal={() => setPendingDelete(entry.meal)}
                onMore={() => setActing(entry.meal)}
              />
            ) : (
              <button
                key={entry.mealType}
                type="button"
                onClick={() => onAddMeal(entry.mealType)}
                aria-label={`Registrar ${mealTypeLabel[entry.mealType]}`}
                className="relative flex w-full items-center gap-3 text-left"
              >
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-white/20 bg-background text-base">
                  {mealTypeEmoji[entry.mealType]}
                </div>
                <div className="flex flex-1 items-center justify-between rounded-xl border border-dashed border-white/10 bg-card/50 px-4 py-3">
                  <span className="text-[13px] text-muted-foreground">
                    {mealTypeLabel[entry.mealType]}
                  </span>
                  <Plus size={14} className="text-muted-foreground" />
                </div>
              </button>
            ),
          )}
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
      <MealActionsDrawer meal={acting} date={date} today={today} onClose={() => setActing(null)} />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Remover refeição"
        description={
          pendingDelete
            ? `${mealTypeLabel[pendingDelete.mealType]} e seus ${pendingDelete.items.length} item(ns) serão apagados.`
            : ''
        }
        pending={deleteMeal.isPending}
        onConfirm={() => pendingDelete && deleteMeal.mutate(pendingDelete.id)}
      />
    </div>
  );
}

function MealCard({
  meal,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onDeleteMeal,
  onMore,
}: {
  meal: Meal;
  onAddItem: () => void;
  onEditItem: (item: MealItem) => void;
  onDeleteItem: (item: MealItem) => void;
  onDeleteMeal: () => void;
  /** Copiar para outro dia, salvar como refeição salva. */
  onMore: () => void;
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

      <div className="flex-1 overflow-hidden rounded-xl border border-subtle bg-card">
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
              onClick={onMore}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={`Mais ações de ${mealTypeLabel[meal.mealType]}`}
            >
              <MoreHorizontal size={14} />
            </button>
            <button
              type="button"
              onClick={onDeleteMeal}
              className="rounded p-1 text-muted-foreground hover:text-danger"
              aria-label="Remover refeição"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {meal.items.length > 0 && (
          <div className="divide-y divide-white/5 border-t border-subtle">
            {meal.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-[13px] text-foreground">{item.foodName}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {itemAmountText(item)} · {Math.round(item.kcal)} kcal · P
                    {Math.round(item.proteinG)} C{Math.round(item.carbsG)} G{Math.round(item.fatG)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onEditItem(item)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Editar ${item.foodName}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteItem(item)}
                    className="rounded p-1 text-muted-foreground hover:text-danger"
                    aria-label={`Remover ${item.foodName}`}
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
