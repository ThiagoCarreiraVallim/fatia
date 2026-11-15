'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  formatInteger,
  progressApi,
  shiftDay,
  waterLeftLabel,
  waterSheetAddedToast,
  WATER_DELETED_TOAST,
  WATER_QUICK_ML,
  type WaterLog,
} from '@fatia/api-client';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/selection';
import { hojeIso } from '@/lib/dias';
import { hourMinute } from '@/components/progress/log-format';

type Day = 'y' | 't';

/**
 * Água (prancha Al-H3-Agua): Ontem/Hoje, o copo que enche com mola, o total
 * sobre a meta e quanto falta, os atalhos de quantidade e os registros do dia.
 * Desfazer é apagar na lista; cada ação confirma com um toast.
 */
export function WaterSheet({
  open,
  onOpenChange,
  targetMl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetMl: number;
}) {
  const [day, setDay] = useState<Day>('t');
  const today = hojeIso();
  const date = day === 't' ? today : shiftDay(today, -1);
  const qc = useQueryClient();

  const logs = useQuery({
    queryKey: ['water-logs', 'day', date],
    queryFn: () => progressApi.listWater({ from: date, to: date }),
    enabled: open,
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['water-logs'] });
    void qc.invalidateQueries({ queryKey: ['progress', 'water'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const add = useMutation({
    mutationFn: (ml: number) =>
      progressApi.createWater({ ml, ...(date !== today ? { date } : {}) }),
    onSuccess: (_d, ml) => {
      invalidate();
      toast(waterSheetAddedToast(ml));
    },
    onError: () => toast('Não deu para registrar a água. Tente de novo.'),
  });

  const remove = useMutation({
    mutationFn: (log: WaterLog) => progressApi.deleteWater(log.id),
    onSuccess: () => {
      invalidate();
      toast(WATER_DELETED_TOAST);
    },
    onError: () => toast('Não deu para apagar. Tente de novo.'),
  });

  const list = logs.data?.logs ?? [];
  const total = list.reduce((a, l) => a + l.ml, 0);
  const fill = Math.min(100, (total / targetMl) * 100);

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) setDay('t');
        onOpenChange(o);
      }}
    >
      <DrawerContent className="gap-4 px-6 pb-8 pt-3">
        <div className="flex items-center justify-between gap-3">
          <DrawerTitle className="font-display text-h2">Água</DrawerTitle>
          <Segmented
            label="Dia"
            value={day}
            onChange={setDay}
            options={[
              { value: 'y', label: 'Ontem' },
              { value: 't', label: 'Hoje' },
            ]}
            className="w-[170px]"
          />
        </div>
        <DrawerDescription className="sr-only">
          Registre e apague os copos de água de ontem e de hoje.
        </DrawerDescription>

        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className="relative h-[132px] w-24 shrink-0 overflow-hidden rounded-[18px_18px_28px_28px] bg-muted shadow-[inset_0_0_0_2px_hsl(var(--border-strong))]"
          >
            <div
              className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-[hsl(var(--water)/0.65)] to-[hsl(var(--water))] transition-[height] duration-[600ms] ease-spring motion-reduce:transition-none"
              style={{ height: `${fill}%` }}
            />
          </div>
          <div className="flex flex-col gap-1" aria-live="polite">
            <span className="font-display text-d1 tabular-nums">{formatInteger(total)}</span>
            <span className="text-b2 text-muted-foreground">
              de {formatInteger(targetMl)} mL · {waterLeftLabel(total, targetMl)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {WATER_QUICK_ML.map((ml) => (
            <button
              key={ml}
              type="button"
              disabled={add.isPending}
              onClick={() => add.mutate(ml)}
              className="anim-press h-14 rounded-field bg-[hsl(var(--water)/0.14)] text-[15px] font-bold text-water disabled:opacity-50"
            >
              {ml >= 1000 ? `+${ml / 1000} L` : `+${ml}`}
            </button>
          ))}
        </div>

        <div className="max-h-[220px] overflow-y-auto rounded-card bg-muted">
          {logs.isLoading ? (
            <p className="px-[18px] py-4 text-b2 text-muted-foreground">Carregando registros…</p>
          ) : logs.isError ? (
            <button
              type="button"
              onClick={() => void logs.refetch()}
              className="w-full px-[18px] py-4 text-left text-b2 text-danger"
            >
              Não deu para carregar. Tentar de novo
            </button>
          ) : list.length === 0 ? (
            <p className="px-[18px] py-4 text-b2 text-muted-foreground">
              Nenhum registro {day === 't' ? 'hoje' : 'ontem'}.
            </p>
          ) : (
            <ul>
              {list.map((log) => (
                <li
                  key={log.id}
                  className="flex min-h-[52px] items-center gap-3.5 px-[18px] [&+&]:shadow-[inset_0_1px_0_hsl(var(--border))]"
                >
                  <span className="font-bold tabular-nums">{formatInteger(log.ml)} mL</span>
                  <span className="flex-1 text-xs text-faint">{hourMinute(log.loggedAt)}</span>
                  <button
                    type="button"
                    aria-label={`Apagar registro de ${log.ml} mL das ${hourMinute(log.loggedAt)}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(log)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-field text-faint hover:text-foreground disabled:opacity-50"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="anim-press inline-flex h-[52px] w-full items-center justify-center rounded-field bg-primary text-[15px] font-bold text-primary-foreground"
        >
          Pronto
        </button>
      </DrawerContent>
    </Drawer>
  );
}
