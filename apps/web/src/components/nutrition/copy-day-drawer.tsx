'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  copyDayText,
  dayLabel,
  defaultCopyTarget,
  nutritionApi,
  type CopyDayResult,
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
import { CopyToDay } from './copy-to-day';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  today: string;
  mealCount: number;
}

/** "Comi igual ontem": todas as refeições do dia vão para outro, cada uma no seu horário. */
export function CopyDayDrawer({ open, onOpenChange, date, today, mealCount }: Props) {
  const qc = useQueryClient();
  // A última cópia feita fica à vista mesmo se a próxima tentativa falhar.
  const [copied, setCopied] = useState<{ text: string; target: string } | null>(null);
  const copy = useMutation<CopyDayResult, Error, string>({
    mutationFn: (toDate) => nutritionApi.copyDay({ fromDate: date, toDate }),
    onSuccess: (result, toDate) => {
      setCopied({ text: copyDayText(result), target: toDate });
      qc.invalidateQueries({ queryKey: ['nutrition', 'summary', toDate] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', toDate] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'history'] });
    },
  });

  const refeicoes = mealCount === 1 ? 'A refeição' : `As ${mealCount} refeições`;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          copy.reset();
          setCopied(null);
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Copiar dia</DrawerTitle>
          <DrawerDescription>
            {`${refeicoes} de ${dayLabel(date, today)} vão para o dia escolhido, cada uma no mesmo horário. O que já estiver lá não duplica.`}
          </DrawerDescription>
        </DrawerHeader>
        {open && (
          <div className="mt-2">
            <CopyToDay
              key={date}
              inputId="copy-day-date"
              defaultTarget={defaultCopyTarget(date, today)}
              today={today}
              pending={copy.isPending}
              error={copy.error?.message ?? null}
              done={copied}
              onCopy={(toDate) => copy.mutate(toDate)}
              onNavigate={() => onOpenChange(false)}
            />
          </div>
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
