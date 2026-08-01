import { Alert, Pressable, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { nutritionApi, type Meal, type MealItem, type MealType } from '@fatia/api-client';
import { EmptyState, cn } from '@/components/ui';
import {
  NUMEROS_TABULARES,
  ROTULO_REFEICAO,
  TIPOS_DE_REFEICAO,
  formatarHora,
  mensagemDeErro,
  resumoDoItem,
} from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/meal-list.tsx`.
 *
 * É a listagem simples de refeições, sem o fio da timeline. A tela de nutrição
 * usa a `MealTimeline`; esta existe no PWA como alternativa e foi portada para
 * a paridade de componentes não ficar com buraco.
 *
 * Como na timeline, os drawers ficam a cargo de quem usa o componente — dentro
 * do `ScrollView` do `Screen` um bottom sheet rolaria junto com o conteúdo.
 */

export function MealList({
  meals,
  date,
  onAddItem,
  onEditItem,
}: {
  meals: Meal[];
  date: string;
  onAddItem: (mealId: string) => void;
  onEditItem: (item: MealItem) => void;
}) {
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

  // Mesma razão da timeline: apagar refeição é irreversível e o alvo é pequeno.
  const confirmarRemocao = (meal: Meal) =>
    Alert.alert(
      'Remover refeição',
      `${ROTULO_REFEICAO[meal.mealType]} e seus ${meal.items.length} item(ns) serão apagados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => removerRefeicao.mutate(meal.id) },
      ],
    );

  return (
    <View className="gap-3">
      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {mensagemDeErro(erro, { alternativa: 'Não foi possível remover. Tente de novo.' })}
        </Text>
      ) : null}

      {meals.length === 0 ? (
        <View className="rounded-md border border-dashed border-border">
          <EmptyState title="Nenhuma refeição registrada hoje." />
        </View>
      ) : (
        meals.map((meal) => (
          <View key={meal.id} className="rounded-lg border border-border bg-card p-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text accessibilityRole="header" className="font-medium text-foreground">
                  {ROTULO_REFEICAO[meal.mealType]}
                </Text>
                <Text className="text-xs text-muted-foreground">{formatarHora(meal.eatenAt)}</Text>
              </View>
              <View className="flex-row items-center">
                <AcaoDoIcone
                  label={`Adicionar item em ${ROTULO_REFEICAO[meal.mealType]}`}
                  onPress={() => onAddItem(meal.id)}
                >
                  <Plus size={16} color="#baccaf" />
                </AcaoDoIcone>
                <AcaoDoIcone
                  label={`Remover ${ROTULO_REFEICAO[meal.mealType]}`}
                  onPress={() => confirmarRemocao(meal)}
                >
                  <Trash2 size={16} color="#baccaf" />
                </AcaoDoIcone>
              </View>
            </View>

            <View className="mt-2">
              {meal.items.map((item, indice) => (
                <View
                  key={item.id}
                  className={cn(
                    'flex-row items-center justify-between py-2',
                    indice > 0 && 'border-t border-border',
                  )}
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-sm text-foreground">{item.foodName}</Text>
                    <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
                      {resumoDoItem(item)}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <AcaoDoIcone label={`Editar ${item.foodName}`} onPress={() => onEditItem(item)}>
                      <Pencil size={14} color="#baccaf" />
                    </AcaoDoIcone>
                    <AcaoDoIcone
                      label={`Remover ${item.foodName}`}
                      onPress={() => removerItem.mutate(item.id)}
                    >
                      <Trash2 size={14} color="#baccaf" />
                    </AcaoDoIcone>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

export function NewMealButton({ onPick }: { onPick: (mealType: MealType) => void }) {
  return (
    <View className="flex-row gap-2">
      {TIPOS_DE_REFEICAO.map((tipo) => (
        <Pressable
          key={tipo}
          accessibilityRole="button"
          accessibilityLabel={`Nova refeição: ${ROTULO_REFEICAO[tipo]}`}
          onPress={() => onPick(tipo)}
          className="min-h-[44px] flex-1 items-center justify-center rounded-md border border-border bg-card px-2 py-2 active:bg-accent"
        >
          <Text className="text-xs font-medium text-muted-foreground">
            + {ROTULO_REFEICAO[tipo].split(' ')[0]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

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
