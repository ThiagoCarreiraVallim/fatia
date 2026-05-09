'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
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
import { nutritionApi, type Food, type MealType } from '@/lib/api/nutrition';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se mealId for passado, adiciona item ao meal. Caso contrário cria nova refeição. */
  mealId?: string;
  mealType?: MealType;
  date: string;
}

export function FoodSearchDrawer({ open, onOpenChange, mealId, mealType, date }: Props) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState<string>('100');
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) {
      setQ('');
      setDebounced('');
      setSelected(null);
      setGrams('100');
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ['nutrition', 'search', debounced],
    queryFn: () => nutritionApi.searchFoods(debounced, 20),
    enabled: open && debounced.trim().length >= 2,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });

  const addItem = useMutation<unknown, Error>({
    mutationFn: async () => {
      if (!selected) throw new Error('Selecione um alimento');
      const g = Number(grams);
      if (!Number.isFinite(g) || g <= 0) throw new Error('Gramas inválidas');
      if (mealId) {
        return nutritionApi.addItem(mealId, { foodId: selected.id, grams: g });
      }
      return nutritionApi.createMeal({
        mealType: mealType ?? 'SNACK',
        eatenAt: new Date().toISOString(),
        items: [{ foodId: selected.id, grams: g }],
      });
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
  });

  const preview = useMemo(() => {
    if (!selected) return null;
    const g = Number(grams);
    if (!Number.isFinite(g) || g <= 0) return null;
    const ratio = g / 100;
    return {
      kcal: Math.round(selected.kcalPer100g * ratio),
      proteinG: Math.round(selected.proteinPer100g * ratio),
      carbsG: Math.round(selected.carbsPer100g * ratio),
      fatG: Math.round(selected.fatPer100g * ratio),
    };
  }, [selected, grams]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>{mealId ? 'Adicionar item' : 'Nova refeição'}</DrawerTitle>
          <DrawerDescription>Busque um alimento da TACO ou seus customs.</DrawerDescription>
        </DrawerHeader>

        {!selected ? (
          <>
            <div className="relative my-3">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ex.: arroz, frango, banana..."
                className="pl-9"
              />
            </div>
            <ul className="-mx-4 max-h-[55vh] divide-y overflow-y-auto">
              {search.isFetching && (
                <li className="px-4 py-3 text-sm text-muted-foreground">Buscando...</li>
              )}
              {!search.isFetching && debounced.length < 2 && (
                <li className="px-4 py-3 text-sm text-muted-foreground">
                  Digite pelo menos 2 caracteres.
                </li>
              )}
              {!search.isFetching && search.data?.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted-foreground">Nenhum resultado.</li>
              )}
              {search.data?.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(food)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent"
                  >
                    <div>
                      <p className="text-sm font-medium">{food.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {Math.round(food.kcalPer100g)} kcal/100g · P
                        {Math.round(food.proteinPer100g)} · C{Math.round(food.carbsPer100g)} · G
                        {Math.round(food.fatPer100g)}
                      </p>
                    </div>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase">
                      {food.source}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="my-3 space-y-4">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                {Math.round(selected.kcalPer100g)} kcal/100g
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor="grams" className="text-sm font-medium">
                Quantidade (g)
              </label>
              <Input
                id="grams"
                type="number"
                inputMode="decimal"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                min={0}
                step={1}
              />
            </div>
            {preview && (
              <p className="text-sm tabular-nums text-muted-foreground">
                Total: {preview.kcal} kcal · P{preview.proteinG} · C{preview.carbsG} · G
                {preview.fatG}
              </p>
            )}
            {addItem.error && (
              <p className="text-sm text-rose-500">{(addItem.error as Error).message}</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>
                Voltar
              </Button>
              <Button
                className="flex-1"
                onClick={() => addItem.mutate()}
                disabled={addItem.isPending}
              >
                {addItem.isPending ? 'Salvando...' : 'Adicionar'}
              </Button>
            </div>
          </div>
        )}

        <DrawerClose asChild>
          <Button variant="ghost" className="mt-2 w-full">
            Cancelar
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}
