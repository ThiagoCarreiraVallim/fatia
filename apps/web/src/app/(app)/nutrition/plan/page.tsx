'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Repeat2, Utensils } from 'lucide-react';
import {
  acceptPlanText,
  initialsOf,
  nutritionPlanApi,
  optionTitle,
  planFoodLine,
  planKcalPerDay,
  planMacrosLine,
  planWeekText,
  swapToastText,
  swappedLine,
  type NutritionPlan,
  type PlanFood,
  type PlanItem,
  type PlanMeal,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toastDuration } from '@/components/ui/toaster';
import { LoadError } from '@/components/nutrition/load-error';
import { errorMessage } from '@/components/nutrition/error-message';
import { PlanSwapDrawer } from '@/components/nutrition/plan-swap-drawer';
import { invalidateNutritionDay } from '@/lib/nutrition-cache';
import { cn } from '@/lib/utils';

const PLAN_KEY = ['nutrition', 'plan'] as const;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Plano alimentar do profissional (#376, pranchas Al-N5, N5b e N5c). O plano é
 * escrito pela equipe (ADR 045); aqui a pessoa aceita, marca "comi isso",
 * troca por um equivalente e desfaz.
 */
export default function NutritionPlanPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: PLAN_KEY, queryFn: () => nutritionPlanApi.get() });
  const [showPending, setShowPending] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [swapping, setSwapping] = useState<{ item: PlanItem; mealName: string } | null>(null);
  const date = q.data?.date;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: PLAN_KEY });
    if (date) invalidateNutritionDay(qc, date);
  };

  const accept = useMutation({
    mutationFn: (planId: string) => nutritionPlanApi.accept(planId),
    onSuccess: (plan) => {
      setConfirmAccept(false);
      setShowPending(false);
      toast(`Plano v${plan.version} em uso`);
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) =>
      toast.error(errorMessage(e, { fallback: 'Não deu para aceitar o plano. Tente de novo.' })),
  });

  const undo = useMutation({
    mutationFn: (swapId: string) => nutritionPlanApi.undoSwap(swapId),
    onSuccess: (r) => {
      toast(`Voltou para ${lower(r.restored)}`);
      refresh();
    },
    onError: (e) =>
      toast.error(errorMessage(e, { fallback: 'Não deu para desfazer a troca. Tente de novo.' })),
  });

  const swap = useMutation({
    mutationFn: (v: { item: PlanItem; equivalent: PlanFood }) =>
      nutritionPlanApi.swap({ itemId: v.item.id, equivalentId: v.equivalent.id, date }),
    onSuccess: (r) => {
      setSwapping(null);
      toast(swapToastText(r), {
        action: { label: 'Desfazer', onClick: () => undo.mutate(r.swap.id) },
        duration: toastDuration(true),
      });
      refresh();
    },
    onError: (e) =>
      toast.error(errorMessage(e, { fallback: 'Não deu para trocar. Tente de novo.' })),
  });

  const log = useMutation({
    mutationFn: (v: { meal: PlanMeal; optionId: string }) =>
      nutritionPlanApi.logMeal(v.meal.id, { optionId: v.optionId }),
    onSuccess: (_r, v) => {
      toast(`${v.meal.name} registrado no diário`);
      refresh();
    },
    onError: (e) =>
      toast.error(
        errorMessage(e, {
          conflict: 'Essa refeição do plano já foi registrada hoje.',
          fallback: 'Não deu para registrar. Tente de novo.',
        }),
      ),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="p-4">
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const { active, pending, week } = q.data;
  if (!active && !pending) {
    return (
      <div className="p-4">
        <EmptyState
          icon={Utensils}
          title="Nenhum plano alimentar ainda"
          description="Quando o nutricionista ou o personal da sua comunidade mandar um plano, ele aparece aqui para você aceitar."
        />
      </div>
    );
  }

  const viewing = (showPending || !active ? pending : active) as NutritionPlan;
  const readOnly = viewing.status !== 'ACCEPTED';
  const authorName = viewing.author?.name ?? null;

  return (
    <div className="space-y-5 p-4 pb-28">
      {pending && (
        <section
          aria-label="Plano novo"
          className="space-y-3 rounded-2xl border border-primary/40 bg-primary/10 p-4"
        >
          <p className="text-sm font-bold text-foreground">
            {pending.author?.name ?? 'Seu profissional'} mandou o plano v{pending.version}
          </p>
          {pending.note && <p className="text-sm text-muted-foreground">{pending.note}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => setConfirmAccept(true)}>
              Aceitar plano v{pending.version}
            </Button>
            {active && (
              <Button size="lg" variant="outline" onClick={() => setShowPending((v) => !v)}>
                {showPending ? 'Voltar ao plano em uso' : `Ver o plano v${pending.version}`}
              </Button>
            )}
          </div>
        </section>
      )}

      <header className="space-y-2 rounded-2xl bg-card p-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold"
          >
            {initialsOf(authorName)}
          </span>
          <span className="text-sm font-bold text-muted-foreground">
            {authorName ?? 'Profissional'} · v{viewing.version}
          </span>
          {readOnly && (
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold">
              ainda não aceito
            </span>
          )}
        </div>
        <p>
          <span className="font-display text-4xl font-bold tabular-nums">
            {planKcalPerDay(viewing.goals)}
          </span>
          <span className="text-sm text-muted-foreground"> kcal/dia</span>
        </p>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">{planMacrosLine(viewing.goals)}</span>
          {!readOnly && <span className="tabular-nums">{planWeekText(week)}</span>}
        </div>
      </header>

      {viewing.meals.map((meal) => (
        <MealSection
          key={meal.id}
          meal={meal}
          readOnly={readOnly}
          logging={log.isPending && log.variables?.meal.id === meal.id}
          undoing={undo.isPending}
          onLog={(optionId) => log.mutate({ meal, optionId })}
          onSwap={(item) => setSwapping({ item, mealName: meal.name })}
          onUndo={(swapId) => undo.mutate(swapId)}
        />
      ))}

      <PlanSwapDrawer
        item={swapping?.item ?? null}
        mealName={swapping?.mealName ?? ''}
        authorName={authorName}
        pending={swap.isPending}
        onOpenChange={(open) => !open && setSwapping(null)}
        onSwap={(equivalent) => swapping && swap.mutate({ item: swapping.item, equivalent })}
      />

      {pending && (
        <ConfirmSheet
          open={confirmAccept}
          onOpenChange={setConfirmAccept}
          title={`Aceitar o plano v${pending.version}?`}
          description={acceptPlanText(pending, active !== null)}
          icon="check"
          tone="default"
          confirmLabel="Aceitar"
          pendingLabel="Aceitando..."
          pending={accept.isPending}
          onConfirm={() => accept.mutate(pending.id)}
        />
      )}
    </div>
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
  const headingId = `plan-meal-${meal.id}`;
  const option = meal.options.find((o) => o.id === chosen) ?? null;

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 id={headingId} className="text-base font-bold">
          {meal.name}
        </h2>
        {meal.logged ? (
          <span className="flex items-center gap-1 text-xs font-bold text-primary">
            <Check size={14} aria-hidden />
            feito
          </span>
        ) : (
          !single && <span className="text-xs text-muted-foreground">toque para escolher</span>
        )}
      </div>

      {!single && (
        <div className="grid gap-2">
          {meal.options.map((o) => {
            const on = o.id === chosen;
            const done = meal.logged?.optionId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                disabled={!!meal.logged && !done}
                onClick={() => setChosen(on ? null : o.id)}
                className={cn(
                  'min-h-14 rounded-2xl bg-card px-4 py-3 text-left disabled:opacity-50',
                  on && 'ring-2 ring-inset ring-primary',
                )}
              >
                <span className="block text-xs font-bold text-muted-foreground">
                  {optionTitle(o)}
                </span>
                <span className="block text-sm font-bold">
                  {o.items.map((i) => i.swap?.foodName ?? i.foodName).join(', ')}
                </span>
                {done && (
                  <span className="mt-1 flex items-center gap-1 text-xs font-bold text-primary">
                    <Check size={12} aria-hidden />
                    comi isso
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {option && (
        <div className="divide-y divide-subtle overflow-hidden rounded-2xl bg-card">
          {option.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              readOnly={readOnly}
              undoing={undoing}
              onSwap={() => onSwap(item)}
              onUndo={onUndo}
            />
          ))}
        </div>
      )}

      {!readOnly && option && !meal.logged && (
        <Button
          size="lg"
          variant="secondary"
          full
          disabled={logging}
          onClick={() => onLog(option.id)}
        >
          <Check aria-hidden />
          {logging ? 'Registrando…' : 'Comi isso'}
        </Button>
      )}
    </section>
  );
}

function ItemRow({
  item,
  readOnly,
  undoing,
  onSwap,
  onUndo,
}: {
  item: PlanItem;
  readOnly: boolean;
  undoing: boolean;
  onSwap: () => void;
  onUndo: (swapId: string) => void;
}) {
  if (item.swap) {
    const swap = item.swap;
    return (
      <div className="flex min-h-16 items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold">{swap.foodName}</span>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
              trocado
            </span>
          </span>
          <span className="block text-xs text-muted-foreground">{swappedLine(item)}</span>
        </span>
        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            disabled={undoing}
            aria-label={`Desfazer troca de ${lower(swap.foodName)}`}
            onClick={() => onUndo(swap.id)}
          >
            Desfazer
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{item.foodName}</span>
        <span className="block text-xs text-muted-foreground">{planFoodLine(item)}</span>
      </span>
      {item.equivalents.length > 0 ? (
        !readOnly && (
          <Button
            size="sm"
            variant="outline"
            aria-label={`Trocar ${lower(item.foodName)}`}
            onClick={onSwap}
          >
            <Repeat2 aria-hidden />
            Trocar
          </Button>
        )
      ) : (
        <span className="text-xs text-muted-foreground">sem troca</span>
      )}
    </div>
  );
}
