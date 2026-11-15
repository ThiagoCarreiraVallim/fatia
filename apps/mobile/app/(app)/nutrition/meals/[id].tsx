import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  itemAmountText,
  mealHasAiItems,
  mealNutrientValue,
  nutritionApi,
  type MealDetail,
  type MealItem,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Screen } from '@/components/layout/screen';
import { ErrorState, Icon, LoadingState, Text, cn, useConfirm, useToast } from '@/components/ui';
import { Bar, TABULAR, todayCard, toneSoft } from '@/components/today/parts';
import { CopyMealSheet } from '@/components/nutrition/copy-meal-sheet';
import { EditMealItemDrawer } from '@/components/nutrition/edit-meal-item-drawer';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import {
  ROTULO_REFEICAO,
  formatarHora,
  hojeIso,
  mensagemDeErro,
} from '@/components/nutrition/helpers';
import { colors } from '@/theme/colors';

/** "e o item" / "e os 3 itens": a pergunta da exclusão. */
function itemsPhrase(count: number): string {
  return count === 1 ? 'e o item' : `e os ${count} itens`;
}

const mealKey = (id: string) => ['nutrition', 'meal', id] as const;

/**
 * A refeição aberta (pranchas Al-N8 e Al-N8b), espelho de
 * `apps/web/src/components/nutrition/meal-detail-screen.tsx`: a foto guardada
 * com o selo da IA, as contas, os itens (o toque edita, Al-N14), copiar (Al-N9),
 * salvar como refeição, "Apagar só a foto" e excluir, com confirmação.
 */
export default function MealScreen() {
  const { id, date: dateParam } = useLocalSearchParams<{ id: string; date?: string }>();
  const date = dateParam ?? hojeIso();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const query = useQuery({ queryKey: mealKey(id), queryFn: () => nutritionApi.meal(id) });

  const [editing, setEditing] = useState<MealItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [copying, setCopying] = useState(false);

  const invalidateDay = () => {
    void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'history'] });
  };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: mealKey(id) });
    invalidateDay();
  };

  const deletePhoto = useMutation({
    mutationFn: () => nutritionApi.deleteMealPhoto(id),
    onSuccess: (meal) => {
      qc.setQueryData<MealDetail>(mealKey(id), (old) =>
        old ? { ...old, ...meal, hasPhoto: false, photo: null } : old,
      );
      invalidateDay();
      toast.show({ message: 'Foto apagada · a refeição continua' });
    },
  });
  const deleteMeal = useMutation({
    mutationFn: () => nutritionApi.deleteMeal(id),
    onSuccess: () => {
      invalidateDay();
      router.back();
    },
  });
  const save = useMutation({
    mutationFn: (meal: MealDetail) =>
      nutritionApi.createMealTemplate({ name: ROTULO_REFEICAO[meal.mealType], mealId: meal.id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'meal-templates'] });
      toast.show({ message: 'Salva · aparece no topo ao adicionar' });
    },
  });

  const meal = query.data;
  const failure = deletePhoto.error ?? deleteMeal.error ?? save.error;

  return (
    <>
      <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
        {query.isLoading ? <LoadingState label="Carregando a refeição…" /> : null}
        {query.error ? (
          <View className="px-5 pt-4">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </View>
        ) : null}
        {meal ? (
          <MealBody
            meal={meal}
            onEdit={setEditing}
            onAdd={() => setAdding(true)}
            onCopy={() => setCopying(true)}
            saved={save.isSuccess}
            saving={save.isPending}
            onSave={() => save.mutate(meal)}
            onDeletePhoto={() =>
              confirm({
                title: 'Apagar a foto?',
                description: 'A refeição e os itens ficam. A foto não volta.',
                confirmLabel: 'Apagar a foto',
                destructive: true,
                onConfirm: () => deletePhoto.mutate(),
              })
            }
            onDeleteMeal={() =>
              confirm({
                title: `Excluir ${ROTULO_REFEICAO[meal.mealType]} ${itemsPhrase(meal.items.length)}?`,
                description: 'Não tem volta.',
                confirmLabel: 'Excluir',
                destructive: true,
                onConfirm: () => deleteMeal.mutate(),
              })
            }
            error={
              failure
                ? mensagemDeErro(failure, { alternativa: 'Não deu certo. Tente de novo.' })
                : null
            }
          />
        ) : null}
      </Screen>

      {meal ? (
        <>
          <EditMealItemDrawer
            item={editing}
            date={date}
            context={`${ROTULO_REFEICAO[meal.mealType]} · ${formatarHora(meal.eatenAt)}`}
            onClose={() => setEditing(null)}
            onChanged={refresh}
          />
          <FoodSearchDrawer
            open={adding}
            onOpenChange={(open) => {
              setAdding(open);
              if (!open) refresh();
            }}
            mealId={meal.id}
            date={date}
          />
          <CopyMealSheet
            open={copying}
            onOpenChange={setCopying}
            meal={meal}
            date={date}
            onSeeDay={() => router.navigate('/nutrition')}
          />
        </>
      ) : null}
    </>
  );
}

function MealBody({
  meal,
  onEdit,
  onAdd,
  onCopy,
  onSave,
  saved,
  saving,
  onDeletePhoto,
  onDeleteMeal,
  error,
}: {
  meal: MealDetail;
  onEdit: (item: MealItem) => void;
  onAdd: () => void;
  onCopy: () => void;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
  onDeletePhoto: () => void;
  onDeleteMeal: () => void;
  error: string | null;
}) {
  const name = ROTULO_REFEICAO[meal.mealType];
  const ai = mealHasAiItems(meal);
  const kcal = Math.round(mealNutrientValue(meal, 'kcal'));
  const macros = [
    { label: 'Proteína', key: 'protein_g', ref: 60, color: colors.protein },
    { label: 'Carbo', key: 'carbs_g', ref: 80, color: colors.carbs },
    { label: 'Gordura', key: 'fat_g', ref: 25, color: colors.fat },
  ];
  const micros = [
    ['Fibra', 'fiber_g', 'g'],
    ['Sódio', 'sodium_mg', 'mg'],
    ['Cafeína', 'caffeine_mg', 'mg'],
  ]
    .map(([label, key, unit]) => ({ label, unit, value: mealNutrientValue(meal, key) }))
    .filter((m) => m.value > 0);

  return (
    <View className="gap-4 pb-6">
      {meal.photo?.url ? (
        <View>
          <Image
            source={{ uri: meal.photo.url }}
            accessibilityLabel={`Foto do ${name}`}
            className="w-full"
            style={{ aspectRatio: 4 / 3 }}
            resizeMode="cover"
          />
          {ai ? (
            <View className="absolute bottom-3 left-5 flex-row items-center gap-1.5 rounded-pill bg-background px-3 py-1">
              <Icon name="spark" size={14} color={colors.primaryText} />
              <Text className="font-sans-semibold text-xs">Reconhecido pela IA</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View className="gap-4 px-5">
        <View className="flex-row items-baseline justify-between gap-3 pt-2">
          <Text accessibilityRole="header" className="font-display text-d3">
            {name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Icon name="clock" size={16} color={colors.mutedForeground} />
            <Text style={TABULAR} className="text-sm text-muted-foreground">
              {formatarHora(meal.eatenAt)}
            </Text>
          </View>
        </View>

        <View className={todayCard}>
          <View className="flex-row items-baseline gap-1.5">
            <Text style={TABULAR} className="font-display text-d3">
              {kcal}
            </Text>
            <Text className="text-sm text-muted-foreground">kcal</Text>
          </View>
          <View className="flex-row gap-3">
            {macros.map((m) => {
              const value = Math.round(mealNutrientValue(meal, m.key));
              return (
                <View key={m.key} className="flex-1 gap-1">
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-muted-foreground">{m.label}</Text>
                    <Text style={TABULAR} className="font-sans-bold text-xs">
                      {value} g
                    </Text>
                  </View>
                  <Bar percent={(value / m.ref) * 100} color={m.color} />
                </View>
              );
            })}
          </View>
          {micros.length > 0 ? (
            <Text className="text-xs text-muted-foreground">
              {micros.map((m) => `${m.label} ${Math.round(m.value)} ${m.unit}`).join(' · ')}
            </Text>
          ) : null}
        </View>

        {ai ? (
          <Text className="text-sm text-muted-foreground">
            {`${meal.hasPhoto ? 'A IA reconheceu os itens pela foto.' : 'A IA reconheceu os itens.'} Confira as porções: elas costumam errar 20–30%.`}
          </Text>
        ) : null}

        <View className="gap-2">
          <View className="flex-row items-baseline justify-between">
            <Text accessibilityRole="header" className="text-sm text-muted-foreground">
              O que você comeu
            </Text>
            <Text className="text-xs text-muted-foreground">
              {meal.items.length === 1 ? '1 item' : `${meal.items.length} itens`}
            </Text>
          </View>
          <View className="overflow-hidden rounded-card bg-card">
            {meal.items.map((item, i) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.foodName}${item.source === 'AI' ? ', da IA' : ''}, ${itemAmountText(item)}, ${Math.round(item.kcal)} kcal. Editar`}
                onPress={() => onEdit(item)}
                className={cn(
                  'min-h-14 flex-row items-center justify-between gap-3 px-4 py-3',
                  i > 0 && 'border-t border-border',
                )}
              >
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text numberOfLines={1} className="shrink">
                      {item.foodName}
                    </Text>
                    {item.source === 'AI' ? (
                      <View
                        className="rounded-pill px-1.5"
                        style={{ backgroundColor: toneSoft('lime') }}
                      >
                        <Text className="font-sans-bold text-[11px] text-primary">IA</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="text-xs text-muted-foreground">{itemAmountText(item)}</Text>
                </View>
                <Text style={TABULAR}>
                  {Math.round(item.kcal)}{' '}
                  <Text className="text-xs text-muted-foreground">kcal</Text>
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={onAdd}
              className={cn(
                'min-h-12 flex-row items-center gap-2 px-4',
                meal.items.length > 0 && 'border-t border-border',
              )}
            >
              <Icon name="plus" size={16} color={colors.primaryText} />
              <Text className="font-sans-semibold text-sm text-primary">Adicionar item</Text>
            </Pressable>
          </View>
        </View>

        <View className="overflow-hidden rounded-card bg-card">
          <ActionRow icon="layers" onPress={onCopy} chevron first>
            Copiar para outro dia
          </ActionRow>
          <ActionRow icon="star" onPress={onSave} disabled={saving || saved}>
            {saved ? 'Salva como refeição' : 'Salvar como refeição'}
          </ActionRow>
          {meal.hasPhoto ? (
            <ActionRow icon="image" onPress={onDeletePhoto}>
              Apagar só a foto
            </ActionRow>
          ) : null}
          <ActionRow icon="trash" onPress={onDeleteMeal} danger>
            Excluir refeição
          </ActionRow>
        </View>

        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  onPress,
  children,
  chevron = false,
  danger = false,
  disabled = false,
  first = false,
}: {
  icon: IconName;
  onPress: () => void;
  children: string;
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
  first?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-14 flex-row items-center gap-3 px-4',
        !first && 'border-t border-border',
        disabled && 'opacity-60',
      )}
    >
      <Icon name={icon} size={18} color={danger ? colors.destructive : colors.foreground} />
      <Text className={cn('flex-1', danger && 'text-destructive')}>{children}</Text>
      {chevron ? <Icon name="chevR" size={16} color={colors.mutedForeground} /> : null}
    </Pressable>
  );
}
