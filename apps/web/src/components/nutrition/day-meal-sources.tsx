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
  MEAL_TYPICAL_TIME,
  emptyMealHint,
} from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
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
  all = false,
}: {
  meals: Meal[];
  /** O nutriente escolhido no topo; sem escolha, calorias. */
  nutrient: DayNutrient;
  date: string;
  onAddMeal: (type: MealType) => void;
  /** Lanche do plano alimentar (#376). Sem plano, nada aparece. */
  planned?: PlannedMealSuggestion | null;
  /** "Todos" no topo: calorias com os macros de cada refeição, sem o %. */
  all?: boolean;
}) {
  const timeline = buildMealTimeline(meals);
  const logged = timeline.flatMap((e) => (e.kind === 'meal' ? [e.meal] : []));
  const empty = timeline.flatMap((e) => (e.kind === 'empty' ? [e.mealType] : []));
  const color = all ? 'bg-primary' : (SOURCE_COLOR[nutrient.key] ?? 'bg-primary');
  return (
    <section aria-labelledby="day-sources-title" className="flex flex-col gap-4">
      <div className="mt-1 flex items-baseline justify-between px-1">
        <h2 id="day-sources-title" className="font-display text-h3">
          De onde veio
        </h2>
        <span className="text-xs text-muted-foreground">
          {all ? 'kcal · macros' : `${nutrient.unit} · % do dia`}
        </span>
      </div>

      {logged.length > 0 && (
        <div className="flex flex-col rounded-card bg-card px-4">
          {logged.map((meal, i) => {
            const value = mealNutrientValue(meal, nutrient.key);
            const ai = mealHasAiItems(meal);
            return (
              <Link
                key={meal.id}
                href={`/nutrition/meals/${meal.id}?date=${date}`}
                className={cn(
                  'flex min-h-[72px] items-center gap-3 py-3',
                  i > 0 && 'border-t border-subtle',
                )}
              >
                <span
                  aria-hidden
                  className={cn('h-9 w-2.5 shrink-0 rounded-[3px]', color)}
                  style={{ opacity: SOURCE_OPACITY[Math.min(i, SOURCE_OPACITY.length - 1)] }}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <b className="text-sm">{MEAL_TYPE_LABEL[meal.mealType]}</b>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {clock(meal.eatenAt)}
                    </span>
                    {meal.hasPhoto ? (
                      <Icon name="camera" size={16} label="com foto" className="text-faint" />
                    ) : (
                      ai && (
                        <Icon
                          name="spark"
                          size={16}
                          label="reconhecida pela IA, foto não guardada"
                          className="text-faint"
                        />
                      )
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {mealSummary(meal) || 'Sem itens'}
                  </span>
                  {all && meal.items.length > 0 && (
                    <span className="text-xs tabular-nums text-foreground/70">
                      {`P ${Math.round(mealNutrientValue(meal, 'protein_g'))} · C ${Math.round(
                        mealNutrientValue(meal, 'carbs_g'),
                      )} · G ${Math.round(mealNutrientValue(meal, 'fat_g'))} g`}
                    </span>
                  )}
                </span>
                <span className="flex w-16 shrink-0 flex-col items-end gap-0.5">
                  <b className="text-[15px] tabular-nums">
                    {all
                      ? formatNutrientAmount(value, '').trim()
                      : formatNutrientAmount(
                          value,
                          nutrient.unit === 'kcal' ? '' : nutrient.unit,
                        ).trim()}
                  </b>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {all ? 'kcal' : `${mealShareOfDay(value, nutrient.value)}%`}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <PlannedMealSlot suggestion={planned} />

      {empty.map((mealType) => {
        const label = MEAL_TYPE_LABEL[mealType];
        return (
          <button
            key={mealType}
            type="button"
            onClick={() => onAddMeal(mealType)}
            aria-label={`Registrar ${label}`}
            className="anim-press flex min-h-14 items-center gap-3 rounded-card px-4 py-2 text-left shadow-[inset_0_0_0_1.5px_hsl(var(--border-strong))]"
          >
            <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
              {MEAL_TYPICAL_TIME[mealType]}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="text-sm">{label}</b>
              <span className="truncate text-xs text-muted-foreground">
                {emptyMealHint(nutrient)}
              </span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-muted">
              <Icon name="plus" size={16} />
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onAddMeal(mealTypeForTime(new Date()))}
        className="anim-press flex h-12 items-center justify-center gap-2 rounded-pill bg-card text-sm font-bold text-foreground"
      >
        <Icon name="plus" size={16} />
        Adicionar lanche ou refeição
      </button>
    </section>
  );
}

/** A cor do nutriente na barrinha de cada refeição, como no cartão de cima. */
const SOURCE_COLOR: Record<string, string> = {
  kcal: 'bg-primary',
  protein_g: 'bg-protein',
  carbs_g: 'bg-carbs',
  fat_g: 'bg-fat',
  fiber_g: 'bg-water',
  sodium_mg: 'bg-steps',
  caffeine_mg: 'bg-muted-foreground',
};
/** Cada refeição um tom mais claro, como na prancha. */
const SOURCE_OPACITY = [1, 0.65, 0.4];

/**
 * Onde o lanche do plano ("Comi isso" / "Trocar") vai entrar quando a #376
 * trouxer o plano alimentar. Hoje não há plano: não desenha nada.
 */
export function PlannedMealSlot({ suggestion }: { suggestion: PlannedMealSuggestion | null }) {
  if (!suggestion) return null;
  return null;
}
