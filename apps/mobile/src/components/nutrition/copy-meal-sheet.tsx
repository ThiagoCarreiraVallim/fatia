import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  copyDayText,
  dayLabel,
  defaultCopyTarget,
  mealNutrientValue,
  nutritionApi,
  type Meal,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  Segmented,
} from '@/components/ui';
import { CopyToDay } from './copy-to-day';
import { hojeIso, mensagemDeErro } from './helpers';

type What = 'meal' | 'day';

/** "Só o café", "Só o almoço": o segmentado diz qual refeição. */
const SHORT_MEAL: Record<Meal['mealType'], string> = {
  BREAKFAST: 'café',
  LUNCH: 'almoço',
  SNACK: 'lanche',
  DINNER: 'jantar',
};

/** "4 itens · 373 kcal". */
function mealCopySummary(meal: Meal): string {
  const count = meal.items.length;
  const kcal = Math.round(mealNutrientValue(meal, 'kcal'));
  return `${count} ${count === 1 ? 'item' : 'itens'} · ${kcal} kcal`;
}

/**
 * Copiar (prancha Al-N9), espelho de
 * `apps/web/src/components/nutrition/copy-meal-sheet.tsx`: só esta refeição ou
 * o dia todo, para um dos próximos dias.
 */
export function CopyMealSheet({
  open,
  onOpenChange,
  meal,
  date,
  onSeeDay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meal: Meal;
  date: string;
  onSeeDay: (day: string) => void;
}) {
  const qc = useQueryClient();
  const today = hojeIso();
  const [what, setWhat] = useState<What>('meal');
  const [copied, setCopied] = useState<{ texto: string; dia: string } | null>(null);

  const copy = useMutation<string, Error, string>({
    mutationFn: async (toDate) => {
      if (what === 'meal') {
        await nutritionApi.copyMeal(meal.id, { toDate });
        return `Copiado para ${dayLabel(toDate, today)}`;
      }
      return copyDayText(await nutritionApi.copyDay({ fromDate: date, toDate }));
    },
    onSuccess: (texto, dia) => {
      setCopied({ texto, dia });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', dia] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', dia] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'history'] });
    },
  });

  const reset = (next: What) => {
    setWhat(next);
    setCopied(null);
    copy.reset();
  };
  const close = () => {
    reset('meal');
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-h2">Copiar</DrawerTitle>
        </DrawerHeader>
        <View className="gap-4 px-4 pb-6 pt-3">
          <Segmented
            label="O que copiar"
            options={[
              { value: 'meal', label: `Só o ${SHORT_MEAL[meal.mealType]}` },
              { value: 'day', label: 'O dia todo' },
            ]}
            value={what}
            onChange={reset}
          />
          <DrawerDescription>
            {what === 'meal'
              ? `${mealCopySummary(meal)}. Fica no mesmo horário.`
              : 'Todas as refeições do dia, cada uma no seu horário. O que já existir lá não duplica.'}
          </DrawerDescription>
          <CopyToDay
            key={`${meal.id}-${what}`}
            sourceDate={date}
            diaPadrao={defaultCopyTarget(date, today)}
            hoje={today}
            pendente={copy.isPending}
            erro={copy.error ? mensagemDeErro(copy.error) : null}
            feito={copied}
            onCopiar={(day) => copy.mutate(day)}
            onVer={(day) => {
              close();
              onSeeDay(day);
            }}
          />
        </View>
      </DrawerContent>
    </Drawer>
  );
}
