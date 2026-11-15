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
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Segmented,
} from '@/components/ui';
import { CopyToDay } from './copy-to-day';
import { hojeIso, mensagemDeErro } from './helpers';

type What = 'meal' | 'day';

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
          <DrawerTitle>Copiar</DrawerTitle>
          <DrawerDescription>
            {what === 'meal'
              ? `${mealCopySummary(meal)}. Fica no mesmo horário.`
              : 'Todas as refeições do dia, cada uma no seu horário. O que já existir lá não duplica.'}
          </DrawerDescription>
        </DrawerHeader>
        <View className="gap-3 px-4 py-3">
          <Segmented
            label="O que copiar"
            options={[
              { value: 'meal', label: 'Só a refeição' },
              { value: 'day', label: 'O dia todo' },
            ]}
            value={what}
            onChange={reset}
          />
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
        <DrawerFooter>
          <Button variant="ghost" onPress={close}>
            Fechar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
