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
import { usersApi } from '@fatia/api-client';

interface Props {
  open: boolean;
  onClose: () => void;
  currentHeightCm: number | null;
}

export function EditHeightDrawer({ open, onClose, currentHeightCm }: Props) {
  const [value, setValue] = useState('');
  const qc = useQueryClient();

  // Ajuste durante o render, e não num efeito (#187). A comparação é a mesma que
  // estava no array de dependências, então o campo é reespelhado nos mesmos
  // momentos — só que antes de pintar, sem o quadro com o valor velho. O estado
  // anterior parte de "fechado, sem estatura" para reproduzir a passagem de
  // montagem: montado já aberto, o campo precisa nascer preenchido.
  const [previous, setPrevious] = useState<{ open: boolean; heightCm: number | null }>({
    open: false,
    heightCm: null,
  });
  if (previous.open !== open || previous.heightCm !== currentHeightCm) {
    setPrevious({ open, heightCm: currentHeightCm });
    if (open) setValue(currentHeightCm?.toString() ?? '');
  }

  const mutation = useMutation({
    mutationFn: () => {
      const cm = Number(value);
      if (!Number.isFinite(cm) || cm <= 0) throw new Error('Estatura inválida.');
      return usersApi.updateMe({ heightCm: cm });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', 'me'] });
      onClose();
    },
  });

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Estatura</DrawerTitle>
          <DrawerDescription>Sua altura em centímetros.</DrawerDescription>
        </DrawerHeader>
        <div className="my-3 space-y-4">
          <div className="space-y-1">
            <label htmlFor="height-cm" className="text-sm font-medium">
              Altura (cm)
            </label>
            <Input
              id="height-cm"
              type="number"
              inputMode="numeric"
              step="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="ex: 182"
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
