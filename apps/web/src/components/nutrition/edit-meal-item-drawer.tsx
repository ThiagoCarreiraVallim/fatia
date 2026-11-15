'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Icon } from '@/components/ui/icon';
import {
  amountGrams,
  amountPayload,
  formatDecimal,
  nutritionApi,
  scaleMealItem,
  type Amount,
  type FoodPortion,
  type MealItem,
} from '@fatia/api-client';
import { AmountPicker } from './amount-picker';
import { cn } from '@/lib/utils';
import { errorMessage } from './error-message';
import { invalidateNutritionDay } from '@/lib/nutrition-cache';

interface Props {
  item: MealItem | null;
  date: string;
  onClose: () => void;
  /** "Café da manhã · 07:36", embaixo do nome. */
  context?: string;
  /** Depois de salvar ou remover: a tela da refeição recarrega a dela. */
  onChanged?: () => void;
}

/** Como o item foi gravado: na medida, se ela ainda existe; senão em gramas. */
function amountOf(item: MealItem, portions: FoodPortion[]): Amount {
  const portion = item.portionLabel
    ? portions.find((p) => p.label === item.portionLabel)
    : undefined;
  return portion && item.portionQuantity
    ? { kind: 'portion', portionId: portion.id, quantity: item.portionQuantity }
    : { kind: 'grams', grams: String(item.grams).replace('.', ',') };
}

const oneDecimal = (n: number) => formatDecimal(n, 1).replace(/,0$/, '');

/**
 * Editar item (prancha Al-N14): a quantidade digitável (com vírgula) ou no − e +,
 * a medida caseira, as contas refeitas antes de salvar e o remover com confirmação.
 */
export function EditMealItemDrawer({ item, date, onClose, context, onChanged }: Props) {
  const open = item !== null;
  // `null` até a pessoa mexer: antes disso o valor sai do item e das medidas carregadas.
  const [edited, setEdited] = useState<Amount | null>(null);
  const [created, setCreated] = useState<FoodPortion[]>([]);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const qc = useQueryClient();

  // Ajuste durante o render, e não num efeito (#187): trocar de item descarta a edição.
  const [previousItem, setPreviousItem] = useState<MealItem | null>(null);
  if (previousItem !== item) {
    setPreviousItem(item);
    setEdited(null);
    setCreated([]);
    setConfirmingRemove(false);
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
  const preview = item ? scaleMealItem(item, grams ?? item.grams) : null;

  const done = () => {
    invalidateNutritionDay(qc, date);
    onChanged?.();
    onClose();
  };
  const mutation = useMutation({
    mutationFn: () => {
      if (!item || !amount || grams === null) throw new Error('Quantidade inválida');
      return nutritionApi.updateItem(item.id, amountPayload(amount));
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => nutritionApi.deleteItem((item as MealItem).id),
    onSuccess: () => {
      setConfirmingRemove(false);
      done();
    },
    onError: () => setConfirmingRemove(false),
  });

  const createPortion = async (label: string, g: number) => {
    if (foodId === null) throw new Error('Item sem alimento');
    const portion = await nutritionApi.createPortion(foodId, { label, grams: g });
    setCreated((prev) => [...prev, portion]);
    qc.invalidateQueries({ queryKey: ['nutrition', 'portions', foodId] });
    return portion;
  };

  const error = mutation.error ?? remove.error;

  return (
    <>
      <Drawer open={open && !confirmingRemove} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="px-4 pb-6">
          {/* Editar item (prancha Al-N14): o mesmo desenho da quantidade (Al-N3). */}
          <DrawerHeader className="gap-0.5 px-0 pt-5">
            <DrawerDescription className="text-xs">Editar item</DrawerDescription>
            <DrawerTitle className="font-display text-h2">{item?.foodName}</DrawerTitle>
            {context && <p className="text-xs text-muted-foreground">{context}</p>}
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
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount?.kind === 'grams' ? amount.grams : ''}
                  aria-invalid={grams === null}
                  onChange={(e) => setEdited({ kind: 'grams', grams: e.target.value })}
                  autoFocus
                />
                {grams === null && (
                  <p role="alert" className="text-sm text-danger">
                    Digite os gramas, como 120 ou 120,5.
                  </p>
                )}
              </div>
            )}

            {preview && (
              <div className="space-y-4">
                <dl className="grid grid-cols-4 gap-2 text-center">
                  <Stat label="Calorias" value={String(preview.kcal)} unit="kcal" />
                  <Stat
                    label="Proteína"
                    value={oneDecimal(preview.proteinG)}
                    unit="prot g"
                    className="text-protein"
                  />
                  <Stat
                    label="Carboidratos"
                    value={oneDecimal(preview.carbsG)}
                    unit="carb g"
                    className="text-carbs"
                  />
                  <Stat
                    label="Gorduras"
                    value={oneDecimal(preview.fatG)}
                    unit="gord g"
                    className="text-fat"
                  />
                </dl>
                {item?.nutrients && (
                  <p className="text-xs text-muted-foreground">
                    {`Fibra ${oneDecimal(preview.fiberG)} g · Sódio ${preview.sodiumMg} mg`}
                  </p>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {errorMessage(error, {
                  conflict: 'Esse item já foi registrado nessa refeição.',
                  fallback: 'Não foi possível salvar. Tente de novo.',
                })}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="anim-press flex h-14 w-14 shrink-0 items-center justify-center rounded-pill bg-[hsl(var(--danger)/0.12)] text-danger"
                aria-label="Remover item"
                onClick={() => setConfirmingRemove(true)}
              >
                <Icon name="trash" size={20} />
              </button>
              <button
                type="button"
                className="anim-press h-14 flex-1 rounded-pill bg-foreground text-[15px] font-bold text-background disabled:opacity-40"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || grams === null}
              >
                {mutation.isPending ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
      <ConfirmSheet
        open={open && confirmingRemove}
        onOpenChange={(o) => !o && setConfirmingRemove(false)}
        title={`Remover ${item?.foodName ?? 'o item'}?`}
        description="O item sai da refeição e as contas do dia mudam."
        confirmLabel="Remover"
        pendingLabel="Removendo..."
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

function Stat({
  label,
  value,
  unit,
  className,
}: {
  label: string;
  value: string;
  unit: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[16px] bg-muted px-1 py-2.5">
      <dt className="sr-only">{label}</dt>
      <dd aria-label={label} className={cn('text-lg font-bold tabular-nums', className)}>
        {value}
      </dd>
      <span aria-hidden className="text-[11px] text-muted-foreground">
        {unit}
      </span>
    </div>
  );
}
