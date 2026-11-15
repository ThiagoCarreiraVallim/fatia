import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import {
  customFoodSummary,
  filterMyFoods,
  MY_FOODS_HINT,
  myFoodsEmptySearch,
  myFoodsTabs,
  nutritionApi,
  templateSummary,
  type Food,
  type MealTemplate,
  type MyFoodsTab,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, ErrorState, Input, LoadingState, Segmented, useConfirm } from '@/components/ui';
import { CustomFoodDrawer } from '@/components/nutrition/custom-food-drawer';
import { colors } from '@/theme/colors';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';

/**
 * Réplica de `apps/web/src/app/(app)/nutrition/foods/page.tsx` (Al-N12): os
 * alimentos próprios e as refeições salvas, com busca e abas, sem "Lidos"
 * (ADR 017).
 *
 * `?novo=1` abre o cadastro: chega do card vazio. O drawer é irmão do
 * `Screen`, como nas outras telas de nutrição.
 */

/** `null` = fechado; `'novo'` = cadastro; alimento = edição. */
type Editing = Food | 'novo' | null;

export default function CustomFoodsScreen() {
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { novo } = useLocalSearchParams<{ novo?: string }>();
  const [editing, setEditing] = useState<Editing>(novo ? 'novo' : null);
  const [tab, setTab] = useState<MyFoodsTab>('all');
  const [q, setQ] = useState('');
  const foods = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
  });
  const templates = useQuery({
    queryKey: ['nutrition', 'meal-templates'],
    queryFn: () => nutritionApi.mealTemplates(),
  });
  const removeTemplate = useMutation<void, Error, string>({
    mutationFn: (id) => nutritionApi.deleteMealTemplate(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['nutrition', 'meal-templates'] }),
  });

  const close = (open: boolean) => {
    if (open) return;
    setEditing(null);
    if (novo) router.setParams({ novo: undefined });
  };

  const confirmRemoveTemplate = (template: MealTemplate) =>
    confirm({
      title: `Apagar "${template.name}"?`,
      description: 'Some dos atalhos. As refeições já registradas continuam como estão.',
      confirmLabel: 'Apagar',
      destructive: true,
      onConfirm: () => removeTemplate.mutate(template.id),
    });

  const shown = filterMyFoods(foods.data ?? [], templates.data ?? [], tab, q);
  const nothingSaved =
    foods.data?.length === 0 && (templates.data?.length ?? 0) === 0 && !templates.isLoading;
  const nothingShown =
    !!foods.data && !nothingSaved && shown.foods.length + shown.meals.length === 0;

  return (
    <>
      <Screen
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Novo alimento"
            onPress={() => setEditing('novo')}
            className={TOP_BAR_ACTION}
          >
            <Plus size={22} color={colors.primaryText} />
          </Pressable>
        }
        onRefresh={() => {
          void foods.refetch();
          void templates.refetch();
        }}
        refreshing={foods.isRefetching}
      >
        <View className="gap-4 p-4">
          <Text className="text-sm text-muted-foreground">
            {`${MY_FOODS_HINT} Cadastre uma vez e registre como qualquer alimento.`}
          </Text>

          <Input
            accessibilityLabel="Buscar em Meus alimentos"
            value={q}
            onChangeText={setQ}
            placeholder="Buscar nos seus"
          />
          <Segmented
            label="O que mostrar"
            options={myFoodsTabs().map(({ key, label }) => ({ value: key, label }))}
            value={tab}
            onChange={setTab}
          />

          {foods.isLoading ? <LoadingState label="Carregando seus alimentos…" /> : null}
          {foods.error ? (
            <ErrorState error={foods.error} onRetry={() => void foods.refetch()} />
          ) : null}
          {nothingSaved ? (
            <Text className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Nenhum alimento cadastrado ainda.
            </Text>
          ) : null}
          {nothingShown ? (
            <View className="gap-2 rounded-xl bg-card p-4">
              <Text className="text-sm text-foreground">
                {q.trim() ? myFoodsEmptySearch(q) : 'Nada nesta aba ainda.'}
              </Text>
              <Button variant="outline" onPress={() => setEditing('novo')}>
                Cadastrar alimento
              </Button>
            </View>
          ) : null}
          {shown.foods.length > 0 ? (
            <View className="rounded-xl border border-border bg-card">
              {shown.foods.map((food, i) => (
                <Pressable
                  key={food.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${food.name}`}
                  onPress={() => setEditing(food)}
                  className={`min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-accent ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                      {food.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{customFoodSummary(food)}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {shown.meals.length > 0 ? (
            <View className="gap-2">
              <Text className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Refeições salvas
              </Text>
              <View className="rounded-xl border border-border bg-card">
                {shown.meals.map((template, i) => (
                  <View
                    key={template.id}
                    className={`min-h-14 flex-row items-center gap-3 pl-4 ${
                      i > 0 ? 'border-t border-border' : ''
                    }`}
                  >
                    <View className="flex-1 py-3">
                      <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                        {template.name}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {templateSummary(template)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Apagar ${template.name}`}
                      onPress={() => confirmRemoveTemplate(template)}
                      className="h-12 w-12 items-center justify-center"
                    >
                      <Trash2 size={16} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Screen>

      <CustomFoodDrawer
        open={editing !== null}
        onOpenChange={close}
        food={editing === 'novo' ? null : editing}
      />
    </>
  );
}
