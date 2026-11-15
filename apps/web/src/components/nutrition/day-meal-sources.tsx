'use client';

import Link from 'next/link';
import {
  buildMealTimeline,
  formatNutrientAmount,
  mealHasAiItems,
  mealNutrientValue,
  mealShareOfDay,
  mealSummary,
  mealTypeForTime,
  type DayNutrient,
  type Meal,
  type MealType,
  type PlannedMealSuggestion,
} from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { MEAL_TYPE_LABEL } from './meal-labels';

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * "De onde veio" (prancha Al-N1): cada refeição com quanto trouxe do nutriente
 * escolhido e o % do dia. O toque abre a refeição (Al-N8/N8b); o vazio do tipo
 * e o botão do fim abrem o registro.
 */
export function DayMealSources({
  meals,
  nutrient,
  date,
  onAddMeal,
  planned = null,
}: {
  meals: Meal[];
  /** O nutriente escolhido no topo; sem escolha, calorias. */
  nutrient: DayNutrient;
  date: string;
  onAddMeal: (type: MealType) => void;
  /** Lanche do plano alimentar (#376). Sem plano, nada aparece. */
  planned?: PlannedMealSuggestion | null;
}) {
  const isKcal = nutrient.key === 'kcal';
  return (
    <section aria-labelledby="day-sources-title" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id="day-sources-title" className="font-display text-lg font-semibold">
          De onde veio
        </h2>
        <span className="text-xs text-muted-foreground">{nutrient.unit}</span>
      </div>

      <div className="flex flex-col gap-2">
        {buildMealTimeline(meals).map((entry) => {
          if (entry.kind === 'empty') {
            const label = MEAL_TYPE_LABEL[entry.mealType];
            return (
              <button
                key={entry.mealType}
                type="button"
                onClick={() => onAddMeal(entry.mealType)}
                aria-label={`Registrar ${label}`}
                className="anim-press flex min-h-14 items-center gap-3 rounded-card border border-dashed border-border px-4 py-3 text-left"
              >
                <span className="flex-1 font-semibold text-muted-foreground">{label}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                  <Icon name="plus" size={16} />
                </span>
              </button>
            );
          }
          const meal = entry.meal;
          const value = mealNutrientValue(meal, nutrient.key);
          const ai = mealHasAiItems(meal);
          return (
            <Link
              key={meal.id}
              href={`/nutrition/meals/${meal.id}?date=${date}`}
              className="anim-press flex min-h-14 items-center gap-3 rounded-card bg-card px-4 py-3"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <b className="text-[15px]">{MEAL_TYPE_LABEL[meal.mealType]}</b>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {clock(meal.eatenAt)}
                  </span>
                  {meal.hasPhoto ? (
                    <Icon
                      name="camera"
                      size={16}
                      label="com foto"
                      className="text-muted-foreground"
                    />
                  ) : (
                    ai && (
                      <Icon
                        name="spark"
                        size={16}
                        label="reconhecida pela IA, foto não guardada"
                        className="text-primary"
                      />
                    )
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {mealSummary(meal) || 'Sem itens'}
                </span>
                {isKcal && meal.items.length > 0 && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {`P ${Math.round(mealNutrientValue(meal, 'protein_g'))} · C ${Math.round(
                      mealNutrientValue(meal, 'carbs_g'),
                    )} · G ${Math.round(mealNutrientValue(meal, 'fat_g'))}`}
                  </span>
                )}
              </span>
              <span className="flex flex-col items-end">
                <b className="tabular-nums">{formatNutrientAmount(value, nutrient.unit)}</b>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {`${mealShareOfDay(value, nutrient.value)}%`}
                </span>
              </span>
            </Link>
          );
        })}

        <PlannedMealSlot suggestion={planned} />

        <button
          type="button"
          onClick={() => onAddMeal(mealTypeForTime(new Date()))}
          className="anim-press flex min-h-12 items-center justify-center gap-2 rounded-card text-sm font-semibold text-primary"
        >
          <Icon name="plus" size={16} />
          Adicionar lanche ou refeição
        </button>
      </div>
    </section>
  );
}

/**
 * Onde o lanche do plano ("Comi isso" / "Trocar") vai entrar quando a #376
 * trouxer o plano alimentar. Hoje não há plano: não desenha nada.
 */
export function PlannedMealSlot({ suggestion }: { suggestion: PlannedMealSuggestion | null }) {
  if (!suggestion) return null;
  return null;
}
