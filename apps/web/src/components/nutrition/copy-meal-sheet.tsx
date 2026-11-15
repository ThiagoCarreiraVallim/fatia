'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  copyDayText,
  dayLabel,
  defaultCopyTarget,
  nutritionApi,
  mealNutrientValue,
  type Meal,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { CopyToDay } from './copy-to-day';

type What = 'meal' | 'day';

/** "4 itens · 373 kcal". */
function mealCopySummary(meal: Meal): string {
  const count = meal.items.length;
  const kcal = Math.round(mealNutrientValue(meal, 'kcal'));
  return `${count} ${count === 1 ? 'item' : 'itens'} · ${kcal} kcal`;
}

/**
 * Copiar (prancha Al-N9): só esta refeição ou o dia todo, para um dos próximos
 * dias. Depois de copiar a pessoa fica aqui e ganha o "Ver" do destino.
 */
export function CopyMealSheet({
  open,
  onOpenChange,
  meal,
  date,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meal: Meal;
  /** O dia da refeição (`yyyy-MM-dd`). */
  date: string;
  today: string;
}) {
  const qc = useQueryClient();
  const [what, setWhat] = useState<What>('meal');
  const [copied, setCopied] = useState<{ text: string; target: string } | null>(null);

  const copy = useMutation<string, Error, string>({
    mutationFn: async (toDate) => {
      if (what === 'meal') {
        await nutritionApi.copyMeal(meal.id, { toDate });
        return `Copiado para ${dayLabel(toDate, today)}`;
      }
      return copyDayText(await nutritionApi.copyDay({ fromDate: date, toDate }));
    },
    onSuccess: (text, toDate) => {
      setCopied({ text, target: toDate });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', toDate] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', toDate] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'history'] });
    },
  });

  const reset = (next: What) => {
    setWhat(next);
    setCopied(null);
    copy.reset();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) reset('meal');
        onOpenChange(next);
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Copiar</DrawerTitle>
          <DrawerDescription>
            {what === 'meal'
              ? `${mealCopySummary(meal)}. Fica no mesmo horário.`
              : 'Todas as refeições do dia, cada uma no seu horário. O que já existir lá não duplica.'}
          </DrawerDescription>
        </DrawerHeader>
        <Segmented
          label="O que copiar"
          options={[
            { value: 'meal', label: 'Só a refeição' },
            { value: 'day', label: 'O dia todo' },
          ]}
          value={what}
          onChange={reset}
          className="mb-3"
        />
        {open && (
          <CopyToDay
            key={`${meal.id}-${what}`}
            inputId="copy-meal-date"
            sourceDate={date}
            defaultTarget={defaultCopyTarget(date, today)}
            today={today}
            pending={copy.isPending}
            error={copy.error?.message ?? null}
            done={copied}
            onCopy={(toDate) => copy.mutate(toDate)}
            onNavigate={() => onOpenChange(false)}
          />
        )}
        <DrawerClose asChild>
          <Button variant="ghost" className="mt-4 w-full">
            Fechar
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}
