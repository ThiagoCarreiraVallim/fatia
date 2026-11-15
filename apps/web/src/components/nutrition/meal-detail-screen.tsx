'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  itemAmountText,
  mealHasAiItems,
  mealNutrientValue,
  nutritionApi,
  type MealDetail,
  type MealItem,
} from '@fatia/api-client';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Bar, todayCard } from '@/components/today/parts';
import { invalidateNutritionDay } from '@/lib/nutrition-cache';
import { cn } from '@/lib/utils';
import { CopyMealSheet } from './copy-meal-sheet';
import { EditMealItemDrawer } from './edit-meal-item-drawer';
import { errorMessage } from './error-message';
import { FoodSearchDrawer } from './food-search-drawer';
import { LoadError } from './load-error';
import { MEAL_TYPE_LABEL } from './meal-labels';

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "e o item" / "e os 3 itens": a pergunta da exclusão. */
function itemsPhrase(count: number): string {
  return count === 1 ? 'e o item' : `e os ${count} itens`;
}

export const mealDetailKey = (id: string) => ['nutrition', 'meal', id] as const;

/**
 * A refeição aberta (pranchas Al-N8 e Al-N8b): a foto guardada, quando há, com
 * o selo da IA; as contas; os itens (o toque edita, Al-N14); copiar (Al-N9),
 * salvar como refeição, "Apagar só a foto" e excluir, os dois últimos com
 * confirmação.
 */
export function MealDetailScreen({ id, date }: { id: string; date: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const query = useQuery({ queryKey: mealDetailKey(id), queryFn: () => nutritionApi.meal(id) });

  const [editing, setEditing] = useState<MealItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirm, setConfirm] = useState<'photo' | 'meal' | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: mealDetailKey(id) });
    invalidateNutritionDay(qc, date);
  };

  const deletePhoto = useMutation({
    mutationFn: () => nutritionApi.deleteMealPhoto(id),
    onSuccess: (meal) => {
      setConfirm(null);
      qc.setQueryData<MealDetail>(mealDetailKey(id), (old) =>
        old ? { ...old, ...meal, hasPhoto: false, photo: null } : old,
      );
      invalidateNutritionDay(qc, date);
      toast('Foto apagada · a refeição continua');
    },
    onError: () => setConfirm(null),
  });
  const deleteMeal = useMutation({
    mutationFn: () => nutritionApi.deleteMeal(id),
    onSuccess: () => {
      setConfirm(null);
      invalidateNutritionDay(qc, date);
      router.push(`/nutrition?date=${date}`);
    },
    onError: () => setConfirm(null),
  });
  const save = useMutation({
    mutationFn: (meal: MealDetail) =>
      nutritionApi.createMealTemplate({ name: MEAL_TYPE_LABEL[meal.mealType], mealId: meal.id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'meal-templates'] });
      toast('Salva · aparece no topo ao adicionar');
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4 px-5 pt-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-60" />
      </div>
    );
  }
  if (query.error || !query.data) {
    return (
      <div className="px-5 pt-4">
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const meal = query.data;
  const name = MEAL_TYPE_LABEL[meal.mealType];
  const ai = mealHasAiItems(meal);
  const kcal = Math.round(mealNutrientValue(meal, 'kcal'));
  const macros = [
    { label: 'Proteína', key: 'protein_g', ref: 60, color: 'bg-protein' },
    { label: 'Carbo', key: 'carbs_g', ref: 80, color: 'bg-carbs' },
    { label: 'Gordura', key: 'fat_g', ref: 25, color: 'bg-fat' },
  ];
  const micros = [
    ['Fibra', 'fiber_g', 'g'],
    ['Sódio', 'sodium_mg', 'mg'],
    ['Cafeína', 'caffeine_mg', 'mg'],
  ]
    .map(([label, key, unit]) => ({ label, unit, value: mealNutrientValue(meal, key) }))
    .filter((m) => m.value > 0);
  const error = deletePhoto.error ?? deleteMeal.error ?? save.error;

  return (
    <div className="space-y-4 pb-6">
      {meal.photo?.url && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador */}
          <img
            src={meal.photo.url}
            alt={`Foto do ${name}`}
            width={meal.photo.width ?? undefined}
            height={meal.photo.height ?? undefined}
            className="aspect-[4/3] w-full object-cover"
          />
          {ai && (
            <span className="absolute bottom-3 left-5 inline-flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1 text-xs font-semibold">
              <Icon name="spark" size={14} className="text-primary" />
              Reconhecido pela IA
            </span>
          )}
        </div>
      )}

      <div className="space-y-4 px-5">
        <div className="flex items-baseline justify-between gap-3 pt-2">
          <h1 className="font-display text-2xl font-bold">{name}</h1>
          <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
            <Icon name="clock" size={16} />
            {clock(meal.eatenAt)}
          </span>
        </div>

        <div className={todayCard}>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-4xl font-bold tabular-nums">{kcal}</span>
            <span className="text-sm text-muted-foreground">kcal</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {macros.map((m, i) => {
              const value = Math.round(mealNutrientValue(meal, m.key));
              return (
                <div key={m.key} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{m.label}</span>
                    <b className="tabular-nums">{value} g</b>
                  </div>
                  <Bar percent={(value / m.ref) * 100} color={m.color} index={i} />
                </div>
              );
            })}
          </div>
          {micros.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {micros.map((m) => `${m.label} ${Math.round(m.value)} ${m.unit}`).join(' · ')}
            </p>
          )}
        </div>

        {ai && (
          <p className="text-sm text-muted-foreground">
            {meal.hasPhoto ? 'A IA reconheceu os itens pela foto.' : 'A IA reconheceu os itens.'}{' '}
            Confira as porções: elas costumam errar 20–30%.
          </p>
        )}

        <section className="space-y-2" aria-labelledby="meal-items-title">
          <div className="flex items-baseline justify-between">
            <h2
              id="meal-items-title"
              className="font-sans text-[13px] font-normal text-muted-foreground"
            >
              O que você comeu
            </h2>
            <span className="text-xs text-muted-foreground">
              {meal.items.length === 1 ? '1 item' : `${meal.items.length} itens`}
            </span>
          </div>
          <div className="overflow-hidden rounded-card bg-card">
            {meal.items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEditing(item)}
                className={cn(
                  'flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left',
                  i > 0 && 'border-t border-subtle',
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{item.foodName}</span>
                    {item.source === 'AI' && (
                      <span className="rounded-full bg-primary-soft px-1.5 text-[11px] font-bold text-primary">
                        IA
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{itemAmountText(item)}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {Math.round(item.kcal)}{' '}
                  <span className="text-xs text-muted-foreground">kcal</span>
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={cn(
                'flex min-h-12 w-full items-center gap-2 px-4 text-sm font-semibold text-primary',
                meal.items.length > 0 && 'border-t border-subtle',
              )}
            >
              <Icon name="plus" size={16} />
              Adicionar item
            </button>
          </div>
        </section>

        <div className="overflow-hidden rounded-card bg-card">
          <ActionRow icon="layers" onClick={() => setCopying(true)} chevron>
            Copiar para outro dia
          </ActionRow>
          <ActionRow
            icon="star"
            onClick={() => save.mutate(meal)}
            disabled={save.isPending || save.isSuccess}
          >
            {save.isSuccess ? 'Salva como refeição' : 'Salvar como refeição'}
          </ActionRow>
          {meal.hasPhoto && (
            <ActionRow icon="image" onClick={() => setConfirm('photo')}>
              Apagar só a foto
            </ActionRow>
          )}
          <ActionRow icon="trash" onClick={() => setConfirm('meal')} danger>
            Excluir refeição
          </ActionRow>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(error, { fallback: 'Não deu certo. Tente de novo.' })}
          </p>
        )}
      </div>

      <EditMealItemDrawer
        item={editing}
        date={date}
        context={`${name} · ${clock(meal.eatenAt)}`}
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
        today={todayIso()}
      />
      <ConfirmSheet
        open={confirm === 'photo'}
        onOpenChange={(open) => !open && setConfirm(null)}
        icon="image"
        title="Apagar a foto?"
        description="A refeição e os itens ficam. A foto não volta."
        confirmLabel="Apagar a foto"
        pending={deletePhoto.isPending}
        onConfirm={() => deletePhoto.mutate()}
      />
      <ConfirmSheet
        open={confirm === 'meal'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Excluir ${name} ${itemsPhrase(meal.items.length)}?`}
        description="Não tem volta."
        confirmLabel="Excluir"
        pendingLabel="Excluindo..."
        pending={deleteMeal.isPending}
        onConfirm={() => deleteMeal.mutate()}
      />
    </div>
  );
}

function ActionRow({
  icon,
  onClick,
  children,
  chevron = false,
  danger = false,
  disabled = false,
}: {
  icon: 'layers' | 'star' | 'image' | 'trash';
  onClick: () => void;
  children: string;
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 border-t border-subtle px-4 text-left first:border-t-0 disabled:opacity-60',
        danger && 'text-danger',
      )}
    >
      <Icon name={icon} size={18} />
      <span className="flex-1">{children}</span>
      {chevron && <Icon name="chevR" size={16} className="text-muted-foreground" />}
    </button>
  );
}
