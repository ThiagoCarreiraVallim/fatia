'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  customFoodToForm,
  emptyCustomFoodForm,
  nutritionApi,
  type CustomFoodInput,
  type Food,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CustomFoodForm } from './custom-food-form';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` cadastra um novo; com alimento, edita e permite apagar. */
  food: Food | null;
}

/** Novo ou edição de um alimento próprio, na tela "Meus alimentos". */
export function CustomFoodDrawer({ open, onOpenChange, food }: Props) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const done = () => {
    // A busca e os atalhos guardam nome e valores do alimento.
    qc.invalidateQueries({ queryKey: ['nutrition', 'custom-foods'] });
    qc.invalidateQueries({ queryKey: ['nutrition', 'search'] });
    qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
    setConfirming(false);
    onOpenChange(false);
  };

  const save = useMutation<Food, Error, CustomFoodInput>({
    mutationFn: (input) =>
      food ? nutritionApi.updateCustomFood(food.id, input) : nutritionApi.createCustomFood(input),
    onSuccess: done,
  });

  const remove = useMutation<void, Error, number>({
    mutationFn: (id) => nutritionApi.deleteCustomFood(id),
    onSuccess: done,
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>{food ? 'Editar alimento' : 'Novo alimento'}</DrawerTitle>
          <DrawerDescription>
            {food
              ? 'Valores por 100 g. As medidas se ajustam ao registrar.'
              : 'Copie o rótulo. Ele aparece na busca ao registrar uma refeição.'}
          </DrawerDescription>
        </DrawerHeader>

        <CustomFoodForm
          key={food?.id ?? 'novo'}
          initial={food ? customFoodToForm(food) : emptyCustomFoodForm()}
          editing={!!food}
          submitLabel="Salvar"
          pending={save.isPending}
          error={save.error?.message ?? remove.error?.message}
          onSubmit={(input) => save.mutate(input)}
          onCancel={() => onOpenChange(false)}
          cancelLabel="Cancelar"
        />

        {food && (
          <>
            <Button
              variant="ghost"
              className="w-full text-danger hover:text-danger"
              onClick={() => setConfirming(true)}
            >
              Apagar alimento
            </Button>
            <ConfirmDialog
              open={confirming}
              onOpenChange={setConfirming}
              title={`Apagar "${food.name}"?`}
              description="Some da busca e dos atalhos. As refeições já registradas continuam com o nome e os valores."
              confirmLabel="Apagar"
              pending={remove.isPending}
              onConfirm={() => remove.mutate(food.id)}
            />
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
