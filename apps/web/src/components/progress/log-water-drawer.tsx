'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { progressApi } from '@/lib/api/progress';

interface Props {
  open: boolean;
  onClose: () => void;
}

const PRESETS_ML = [250, 500, 750, 1000] as const;

export function LogWaterDrawer({ open, onClose }: Props) {
  const [ml, setMl] = useState('');
  const qc = useQueryClient();

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['progress', 'water'] });
    qc.invalidateQueries({ queryKey: ['water-logs'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const mutation = useMutation({
    mutationFn: (value: number) => progressApi.createWater({ ml: value }),
    onSuccess: () => {
      invalidate();
      setMl('');
      onClose();
    },
  });

  function submitCustom() {
    const n = Number(ml);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      mutation.reset();
      throw new Error('Valor inválido');
    }
    mutation.mutate(n);
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Registrar água</DrawerTitle>
          <DrawerDescription>Cada log soma ao total do dia.</DrawerDescription>
        </DrawerHeader>
        <div className="my-3 space-y-4">
          <div>
            <p className="mb-2 text-[11px] font-bold tracking-wide text-muted-foreground">
              QUANTIDADES COMUNS
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS_ML.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(v)}
                  className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-base font-bold text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                >
                  +{v} mL
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="water-custom" className="text-sm font-medium">
              Quantidade personalizada (mL)
            </label>
            <Input
              id="water-custom"
              type="number"
              inputMode="numeric"
              value={ml}
              onChange={(e) => setMl(e.target.value)}
              placeholder="ex: 350"
            />
          </div>

          {mutation.error && (
            <p className="text-sm text-rose-500">{(mutation.error as Error).message}</p>
          )}

          <Button
            className="w-full"
            onClick={() => {
              try {
                submitCustom();
              } catch {
                // erro já tratado via setError implícito
              }
            }}
            disabled={mutation.isPending || !ml.trim()}
          >
            {mutation.isPending ? 'Salvando…' : 'Adicionar valor personalizado'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
