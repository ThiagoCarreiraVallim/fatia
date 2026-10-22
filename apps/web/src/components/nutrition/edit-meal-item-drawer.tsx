'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  amountGrams,
  amountPayload,
  nutritionApi,
  type Amount,
  type FoodPortion,
  type MealItem,
} from '@fatia/api-client';
import { AmountPicker } from './amount-picker';
import { errorMessage } from './error-message';
import { invalidateNutritionDay } from '@/lib/nutrition-cache';

interface Props {
  item: MealItem | null;
  date: string;
  onClose: () => void;
}

/** Como o item foi gravado: na medida, se ela ainda existe; senão em gramas. */
function amountOf(item: MealItem, portions: FoodPortion[]): Amount {
  const portion = item.portionLabel
    ? portions.find((p) => p.label === item.portionLabel)
    : undefined;
  return portion && item.portionQuantity
    ? { kind: 'portion', portionId: portion.id, quantity: item.portionQuantity }
    : { kind: 'grams', grams: String(item.grams) };
}

export function EditMealItemDrawer({ item, date, onClose }: Props) {
  const open = item !== null;
  // `null` até a pessoa mexer: antes disso o valor sai do item e das medidas carregadas.
  const [edited, setEdited] = useState<Amount | null>(null);
  const [created, setCreated] = useState<FoodPortion[]>([]);
  const qc = useQueryClient();

  // Ajuste durante o render, e não num efeito (#187): trocar de item descarta a edição.
  const [previousItem, setPreviousItem] = useState<MealItem | null>(null);
  if (previousItem !== item) {
    setPreviousItem(item);
    setEdited(null);
    setCreated([]);
  }

  const foodId = item?.foodId ?? null;
  const portionsQuery = useQuery({
    queryKey: ['nutrition', 'portions', foodId],
    queryFn: () => nutritionApi.portions(foodId as number),
    enabled: open && foodId !== null,
  });
  const portions = [...(portionsQuery.data ?? []), ...created];
  const amount: Amount | null = item ? (edited ?? amountOf(item, portions)) : null;
  const grams = amount ? amountGrams(amount, portions) : null;

  const mutation = useMutation({
    mutationFn: () => {
      if (!item || !amount || grams === null) throw new Error('Quantidade inválida');
      return nutritionApi.updateItem(item.id, amountPayload(amount));
    },
    onSuccess: () => {
      invalidateNutritionDay(qc, date);
      onClose();
    },
  });

  const createPortion = async (label: string, g: number) => {
    if (foodId === null) throw new Error('Item sem alimento');
    const portion = await nutritionApi.createPortion(foodId, { label, grams: g });
    setCreated((prev) => [...prev, portion]);
    qc.invalidateQueries({ queryKey: ['nutrition', 'portions', foodId] });
    return portion;
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Editar item</DrawerTitle>
          <DrawerDescription>{item?.foodName}</DrawerDescription>
        </DrawerHeader>
        <div className="my-3 space-y-4">
          {amount && foodId !== null ? (
            <AmountPicker
              portions={portions}
              amount={amount}
              onChange={setEdited}
              onCreatePortion={createPortion}
              gramsId="edit-grams"
            />
          ) : (
            // Item livre não tem alimento do catálogo, logo não tem medida para escolher.
            <div className="space-y-1">
              <label htmlFor="edit-grams" className="text-sm font-medium">
                Quantidade (g)
              </label>
              <Input
                id="edit-grams"
                type="number"
                inputMode="decimal"
                value={amount?.kind === 'grams' ? amount.grams : ''}
                onChange={(e) => setEdited({ kind: 'grams', grams: e.target.value })}
                min={0}
                step={1}
                autoFocus
              />
            </div>
          )}
          {mutation.error && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(mutation.error, {
                conflict: 'Esse item já foi registrado nessa refeição.',
                fallback: 'Não foi possível salvar. Tente de novo.',
              })}
            </p>
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
              disabled={mutation.isPending || grams === null}
            >
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
