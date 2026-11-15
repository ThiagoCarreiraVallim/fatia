'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HEIGHT_MAX_CM, HEIGHT_MIN_CM, stepHeight, usersApi } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';

/** Sem estatura salva, o contador parte daqui. */
const START_CM = 170;

/**
 * A folha "Estatura" de Você (prancha Al-V1): menos, o número grande, mais e
 * Salvar. De 1 em 1 cm, entre 100 e 250.
 */
export function HeightSheet({
  open,
  onOpenChange,
  heightCm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heightCm: number | null;
}) {
  const [value, setValue] = useState(Math.round(heightCm ?? START_CM));
  // Reabrir parte do valor salvo; ajuste no render, e não num efeito (#187).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setValue(Math.round(heightCm ?? START_CM));
  }

  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => usersApi.updateMe({ heightCm: value }),
    onSuccess: (me) => {
      qc.setQueryData(['users', 'me'], me);
      onOpenChange(false);
    },
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-6 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle className="font-display text-xl font-bold">Estatura</DrawerTitle>
        </DrawerHeader>
        <div className="my-4 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Menos"
            disabled={value <= HEIGHT_MIN_CM}
            onClick={() => setValue((v) => stepHeight(v, -1))}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
          >
            <span aria-hidden className="h-0.5 w-3 bg-current" />
          </button>
          <span className="min-w-[6ch] text-center font-display text-5xl font-bold tabular-nums">
            <span aria-live="polite">{value}</span>
            <span className="ms-1 text-lg font-semibold text-muted-foreground">cm</span>
          </span>
          <button
            type="button"
            aria-label="Mais"
            disabled={value >= HEIGHT_MAX_CM}
            onClick={() => setValue((v) => stepHeight(v, 1))}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-40"
          >
            <Icon name="plus" size={20} />
          </button>
        </div>
        {save.error && (
          <p role="alert" className="mb-2 text-sm text-danger">
            Não deu para salvar. Tente de novo.
          </p>
        )}
        <Button size="xl" full disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </DrawerContent>
    </Drawer>
  );
}
