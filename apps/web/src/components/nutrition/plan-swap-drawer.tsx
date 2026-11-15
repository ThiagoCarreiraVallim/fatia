'use client';

import { useState } from 'react';
import {
  planFoodMacros,
  planPortionText,
  swapCtaText,
  swapDiffText,
  type PlanFood,
  type PlanItem,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Folha de troca do plano (prancha Al-N5b): o item do plano e as equivalentes
 * que o profissional deixou, com a quantidade já ajustada e a diferença de kcal.
 * Nada grava até o botão; escolher o próprio item do plano só fecha.
 */
export function PlanSwapDrawer({
  item,
  mealName,
  authorName,
  pending,
  onOpenChange,
  onSwap,
}: {
  item: PlanItem | null;
  mealName: string;
  authorName: string | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSwap: (equivalent: PlanFood) => void;
}) {
  return (
    <Drawer open={item !== null} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        {item && (
          <SwapBody
            key={item.id}
            item={item}
            mealName={mealName}
            authorName={authorName}
            pending={pending}
            onKeep={() => onOpenChange(false)}
            onSwap={onSwap}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function SwapBody({
  item,
  mealName,
  authorName,
  pending,
  onKeep,
  onSwap,
}: {
  item: PlanItem;
  mealName: string;
  authorName: string | null;
  pending: boolean;
  onKeep: () => void;
  onSwap: (equivalent: PlanFood) => void;
}) {
  // Abre no que vale hoje: a troca ativa, se houver; senão o item do plano.
  const [picked, setPicked] = useState<string | null>(item.swap?.equivalentId ?? null);
  const equivalent = item.equivalents.find((e) => e.id === picked) ?? null;
  const rows: Array<{ food: PlanFood; id: string | null }> = [
    { food: item, id: null },
    ...item.equivalents.map((e) => ({ food: e, id: e.id })),
  ];

  return (
    <>
      <DrawerHeader className="px-0 text-left">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {mealName}
          {item.equivalenceGroup ? ` · ${item.equivalenceGroup}` : ''}
        </p>
        <DrawerTitle className="font-display text-xl font-bold">
          Trocar {lower(item.foodName)}
        </DrawerTitle>
        <DrawerDescription>
          {authorName
            ? `Opções que ${authorName.split(' ')[0]} deixou como equivalentes. A quantidade já vem ajustada.`
            : 'Opções equivalentes do plano. A quantidade já vem ajustada.'}
        </DrawerDescription>
      </DrawerHeader>

      <div
        role="radiogroup"
        aria-label="Equivalentes"
        className="divide-y divide-subtle overflow-hidden rounded-2xl bg-card"
      >
        {rows.map(({ food, id }) => {
          const on = picked === id;
          return (
            <button
              key={id ?? 'plano'}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(id)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span
                aria-hidden
                className={cn(
                  'h-5 w-5 shrink-0 rounded-full border-2',
                  on
                    ? 'border-primary bg-primary ring-2 ring-inset ring-background'
                    : 'border-border-strong',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground">
                  {food.foodName}
                  {id === null && (
                    <span className="font-normal text-muted-foreground"> · no plano</span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {planPortionText(food)}
                  {food.portionLabel ? ` · ${food.grams} g` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-bold tabular-nums">
                  {Math.round(food.kcal)} kcal
                </span>
                <span className="block text-[11px] text-muted-foreground tabular-nums">
                  {planFoodMacros(food)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-center text-sm text-muted-foreground" aria-live="polite">
        {swapDiffText(item, equivalent)}
      </p>

      <DrawerFooter className="px-0">
        <Button
          size="xl"
          full
          disabled={pending}
          onClick={() => (equivalent ? onSwap(equivalent) : onKeep())}
        >
          {pending ? 'Trocando…' : swapCtaText(item, equivalent)}
        </Button>
      </DrawerFooter>
    </>
  );
}
