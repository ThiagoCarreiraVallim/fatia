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

export function LogWeightDrawer({ open, onClose }: Props) {
  const [weight, setWeight] = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) throw new Error('Peso inválido');
      return progressApi.createWeight({ weightKg: w });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress', 'weight'] });
      qc.invalidateQueries({ queryKey: ['weight-logs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setWeight('');
      onClose();
    },
  });

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Logar peso</DrawerTitle>
          <DrawerDescription>Pesagem da manhã, em jejum, é o mais consistente.</DrawerDescription>
        </DrawerHeader>
        <div className="my-3 space-y-4">
          <div className="space-y-1">
            <label htmlFor="weight-kg" className="text-sm font-medium">
              Peso (kg)
            </label>
            <Input
              id="weight-kg"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="ex: 78.5"
              autoFocus
            />
          </div>
          {mutation.error && (
            <p className="text-sm text-rose-500">{(mutation.error as Error).message}</p>
          )}
          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
