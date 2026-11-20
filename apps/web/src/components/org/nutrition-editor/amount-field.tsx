'use client';

import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { nutritionApi, withGrams, type NutritionFoodSnap } from '@fatia/api-client';
import { Label } from '@/components/ui/label';
import { NumField } from '@/components/org/plan-editor/num-field';

export const selectClass =
  'h-10 w-full rounded-field bg-card px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--border))]';

const GRAMS = '__g';

/**
 * Quantidade de um alimento: medida caseira do catálogo (colher, fatia...) ou
 * gramas, sempre digitável. Os macros acompanham as gramas.
 */
export function AmountField<T extends NutritionFoodSnap>({
  value,
  onChange,
}: {
  value: T;
  onChange: (next: T) => void;
}) {
  const id = useId();
  const portions = useQuery({
    queryKey: ['nutrition', 'foods', value.foodId, 'portions'],
    queryFn: () => nutritionApi.portions(value.foodId as number),
    enabled: value.foodId !== null,
    staleTime: 5 * 60_000,
  });
  // A medida da linha, mesmo que o catálogo ainda não tenha chegado.
  const own =
    value.portionLabel && value.portionQuantity
      ? [{ label: value.portionLabel, grams: value.grams / value.portionQuantity }]
      : [];
  const list = [
    ...own,
    ...(portions.data ?? [])
      .filter((p) => p.label !== value.portionLabel)
      .map((p) => ({ label: p.label, grams: p.grams })),
  ];
  const current = list.find((p) => p.label === value.portionLabel) ?? null;
  const name = value.foodName;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          Medida
        </Label>
        <select
          id={id}
          aria-label={`Medida de ${name}`}
          value={current ? current.label : GRAMS}
          onChange={(e) => {
            if (e.target.value === GRAMS) return onChange(withGrams(value, value.grams, null));
            const p = list.find((x) => x.label === e.target.value);
            if (!p) return;
            const q = Math.max(0.5, Math.round((value.grams / p.grams) * 2) / 2);
            onChange(withGrams(value, Math.round(p.grams * q), { label: p.label, quantity: q }));
          }}
          className={selectClass}
        >
          <option value={GRAMS}>gramas</option>
          {list.map((p) => (
            <option key={p.label} value={p.label}>
              {`${p.label} (${Math.round(p.grams)} g)`}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <span aria-hidden className="block text-xs text-muted-foreground">
          {current ? 'Quantas' : 'Gramas'}
        </span>
        <NumField
          label={`Quantidade de ${name}`}
          hideLabel
          integer={!current}
          min={current ? 0.25 : 1}
          max={current ? 50 : 5000}
          value={current ? (value.portionQuantity ?? 1) : value.grams}
          onChange={(n) => {
            if (n === undefined) return;
            if (!current) return onChange(withGrams(value, n, null));
            onChange(
              withGrams(value, Math.round(current.grams * n), {
                label: current.label,
                quantity: n,
              }),
            );
          }}
        />
      </div>
    </div>
  );
}
