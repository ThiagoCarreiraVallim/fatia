import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
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
import { Icon, Text, cn } from '@/components/ui';
import { TABULAR } from '@/components/today/parts';
import { colors } from '@/theme/colors';
import { ROTULO_REFEICAO, formatarHora } from './helpers';
import { nutrientColor } from './day-nutrients-card';

/**
 * "De onde veio" (prancha Al-N1), espelho de
 * `apps/web/src/components/nutrition/day-meal-sources.tsx`: cada refeição com
 * quanto trouxe do nutriente escolhido e o % do dia. O toque abre a refeição.
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
  nutrient: DayNutrient;
  date: string;
  onAddMeal: (type: MealType) => void;
  /** Lanche do plano alimentar (#376). Sem plano, nada aparece. */
  planned?: PlannedMealSuggestion | null;
  /** "Todos" no topo: calorias com os macros de cada refeição, sem o %. */
  all?: boolean;
}) {
  const router = useRouter();
  const timeline = buildMealTimeline(meals);
  const logged = timeline.flatMap((e) => (e.kind === 'meal' ? [e.meal] : []));
  const empty = timeline.flatMap((e) => (e.kind === 'empty' ? [e.mealType] : []));
  const color = all ? colors.primary : nutrientColor(nutrient.key);
  return (
    <View className="gap-4">
      <View className="mt-1 flex-row items-baseline justify-between px-1">
        <Text accessibilityRole="header" className="font-display-semibold text-h3">
          De onde veio
        </Text>
        <Text className="text-xs text-muted-foreground">
          {all ? 'kcal · macros' : `${nutrient.unit} · % do dia`}
        </Text>
      </View>

      {logged.length > 0 ? (
        <View className="rounded-card bg-card px-4">
          {logged.map((meal, i) => {
            const value = mealNutrientValue(meal, nutrient.key);
            const ai = mealHasAiItems(meal);
            const label = ROTULO_REFEICAO[meal.mealType];
            return (
              <Pressable
                key={meal.id}
                accessibilityRole="link"
                accessibilityLabel={`${label}, ${formatarHora(meal.eatenAt)}${
                  meal.hasPhoto ? ', com foto' : ai ? ', reconhecida pela IA' : ''
                }, ${formatNutrientAmount(value, nutrient.unit)}`}
                onPress={() => router.push(`/nutrition/meals/${meal.id}?date=${date}`)}
                className={cn(
                  'min-h-[72px] flex-row items-center gap-3 py-3',
                  i > 0 && 'border-t border-border',
                )}
              >
                <View
                  className="h-9 w-2.5 rounded-[3px]"
                  style={{
                    backgroundColor: color,
                    opacity: SOURCE_OPACITY[Math.min(i, SOURCE_OPACITY.length - 1)],
                  }}
                />
                <View className="min-w-0 flex-1 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="font-sans-bold text-sm">{label}</Text>
                    <Text style={TABULAR} className="text-xs text-muted-foreground">
                      {formatarHora(meal.eatenAt)}
                    </Text>
                    {meal.hasPhoto ? (
                      <Icon name="camera" size={16} color={colors.faintForeground} />
                    ) : ai ? (
                      <Icon name="spark" size={16} color={colors.faintForeground} />
                    ) : null}
                  </View>
                  <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {mealSummary(meal) || 'Sem itens'}
                  </Text>
                  {all && meal.items.length > 0 ? (
                    <Text style={TABULAR} className="text-xs text-foreground/70">
                      {`P ${Math.round(mealNutrientValue(meal, 'protein_g'))} · C ${Math.round(
                        mealNutrientValue(meal, 'carbs_g'),
                      )} · G ${Math.round(mealNutrientValue(meal, 'fat_g'))} g`}
                    </Text>
                  ) : null}
                </View>
                <View className="w-16 items-end gap-0.5">
                  <Text style={TABULAR} className="font-sans-bold text-[15px]">
                    {formatNutrientAmount(
                      value,
                      all || nutrient.unit === 'kcal' ? '' : nutrient.unit,
                    ).trim()}
                  </Text>
                  <Text style={TABULAR} className="text-xs text-muted-foreground">
                    {all ? 'kcal' : `${mealShareOfDay(value, nutrient.value)}%`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <PlannedMealSlot suggestion={planned} />

      {empty.map((mealType) => {
        const label = ROTULO_REFEICAO[mealType];
        return (
          <Pressable
            key={mealType}
            accessibilityRole="button"
            accessibilityLabel={`Registrar ${label}`}
            onPress={() => onAddMeal(mealType)}
            style={{ borderWidth: 1.5, borderColor: colors.borderStrong }}
            className="min-h-14 flex-row items-center gap-3 rounded-card px-4 py-2"
          >
            <Text style={TABULAR} className="w-10 text-xs text-muted-foreground">
              {MEAL_TYPICAL_TIME[mealType]}
            </Text>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-sans-bold text-sm">{label}</Text>
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                {emptyMealHint(nutrient)}
              </Text>
            </View>
            <View className="h-9 w-9 items-center justify-center rounded-field bg-muted">
              <Icon name="plus" size={16} />
            </View>
          </Pressable>
        );
      })}

      <Pressable
        accessibilityRole="button"
        onPress={() => onAddMeal(mealTypeForTime(new Date()))}
        className="h-12 flex-row items-center justify-center gap-2 rounded-pill bg-card"
      >
        <Icon name="plus" size={16} />
        <Text className="font-sans-bold text-sm">Adicionar lanche ou refeição</Text>
      </Pressable>
    </View>
  );
}

/** Cada refeição um tom mais claro, como na prancha. */
const SOURCE_OPACITY = [1, 0.65, 0.4];

/**
 * Onde o lanche do plano ("Comi isso" / "Trocar") entra quando a #376 trouxer o
 * plano alimentar. Sem plano não desenha nada.
 */
function PlannedMealSlot({ suggestion }: { suggestion: PlannedMealSuggestion | null }) {
  if (!suggestion) return null;
  return null;
}
