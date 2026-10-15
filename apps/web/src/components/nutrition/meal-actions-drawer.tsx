'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import {
  dayLabel,
  defaultCopyTarget,
  nutritionApi,
  type Meal,
  type MealTemplate,
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
import { Input } from '@/components/ui/input';
import { CopyToDay } from './copy-to-day';
import { MEAL_TYPE_LABEL } from './meal-labels';

interface Props {
  meal: Meal | null;
  date: string;
  today: string;
  onClose: () => void;
}

/** O que dá para fazer com uma refeição inteira: copiar para outro dia ou salvar. */
export function MealActionsDrawer({ meal, date, today, onClose }: Props) {
  return (
    <Drawer open={meal !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="px-4 pb-6">
        {/* `key`: outra refeição começa com o formulário limpo. */}
        {meal && <Actions key={meal.id} meal={meal} date={date} today={today} onClose={onClose} />}
      </DrawerContent>
    </Drawer>
  );
}

function Actions({ meal, date, today, onClose }: Props & { meal: Meal }) {
  const qc = useQueryClient();
  const label = MEAL_TYPE_LABEL[meal.mealType];
  const time = new Date(meal.eatenAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // A última cópia feita fica à vista mesmo se a próxima tentativa falhar.
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useMutation<Meal, Error, string>({
    mutationFn: (toDate) => nutritionApi.copyMeal(meal.id, { toDate }),
    onSuccess: (_meal, toDate) => {
      setCopied(toDate);
      qc.invalidateQueries({ queryKey: ['nutrition', 'summary', toDate] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', toDate] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'history'] });
    },
  });

  const [name, setName] = useState(label);
  const save = useMutation<MealTemplate, Error, string>({
    mutationFn: (templateName) =>
      nutritionApi.createMealTemplate({ name: templateName, mealId: meal.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition', 'meal-templates'] }),
  });

  return (
    <>
      <DrawerHeader className="px-0">
        <DrawerTitle>{`${label} · ${time}`}</DrawerTitle>
        <DrawerDescription>
          Copie para outro dia ou salve para registrar de novo num toque.
        </DrawerDescription>
      </DrawerHeader>

      <section className="mt-2 space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Copiar
        </h3>
        <CopyToDay
          inputId="copy-meal-date"
          defaultTarget={defaultCopyTarget(date, today)}
          today={today}
          pending={copy.isPending}
          error={copy.error?.message ?? null}
          done={copied ? { text: `Copiada para ${dayLabel(copied, today)}`, target: copied } : null}
          onCopy={(toDate) => copy.mutate(toDate)}
          onNavigate={onClose}
        />
      </section>

      <section className="mt-5 space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Salvar como refeição salva
        </h3>
        {save.isSuccess ? (
          <p className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
            <Check size={16} aria-hidden />
            {`"${save.data.name}" salva. Ela aparece ao registrar uma refeição.`}
          </p>
        ) : (
          <>
            <label htmlFor="template-name" className="text-sm font-medium">
              Nome da refeição salva
            </label>
            <div className="flex gap-2">
              <Input
                id="template-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!name.trim() || save.isPending}
                onClick={() => save.mutate(name.trim())}
              >
                {save.isPending ? 'Salvando...' : 'Salvar refeição'}
              </Button>
            </div>
            {save.error && (
              <p role="alert" className="text-sm text-danger">
                {save.error.message}
              </p>
            )}
          </>
        )}
      </section>

      <DrawerClose asChild>
        <Button variant="ghost" className="mt-4 w-full">
          Fechar
        </Button>
      </DrawerClose>
    </>
  );
}
