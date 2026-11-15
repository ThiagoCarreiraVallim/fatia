import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Repeat2 } from 'lucide-react-native';
import {
  acceptPlanText,
  initialsOf,
  nutritionPlanApi,
  optionTitle,
  planFoodLine,
  planFoodMacros,
  planKcalPerDay,
  planMacrosLine,
  planPortionText,
  planWeekText,
  swapCtaText,
  swapDiffText,
  swapToastText,
  swappedLine,
  type NutritionPlan,
  type PlanFood,
  type PlanItem,
  type PlanMeal,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import {
  Button,
  ConfirmDrawer,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  cn,
  useToast,
} from '@/components/ui';
import { NUMEROS_TABULARES, mensagemDeErro } from '@/components/nutrition/helpers';
import { colors } from '@/theme/colors';

/**
 * Plano alimentar do profissional (#376, pranchas Al-N5, N5b e N5c). Réplica de
 * `apps/web/src/app/(app)/nutrition/plan/page.tsx`: aceitar com confirmação,
 * "comi isso", trocar por um equivalente e desfazer.
 */

const PLAN_KEY = ['nutrition', 'plan'] as const;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export default function NutritionPlanScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: PLAN_KEY, queryFn: () => nutritionPlanApi.get() });
  const [showPending, setShowPending] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [swapping, setSwapping] = useState<{ item: PlanItem; mealName: string } | null>(null);
  const date = q.data?.date;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: PLAN_KEY });
    if (date) {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
    }
    void qc.invalidateQueries({ queryKey: ['nutrition', 'history'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const accept = useMutation({
    mutationFn: (planId: string) => nutritionPlanApi.accept(planId),
    onSuccess: (plan) => {
      setConfirmAccept(false);
      setShowPending(false);
      toast.show({ message: `Plano v${plan.version} em uso` });
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const undo = useMutation({
    mutationFn: (swapId: string) => nutritionPlanApi.undoSwap(swapId),
    onSuccess: (r) => {
      toast.show({ message: `Voltou para ${lower(r.restored)}` });
      refresh();
    },
    onError: (e) =>
      toast.show({
        message: mensagemDeErro(e, {
          alternativa: 'Não deu para desfazer a troca. Tente de novo.',
        }),
      }),
  });

  const swap = useMutation({
    mutationFn: (v: { item: PlanItem; equivalent: PlanFood }) =>
      nutritionPlanApi.swap({ itemId: v.item.id, equivalentId: v.equivalent.id, date }),
    onSuccess: (r) => {
      setSwapping(null);
      toast.show({
        message: swapToastText(r),
        action: { label: 'Desfazer', onPress: () => undo.mutate(r.swap.id) },
      });
      refresh();
    },
    onError: (e) =>
      toast.show({
        message: mensagemDeErro(e, { alternativa: 'Não deu para trocar. Tente de novo.' }),
      }),
  });

  const log = useMutation({
    mutationFn: (v: { meal: PlanMeal; optionId: string }) =>
      nutritionPlanApi.logMeal(v.meal.id, { optionId: v.optionId }),
    onSuccess: (_r, v) => {
      toast.show({ message: `${v.meal.name} registrado no diário` });
      refresh();
    },
    onError: (e) =>
      toast.show({
        message: mensagemDeErro(e, {
          conflito: 'Essa refeição do plano já foi registrada hoje.',
          alternativa: 'Não deu para registrar. Tente de novo.',
        }),
      }),
  });

  const data = q.data;
  const active = data?.active ?? null;
  const pending = data?.pending ?? null;
  const viewing = (showPending || !active ? pending : active) as NutritionPlan | null;
  const readOnly = viewing ? viewing.status !== 'ACCEPTED' : true;
  const authorName = viewing?.author?.name ?? null;

  return (
    <>
      <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        <View className="gap-5 px-5 pb-28 pt-2">
          {q.isLoading ? <LoadingState label="Carregando plano…" /> : null}
          {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
          {data && !active && !pending ? (
            <EmptyState
              title="Nenhum plano alimentar ainda"
              description="Quando o nutricionista ou o personal da sua comunidade mandar um plano, ele aparece aqui para você aceitar."
            />
          ) : null}

          {pending ? (
            <View
              className="gap-3 rounded-card bg-primary/10 p-4"
              style={{ borderWidth: 1.5, borderColor: `${colors.primary}59` }}
            >
              <Text className="text-sm font-bold text-foreground">
                {pending.author?.name ?? 'Seu profissional'} mandou o plano v{pending.version}
              </Text>
              {pending.note ? (
                <Text className="text-sm text-muted-foreground">{pending.note}</Text>
              ) : null}
              <Button size="lg" onPress={() => setConfirmAccept(true)}>
                {`Aceitar plano v${pending.version}`}
              </Button>
              {active ? (
                <Button size="lg" variant="outline" onPress={() => setShowPending((v) => !v)}>
                  {showPending ? 'Voltar ao plano em uso' : `Ver o plano v${pending.version}`}
                </Button>
              ) : null}
            </View>
          ) : null}

          {viewing && data ? (
            <View className="gap-3 overflow-hidden rounded-card bg-card p-5">
              {/* O verde de leve no cartão do plano, como na prancha. */}
              <View
                pointerEvents="none"
                className="absolute inset-0"
                style={{ backgroundColor: colors.primary, opacity: 0.07 }}
              />
              <View className="flex-row items-center gap-2">
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${colors.protein}66` }}
                >
                  <Text className="font-sans-extrabold text-[13px] text-foreground">
                    {initialsOf(authorName)}
                  </Text>
                </View>
                <Text className="text-[15px] text-foreground/80">
                  {authorName ?? 'Profissional'} · v{viewing.version}
                </Text>
                {readOnly ? (
                  <View className="ml-auto rounded-full bg-muted px-2 py-0.5">
                    <Text className="text-[11px] font-bold text-foreground">ainda não aceito</Text>
                  </View>
                ) : null}
              </View>
              <Text>
                <Text
                  style={[NUMEROS_TABULARES, { letterSpacing: -2 }]}
                  className="font-display text-[56px] leading-[60px] text-foreground"
                >
                  {planKcalPerDay(viewing.goals)}
                </Text>
                <Text className="text-[15px] text-foreground/80"> kcal/dia</Text>
              </Text>
              <View className="flex-row items-center justify-between">
                <Text style={NUMEROS_TABULARES} className="text-sm text-muted-foreground">
                  {planMacrosLine(viewing.goals)}
                </Text>
                {!readOnly ? (
                  <View className="rounded-pill bg-primary/15 px-3 py-1">
                    <Text
                      style={NUMEROS_TABULARES}
                      className="font-sans-extrabold text-[13px] uppercase tracking-[0.5px] text-primary"
                    >
                      {planWeekText(data.week)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {viewing?.meals.map((meal) => (
            <MealSection
              key={`${viewing.id}-${meal.id}`}
              meal={meal}
              readOnly={readOnly}
              logging={log.isPending && log.variables?.meal.id === meal.id}
              undoing={undo.isPending}
              onLog={(optionId) => log.mutate({ meal, optionId })}
              onSwap={(item) => setSwapping({ item, mealName: meal.name })}
              onUndo={(swapId) => undo.mutate(swapId)}
            />
          ))}
        </View>
      </Screen>

      <SwapDrawer
        item={swapping?.item ?? null}
        mealName={swapping?.mealName ?? ''}
        authorName={authorName}
        pending={swap.isPending}
        onClose={() => setSwapping(null)}
        onSwap={(equivalent) => swapping && swap.mutate({ item: swapping.item, equivalent })}
      />

      {pending ? (
        <ConfirmDrawer
          open={confirmAccept}
          onOpenChange={setConfirmAccept}
          title={`Aceitar o plano v${pending.version}?`}
          description={acceptPlanText(pending, active !== null)}
          confirmLabel="Aceitar"
          loading={accept.isPending}
          error={
            accept.error
              ? mensagemDeErro(accept.error, {
                  alternativa: 'Não deu para aceitar o plano. Tente de novo.',
                })
              : undefined
          }
          onConfirm={() => accept.mutate(pending.id)}
        />
      ) : null}
    </>
  );
}

function MealSection({
  meal,
  readOnly,
  logging,
  undoing,
  onLog,
  onSwap,
  onUndo,
}: {
  meal: PlanMeal;
  readOnly: boolean;
  logging: boolean;
  undoing: boolean;
  onLog: (optionId: string) => void;
  onSwap: (item: PlanItem) => void;
  onUndo: (swapId: string) => void;
}) {
  const single = meal.options.length === 1;
  const [chosen, setChosen] = useState<string | null>(
    meal.logged?.optionId ?? (single ? (meal.options[0]?.id ?? null) : null),
  );
  const option = meal.options.find((o) => o.id === chosen) ?? null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text
          accessibilityRole="header"
          className="font-display-semibold text-[22px] text-foreground"
        >
          {meal.name}
        </Text>
        {meal.logged ? (
          <View className="flex-row items-center gap-1 rounded-pill bg-primary/15 px-3 py-1">
            <Check size={14} color={colors.primaryText} />
            <Text className="font-sans-extrabold text-[13px] uppercase tracking-[0.5px] text-primary">
              feito
            </Text>
          </View>
        ) : !single ? (
          <Text className="text-sm text-muted-foreground">toque para escolher</Text>
        ) : null}
      </View>

      {!single ? (
        // As opções lado a lado, arrastando (prancha Al-N5).
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-5"
          contentContainerClassName="gap-2 px-5"
        >
          {meal.options.map((o) => {
            const on = o.id === chosen;
            const done = meal.logged?.optionId === o.id;
            const disabled = !!meal.logged && !done;
            return (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled }}
                disabled={disabled}
                onPress={() => setChosen(on ? null : o.id)}
                className={cn(
                  'min-h-24 w-[290px] rounded-card border-2 bg-card px-5 py-4',
                  on ? 'border-primary' : 'border-transparent',
                  disabled && 'opacity-50',
                )}
              >
                <Text className="text-sm text-muted-foreground">{optionTitle(o)}</Text>
                <Text className="mt-1.5 font-sans-semibold text-[17px] leading-6 text-foreground">
                  {o.items.map((i) => i.swap?.foodName ?? i.foodName).join(', ')}
                </Text>
                {done ? (
                  <View className="mt-1 flex-row items-center gap-1">
                    <Check size={12} color={colors.primaryText} />
                    <Text className="text-xs font-bold text-primary">comi isso</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {option ? (
        <View className="overflow-hidden rounded-card bg-card px-4">
          {option.items.map((item, i) => (
            <ItemRow
              key={item.id}
              item={item}
              divider={i > 0}
              readOnly={readOnly}
              undoing={undoing}
              onSwap={() => onSwap(item)}
              onUndo={onUndo}
            />
          ))}
        </View>
      ) : null}

      {!readOnly && option && !meal.logged ? (
        <Button
          size="lg"
          variant="secondary"
          className="rounded-pill bg-card"
          loading={logging}
          disabled={logging}
          onPress={() => onLog(option.id)}
        >
          Comi isso
        </Button>
      ) : null}
    </View>
  );
}

function ItemRow({
  item,
  divider,
  readOnly,
  undoing,
  onSwap,
  onUndo,
}: {
  item: PlanItem;
  divider: boolean;
  readOnly: boolean;
  undoing: boolean;
  onSwap: () => void;
  onUndo: (swapId: string) => void;
}) {
  const swap = item.swap;
  return (
    <View
      className={cn(
        'min-h-[72px] flex-row items-center gap-3 py-3',
        divider && 'border-t border-border',
      )}
    >
      <View className="flex-1">
        {swap ? (
          <View className="flex-row items-center gap-2">
            <Text className="text-[17px] text-foreground">{swap.foodName}</Text>
            <View className="rounded-full bg-primary/15 px-2 py-0.5">
              <Text className="text-[11px] font-bold text-primary">trocado</Text>
            </View>
          </View>
        ) : (
          <Text className="text-[17px] text-foreground">{item.foodName}</Text>
        )}
        <Text className="text-[15px] text-muted-foreground">
          {swap ? swappedLine(item) : planFoodLine(item)}
        </Text>
      </View>
      {swap ? (
        !readOnly ? (
          <Button
            size="lg"
            variant="secondary"
            className="h-12 rounded-field bg-muted px-4"
            disabled={undoing}
            accessibilityLabel={`Desfazer troca de ${lower(swap.foodName)}`}
            onPress={() => onUndo(swap.id)}
          >
            Desfazer
          </Button>
        ) : null
      ) : item.equivalents.length > 0 ? (
        !readOnly ? (
          <Button
            size="lg"
            variant="secondary"
            className="h-12 rounded-field bg-muted px-4"
            accessibilityLabel={`Trocar ${lower(item.foodName)}`}
            onPress={onSwap}
          >
            <Repeat2 size={18} color={colors.foreground} />
            <Text className="font-sans-semibold text-[15px] text-foreground">Trocar</Text>
          </Button>
        ) : null
      ) : (
        <Text className="text-[15px] text-muted-foreground">sem troca</Text>
      )}
    </View>
  );
}

/** Folha de troca (prancha Al-N5b): nada grava até o botão. */
function SwapDrawer({
  item,
  mealName,
  authorName,
  pending,
  onClose,
  onSwap,
}: {
  item: PlanItem | null;
  mealName: string;
  authorName: string | null;
  pending: boolean;
  onClose: () => void;
  onSwap: (equivalent: PlanFood) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [lastItem, setLastItem] = useState<string | null>(null);
  // Uma folha nova abre no que está no plano.
  if ((item?.id ?? null) !== lastItem) {
    setLastItem(item?.id ?? null);
    setPicked(null);
  }
  const equivalent = item?.equivalents.find((e) => e.id === picked) ?? null;
  const rows: Array<{ food: PlanFood; id: string | null }> = item
    ? [{ food: item, id: null }, ...item.equivalents.map((e) => ({ food: e, id: e.id }))]
    : [];

  return (
    <Drawer open={item !== null} onOpenChange={(open) => !open && onClose()} snapPoints={['80%']}>
      <DrawerContent>
        {item ? (
          <>
            <DrawerHeader>
              <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {mealName}
                {item.equivalenceGroup ? ` · ${item.equivalenceGroup}` : ''}
              </Text>
              <DrawerTitle>{`Trocar ${lower(item.foodName)}`}</DrawerTitle>
              <DrawerDescription>
                {authorName
                  ? `Opções que ${authorName.split(' ')[0]} deixou como equivalentes. A quantidade já vem ajustada.`
                  : 'Opções equivalentes do plano. A quantidade já vem ajustada.'}
              </DrawerDescription>
            </DrawerHeader>
            <DrawerScrollView>
              <View
                accessibilityRole="radiogroup"
                className="mx-4 overflow-hidden rounded-2xl bg-card"
              >
                {rows.map(({ food, id }, i) => {
                  const on = picked === id;
                  return (
                    <Pressable
                      key={id ?? 'plano'}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      onPress={() => setPicked(id)}
                      className={cn(
                        'min-h-16 flex-row items-center gap-3 px-4 py-3',
                        i > 0 && 'border-t border-border',
                      )}
                    >
                      <View
                        className={cn(
                          'h-5 w-5 rounded-full border-2',
                          on ? 'border-primary bg-primary' : 'border-border-strong',
                        )}
                      />
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-foreground">
                          {food.foodName}
                          {id === null ? (
                            <Text className="font-normal text-muted-foreground"> · no plano</Text>
                          ) : null}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {planPortionText(food)}
                          {food.portionLabel ? ` · ${food.grams} g` : ''}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text
                          style={NUMEROS_TABULARES}
                          className="text-sm font-bold text-foreground"
                        >
                          {Math.round(food.kcal)} kcal
                        </Text>
                        <Text
                          style={NUMEROS_TABULARES}
                          className="text-[11px] text-muted-foreground"
                        >
                          {planFoodMacros(food)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Text
                accessibilityLiveRegion="polite"
                className="mt-3 text-center text-sm text-muted-foreground"
              >
                {swapDiffText(item, equivalent)}
              </Text>
            </DrawerScrollView>
            <DrawerFooter>
              <Button
                size="xl"
                loading={pending}
                disabled={pending}
                onPress={() => (equivalent ? onSwap(equivalent) : onClose())}
              >
                {swapCtaText(item, equivalent)}
              </Button>
            </DrawerFooter>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
