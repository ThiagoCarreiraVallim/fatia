'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  formatDecimal,
  progressApi,
  weightDeltaSinceLabel,
  weightSheetBase,
  weightSheetSeries,
  weightSparkPath,
  WEIGHT_STEP_KG,
} from '@fatia/api-client';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { hojeIso } from '@/lib/dias';
import { cn } from '@/lib/utils';

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Peso (prancha Al-H4-Peso): − e + de 0,1 kg em torno do último registro, a
 * diferença para a pesagem anterior e o traço de 30 dias que termina no valor
 * escolhido. Salvar no mesmo dia corrige o registro de hoje em vez de duplicar.
 */
export function WeightSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = hojeIso();
  const qc = useQueryClient();
  const progress = useQuery({
    queryKey: ['progress', 'weight', 30],
    queryFn: () => progressApi.weight(30),
    enabled: open,
  });
  const base = weightSheetBase(progress.data, today);
  const loggedToday = base.todayLogId !== null;
  const reference = base.reference;

  const [kg, setKg] = useState<number | null>(null);
  // Fechar descarta o ajuste: a próxima abertura parte do último registro.
  const close = (o: boolean) => {
    if (!o) setKg(null);
    onOpenChange(o);
  };
  const value = kg ?? base.startKg;

  const save = useMutation({
    mutationFn: () =>
      base.todayLogId
        ? progressApi.updateWeight(base.todayLogId, { weightKg: value })
        : progressApi.createWeight({ weightKg: value }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['progress', 'weight'] });
      void qc.invalidateQueries({ queryKey: ['weight-logs'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast(`Peso salvo: ${formatDecimal(value)} kg`);
      close(false);
    },
    onError: () => toast('Não deu para salvar o peso. Tente de novo.'),
  });

  const delta = reference ? round1(value - reference.weightKg) : null;
  const points = base.points;
  const path = weightSparkPath(weightSheetSeries(points, value, loggedToday), 300, 60);
  const shown = formatDecimal(value);

  return (
    <Drawer open={open} onOpenChange={close}>
      <DrawerContent className="gap-4 px-6 pb-8 pt-3">
        <div className="flex items-center justify-between">
          <DrawerTitle className="font-display text-h2">Peso</DrawerTitle>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-chip bg-card px-3.5 text-sm font-semibold text-muted-foreground">
            <Icon name="cal" size={16} />
            Hoje
          </span>
        </div>
        <DrawerDescription className="sr-only">
          Ajuste o peso de hoje de 0,1 em 0,1 kg e salve.
        </DrawerDescription>

        <div className="flex items-center justify-between py-2">
          <button
            type="button"
            aria-label="Menos 0,1 kg"
            onClick={() => setKg(round1(value - WEIGHT_STEP_KG))}
            className="anim-press inline-flex h-14 w-14 items-center justify-center rounded-field bg-muted"
          >
            <span aria-hidden className="h-0.5 w-4 rounded-[1px] bg-current" />
          </button>
          <div className="flex flex-col items-center gap-1">
            <span
              aria-live="polite"
              className="font-display text-[72px] font-bold leading-none tracking-[-0.05em] tabular-nums"
            >
              {shown}
              <span className="ml-1 text-[22px] font-semibold text-muted-foreground">kg</span>
            </span>
            {delta !== null && reference && (
              <span
                className={cn(
                  'inline-flex h-[22px] items-center rounded-pill px-2.5 text-[11px] font-extrabold uppercase tracking-[0.04em]',
                  delta <= 0
                    ? 'bg-primary-soft text-primary'
                    : 'bg-[hsl(var(--warning)/0.14)] text-warning',
                )}
              >
                {weightDeltaSinceLabel(delta, reference.date, today)}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Mais 0,1 kg"
            onClick={() => setKg(round1(value + WEIGHT_STEP_KG))}
            className="anim-press inline-flex h-14 w-14 items-center justify-center rounded-field bg-primary text-primary-foreground"
          >
            <Icon name="plus" size={24} />
          </button>
        </div>

        {points.length > 0 && (
          <div className="flex flex-col gap-2 rounded-card bg-muted px-[18px] py-4">
            <div className="flex items-center justify-between">
              <span className="text-b2">30 dias</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDecimal(points[0])} → {shown}
              </span>
            </div>
            <svg viewBox="0 0 300 60" width="100%" height="60" aria-hidden>
              <path
                d={path}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={100}
                className="anim-ring"
                style={{ strokeDasharray: 100 }}
              />
            </svg>
          </div>
        )}

        <button
          type="button"
          disabled={save.isPending || progress.isLoading}
          onClick={() => save.mutate()}
          className="anim-press inline-flex h-[52px] w-full items-center justify-center rounded-field bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50"
        >
          Salvar {shown} kg
        </button>
      </DrawerContent>
    </Drawer>
  );
}
