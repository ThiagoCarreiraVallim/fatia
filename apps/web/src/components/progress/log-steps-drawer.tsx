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
  date?: string;
}

export function LogStepsDrawer({ open, onClose, date }: Props) {
  const [steps, setSteps] = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const s = Number(steps);
      if (!Number.isFinite(s) || s < 0 || !Number.isInteger(s)) throw new Error('Valor inválido');
      return progressApi.createStep({ steps: s, ...(date ? { date } : {}) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress', 'steps'] });
      qc.invalidateQueries({ queryKey: ['step-logs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setSteps('');
      onClose();
    },
  });

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Logar passos</DrawerTitle>
          <DrawerDescription>
            Múltiplos logs no mesmo dia são OK — o servidor pega o maior valor.
          </DrawerDescription>
        </DrawerHeader>
        <div className="my-3 space-y-4">
          <div className="space-y-1">
            <label htmlFor="steps" className="text-sm font-medium">
              Passos
            </label>
            <Input
              id="steps"
              type="number"
              inputMode="numeric"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder="ex: 9500"
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
