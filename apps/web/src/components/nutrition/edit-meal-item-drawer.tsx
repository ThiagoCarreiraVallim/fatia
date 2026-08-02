'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { nutritionApi, type MealItem } from '@fatia/api-client';

interface Props {
  item: MealItem | null;
  date: string;
  onClose: () => void;
}

export function EditMealItemDrawer({ item, date, onClose }: Props) {
  const open = item !== null;
  const [grams, setGrams] = useState('');
  const qc = useQueryClient();

  // Ajuste durante o render, e não num efeito (#187). A comparação é a mesma que
  // estava no array de dependências — identidade do objeto `item` — então o campo
  // é reespelhado nos mesmos momentos, só que antes de pintar. `previousItem`
  // parte de `null` para reproduzir a passagem de montagem: o drawer é montado
  // já com `item`, e sem isso o campo nasceria vazio.
  const [previousItem, setPreviousItem] = useState<MealItem | null>(null);
  if (previousItem !== item) {
    setPreviousItem(item);
    if (item) setGrams(String(item.grams));
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('Sem item');
      const g = Number(grams);
      if (!Number.isFinite(g) || g <= 0) throw new Error('Gramas inválidas');
      return nutritionApi.updateItem(item.id, { grams: g });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
      onClose();
    },
  });

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Editar item</DrawerTitle>
          <DrawerDescription>{item?.foodName}</DrawerDescription>
        </DrawerHeader>
        <div className="my-3 space-y-4">
          <div className="space-y-1">
            <label htmlFor="edit-grams" className="text-sm font-medium">
              Quantidade (g)
            </label>
            <Input
              id="edit-grams"
              type="number"
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              min={0}
              step={1}
              autoFocus
            />
          </div>
          {mutation.error && (
            <p className="text-sm text-rose-500">{(mutation.error as Error).message}</p>
          )}
          <div className="flex gap-2">
            <DrawerClose asChild>
              <Button variant="outline" className="flex-1">
                Cancelar
              </Button>
            </DrawerClose>
            <Button
              className="flex-1"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
