import { Alert, Pressable, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { nutritionApi, type Meal, type MealItem, type MealType } from '@fatia/api-client';
import { cn } from '@/components/ui';
import {
  EMOJI_REFEICAO,
  NUMEROS_TABULARES,
  ROTULO_REFEICAO,
  TIPOS_DE_REFEICAO,
  formatarHora,
  mensagemDeErro,
  resumoDoItem,
  totalKcal,
} from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/meal-timeline.tsx`.
 *
 * Duas diferenças deliberadas:
 *
 * - os drawers de busca e de edição não são renderizados aqui, como no PWA, e
 *   sim pela tela. Um bottom sheet se posiciona em relação ao pai; dentro do
 *   `ScrollView` do `Screen` ele rolaria junto com o conteúdo em vez de ficar
 *   preso à base da tela. Daí `onAddItem` e `onEditItem` como props.
 * - remover uma refeição pede confirmação. No PWA o clique apaga direto; num
 *   ícone ao alcance do polegar isso vira perda de registro por toque
 *   acidental, e a API não desfaz.
 */

interface Props {
  meals: Meal[];
  date: string;
  onAddMeal: (type: MealType) => void;
  onAddItem: (mealId: string) => void;
  onEditItem: (item: MealItem) => void;
}

export function MealTimeline({ meals, date, onAddMeal, onAddItem, onEditItem }: Props) {
  const qc = useQueryClient();

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'history', 7] });
  };

  const removerItem = useMutation({
    mutationFn: (id: string) => nutritionApi.deleteItem(id),
    onSuccess: invalidar,
  });
  const removerRefeicao = useMutation({
    mutationFn: (id: string) => nutritionApi.deleteMeal(id),
    onSuccess: invalidar,
  });

  const erro = removerItem.error ?? removerRefeicao.error;

  const registrados = new Set(meals.map((meal) => meal.mealType));
  const pendentes = TIPOS_DE_REFEICAO.filter((tipo) => !registrados.has(tipo));

  const confirmarRemocao = (meal: Meal) => {
    Alert.alert(
      'Remover refeição',
      `${ROTULO_REFEICAO[meal.mealType]} e seus ${meal.items.length} item(ns) serão apagados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => removerRefeicao.mutate(meal.id),
        },
      ],
    );
  };

  return (
    <View>
      <Text
        accessibilityRole="header"
        className="mb-4 text-[13px] font-bold uppercase tracking-wide text-muted-foreground"
      >
        Timeline de Hoje
      </Text>

      {erro ? (
        <Text accessibilityRole="alert" className="mb-3 text-sm text-destructive">
          {mensagemDeErro(erro, { alternativa: 'Não foi possível remover. Tente de novo.' })}
        </Text>
      ) : null}

      <View className="relative">
        {/* Fio que costura os marcadores da timeline, como no PWA. */}
        <View className="absolute bottom-0 left-[19px] top-0 w-px bg-border" />

        <View className="gap-3">
          {meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              onAddItem={() => onAddItem(meal.id)}
              onEditItem={onEditItem}
              onDeleteItem={(id) => removerItem.mutate(id)}
              onDeleteMeal={() => confirmarRemocao(meal)}
            />
          ))}

          {pendentes.map((tipo) => (
            <Pressable
              key={tipo}
              accessibilityRole="button"
              accessibilityLabel={`Registrar ${ROTULO_REFEICAO[tipo]}`}
              onPress={() => onAddMeal(tipo)}
              className="flex-row items-center gap-3"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-border bg-background">
                <Text className="text-base">{EMOJI_REFEICAO[tipo]}</Text>
              </View>
              <View className="flex-1 flex-row items-center justify-between rounded-xl border border-dashed border-border bg-card/50 px-4 py-3">
                <Text className="text-[13px] text-muted-foreground">{ROTULO_REFEICAO[tipo]}</Text>
                <Plus size={14} color="#baccaf" />
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
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
  const kcal = Math.round(totalKcal(meal.items));

  return (
    <View className="flex-row items-start gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-full border-2 border-primary bg-background">
        <Text className="text-base">{EMOJI_REFEICAO[meal.mealType]}</Text>
      </View>

      <View className="flex-1 overflow-hidden rounded-xl border border-border bg-card">
        <View className="flex-row items-center justify-between px-4 py-3">
          <View className="flex-1 flex-row items-baseline">
            <Text className="text-[14px] font-semibold text-foreground">
              {ROTULO_REFEICAO[meal.mealType]}
            </Text>
            <Text className="ml-2 text-[12px] text-muted-foreground">
              {formatarHora(meal.eatenAt)}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Text style={NUMEROS_TABULARES} className="text-[12px] font-bold text-muted-foreground">
              {kcal} kcal
            </Text>
            <AcaoDoIcone
              label={`Adicionar item em ${ROTULO_REFEICAO[meal.mealType]}`}
              onPress={onAddItem}
            >
              <Plus size={16} color="#baccaf" />
            </AcaoDoIcone>
            <AcaoDoIcone label={`Remover ${ROTULO_REFEICAO[meal.mealType]}`} onPress={onDeleteMeal}>
              <Trash2 size={16} color="#baccaf" />
            </AcaoDoIcone>
          </View>
        </View>

        {meal.items.length > 0 ? (
          <View className="border-t border-border">
            {meal.items.map((item, indice) => (
              <View
                key={item.id}
                className={cn(
                  'flex-row items-center justify-between px-4 py-2.5',
                  indice > 0 && 'border-t border-border',
                )}
              >
                <View className="flex-1 pr-2">
                  <Text className="text-[13px] text-foreground">{item.foodName}</Text>
                  <Text style={NUMEROS_TABULARES} className="text-[11px] text-muted-foreground">
                    {resumoDoItem(item)}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <AcaoDoIcone label={`Editar ${item.foodName}`} onPress={() => onEditItem(item)}>
                    <Pencil size={14} color="#baccaf" />
                  </AcaoDoIcone>
                  <AcaoDoIcone
                    label={`Remover ${item.foodName}`}
                    onPress={() => onDeleteItem(item.id)}
                  >
                    <Trash2 size={14} color="#baccaf" />
                  </AcaoDoIcone>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Ícone com alvo de toque de 44pt — o do PWA tem 24. */
function AcaoDoIcone({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
    >
      {children}
    </Pressable>
  );
}
