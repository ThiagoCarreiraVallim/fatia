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
} from '@fatia/api-client';
import { Icon, Text } from '@/components/ui';
import { TABULAR } from '@/components/today/parts';
import { colors } from '@/theme/colors';
import { ROTULO_REFEICAO, formatarHora } from './helpers';

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
}: {
  meals: Meal[];
  nutrient: DayNutrient;
  date: string;
  onAddMeal: (type: MealType) => void;
  /** Lanche do plano alimentar (#376). Sem plano, nada aparece. */
  planned?: PlannedMealSuggestion | null;
}) {
  const router = useRouter();
  const isKcal = nutrient.key === 'kcal';
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between">
        <Text accessibilityRole="header" className="font-display-semibold text-lg">
          De onde veio
        </Text>
        <Text className="text-xs text-muted-foreground">{nutrient.unit}</Text>
      </View>

      {buildMealTimeline(meals).map((entry) => {
        if (entry.kind === 'empty') {
          const label = ROTULO_REFEICAO[entry.mealType];
          return (
            <Pressable
              key={entry.mealType}
              accessibilityRole="button"
              accessibilityLabel={`Registrar ${label}`}
              onPress={() => onAddMeal(entry.mealType)}
              className="min-h-14 flex-row items-center gap-3 rounded-card border border-dashed border-border px-4 py-3"
            >
              <Text className="flex-1 font-sans-semibold text-muted-foreground">{label}</Text>
              <View className="h-9 w-9 items-center justify-center rounded-pill bg-muted">
                <Icon name="plus" size={16} />
              </View>
            </Pressable>
          );
        }
        const meal = entry.meal;
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
            className="min-h-14 flex-row items-center gap-3 rounded-card bg-card px-4 py-3"
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <View className="flex-row items-center gap-1.5">
                <Text className="font-sans-bold text-[15px]">{label}</Text>
                <Text style={TABULAR} className="text-xs text-muted-foreground">
                  {formatarHora(meal.eatenAt)}
                </Text>
                {meal.hasPhoto ? (
                  <Icon name="camera" size={16} color={colors.mutedForeground} />
                ) : ai ? (
                  <Icon name="spark" size={16} color={colors.primaryText} />
                ) : null}
              </View>
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                {mealSummary(meal) || 'Sem itens'}
              </Text>
              {isKcal && meal.items.length > 0 ? (
                <Text style={TABULAR} className="text-[11px] text-muted-foreground">
                  {`P ${Math.round(mealNutrientValue(meal, 'protein_g'))} · C ${Math.round(
                    mealNutrientValue(meal, 'carbs_g'),
                  )} · G ${Math.round(mealNutrientValue(meal, 'fat_g'))}`}
                </Text>
              ) : null}
            </View>
            <View className="items-end">
              <Text style={TABULAR} className="font-sans-bold">
                {formatNutrientAmount(value, nutrient.unit)}
              </Text>
              <Text style={TABULAR} className="text-xs text-muted-foreground">
                {`${mealShareOfDay(value, nutrient.value)}%`}
              </Text>
            </View>
          </Pressable>
        );
      })}

      <PlannedMealSlot suggestion={planned} />

      <Pressable
        accessibilityRole="button"
        onPress={() => onAddMeal(mealTypeForTime(new Date()))}
        className="min-h-12 flex-row items-center justify-center gap-2"
      >
        <Icon name="plus" size={16} color={colors.primaryText} />
        <Text className="font-sans-semibold text-sm text-primary">
          Adicionar lanche ou refeição
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Onde o lanche do plano ("Comi isso" / "Trocar") entra quando a #376 trouxer o
 * plano alimentar. Sem plano não desenha nada.
 */
function PlannedMealSlot({ suggestion }: { suggestion: PlannedMealSuggestion | null }) {
  if (!suggestion) return null;
  return null;
}
