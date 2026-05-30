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

type Mode = 'search' | 'manual';

interface ItemPayload {
  foodId?: number;
  foodName?: string;
  grams: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  nutrients?: Record<string, number>;
}

const INITIAL_MANUAL = { name: '', grams: '100', kcal: '', proteinG: '', carbsG: '', fatG: '' };

function parsePositive(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseNonNegative(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function FoodSearchDrawer({ open, onOpenChange, mealId, mealType, date }: Props) {
  const [mode, setMode] = useState<Mode>('search');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState<string>('100');
  const [manual, setManual] = useState(INITIAL_MANUAL);
  const [manualNutrients, setManualNutrients] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  // Metas de nutrientes ativas: o item manual pode informar esses nutrientes (ADR 009).
  const targets = useQuery({
    queryKey: ['nutrition', 'nutrient-targets'],
    queryFn: () => nutritionApi.nutrientTargets(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setMode('search');
      setQ('');
      setDebounced('');
      setSelected(null);
      setGrams('100');
      setManual(INITIAL_MANUAL);
      setManualNutrients({});
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ['nutrition', 'search', debounced],
    queryFn: () => nutritionApi.searchFoods(debounced, 20),
    enabled: open && mode === 'search' && debounced.trim().length >= 2,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });

  const addItem = useMutation<unknown, Error, ItemPayload>({
    mutationFn: (payload) => {
      if (mealId) return nutritionApi.addItem(mealId, payload);
      return nutritionApi.createMeal({
        mealType: mealType ?? 'SNACK',
        eatenAt: new Date().toISOString(),
        items: [payload],
      });
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
  });

  const preview = useMemo(() => {
    if (!selected) return null;
    const g = parsePositive(grams);
    if (g === null) return null;
    const ratio = g / 100;
    return {
      kcal: Math.round(selected.kcalPer100g * ratio),
      proteinG: Math.round(selected.proteinPer100g * ratio),
      carbsG: Math.round(selected.carbsPer100g * ratio),
      fatG: Math.round(selected.fatPer100g * ratio),
    };
  }, [selected, grams]);

  const submitFromSearch = () => {
    if (!selected) return;
    const g = parsePositive(grams);
    if (g === null) return;
    addItem.mutate({ foodId: selected.id, grams: g });
  };

  const submitManual = () => {
    const name = manual.name.trim();
    const g = parsePositive(manual.grams);
    if (!name || g === null) return;
    const nutrients: Record<string, number> = {};
    for (const [key, raw] of Object.entries(manualNutrients)) {
      const n = parseNonNegative(raw);
      if (n !== undefined) nutrients[key] = n;
    }
    addItem.mutate({
      foodName: name,
      grams: g,
      kcal: parseNonNegative(manual.kcal),
      proteinG: parseNonNegative(manual.proteinG),
      carbsG: parseNonNegative(manual.carbsG),
      fatG: parseNonNegative(manual.fatG),
      nutrients: Object.keys(nutrients).length > 0 ? nutrients : undefined,
    });
  };

  const title = mealId ? 'Adicionar item' : 'Nova refeição';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>
            {mode === 'manual'
              ? 'Informe nome e macros do alimento.'
              : 'Busque um alimento da TACO ou seus customs.'}
          </DrawerDescription>
        </DrawerHeader>

        {mode === 'manual' ? (
          <ManualForm
            values={manual}
            onChange={setManual}
            nutrientTargets={(targets.data ?? []).map((t) => ({
              key: t.nutrientKey,
              label: t.label,
              unit: t.unit,
            }))}
            nutrientValues={manualNutrients}
            onNutrientChange={(key, v) => setManualNutrients((prev) => ({ ...prev, [key]: v }))}
            onSubmit={submitManual}
            onBack={() => {
              setMode('search');
              addItem.reset();
            }}
            isSubmitting={addItem.isPending}
            error={addItem.error?.message}
          />
        ) : selected ? (
          <SelectedFoodPanel
            food={selected}
            grams={grams}
            onGramsChange={setGrams}
            preview={preview}
            onBack={() => {
              setSelected(null);
              addItem.reset();
            }}
            onSubmit={submitFromSearch}
            isSubmitting={addItem.isPending}
            error={addItem.error?.message}
          />
        ) : (
          <SearchPanel
            q={q}
            onQChange={setQ}
            debounced={debounced}
            isFetching={search.isFetching}
            isError={search.isError}
            onRetry={() => search.refetch()}
            data={search.data}
            onPick={setSelected}
            onSwitchToManual={() => setMode('manual')}
          />
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

interface SearchPanelProps {
  q: string;
  onQChange: (v: string) => void;
  debounced: string;
  isFetching: boolean;
  isError: boolean;
  onRetry: () => void;
  data: Food[] | undefined;
  onPick: (food: Food) => void;
  onSwitchToManual: () => void;
}

function SearchPanel({
  q,
  onQChange,
  debounced,
  isFetching,
  isError,
  onRetry,
  data,
  onPick,
  onSwitchToManual,
}: SearchPanelProps) {
  return (
    <>
      <div className="relative my-3">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          autoFocus
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="Ex.: arroz, frango, banana..."
          className="pl-9"
        />
      </div>
      <ul className="-mx-4 max-h-[55vh] divide-y overflow-y-auto">
        {isFetching && <li className="px-4 py-3 text-sm text-muted-foreground">Buscando...</li>}
        {!isFetching && isError && (
          <li className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-rose-500">Erro ao buscar alimentos.</span>
            <button type="button" onClick={onRetry} className="text-primary underline">
              Tentar novamente
            </button>
          </li>
        )}
        {!isFetching && !isError && debounced.length < 2 && (
          <li className="px-4 py-3 text-sm text-muted-foreground">
            Digite pelo menos 2 caracteres.
          </li>
        )}
        {!isFetching && !isError && data?.length === 0 && (
          <li className="px-4 py-3 text-sm text-muted-foreground">Nenhum resultado.</li>
        )}
        {data?.map((food) => (
          <li key={food.id}>
            <button
              type="button"
              onClick={() => onPick(food)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent"
            >
              <div>
                <p className="text-sm font-medium">{food.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(food.kcalPer100g)} kcal/100g · P{Math.round(food.proteinPer100g)} · C
                  {Math.round(food.carbsPer100g)} · G{Math.round(food.fatPer100g)}
                </p>
              </div>
              <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase">{food.source}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onSwitchToManual}
        className="mt-3 w-full text-sm text-primary underline"
      >
        Não achei, inserir manualmente
      </button>
    </>
  );
}

interface SelectedFoodPanelProps {
  food: Food;
  grams: string;
  onGramsChange: (v: string) => void;
  preview: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | undefined;
}

function SelectedFoodPanel({
  food,
  grams,
  onGramsChange,
  preview,
  onBack,
  onSubmit,
  isSubmitting,
  error,
}: SelectedFoodPanelProps) {
  const canSubmit = parsePositive(grams) !== null;
  return (
    <div className="my-3 space-y-4">
      <div className="rounded-lg border p-3">
        <p className="text-sm font-medium">{food.name}</p>
        <p className="text-xs text-muted-foreground">{Math.round(food.kcalPer100g)} kcal/100g</p>
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
          onChange={(e) => onGramsChange(e.target.value)}
          min={0}
          step={1}
        />
      </div>
      {preview && (
        <p className="text-sm tabular-nums text-muted-foreground">
          Total: {preview.kcal} kcal · P{preview.proteinG} · C{preview.carbsG} · G{preview.fatG}
        </p>
      )}
      {error && <p className="text-sm text-rose-500">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Voltar
        </Button>
        <Button className="flex-1" onClick={onSubmit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? 'Salvando...' : 'Adicionar'}
        </Button>
      </div>
    </div>
  );
}

type ManualValues = typeof INITIAL_MANUAL;

interface NutrientField {
  key: string;
  label: string;
  unit: string;
}

interface ManualFormProps {
  values: ManualValues;
  onChange: (values: ManualValues) => void;
  nutrientTargets: NutrientField[];
  nutrientValues: Record<string, string>;
  onNutrientChange: (key: string, value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
  error: string | undefined;
}

function ManualForm({
  values,
  onChange,
  nutrientTargets,
  nutrientValues,
  onNutrientChange,
  onSubmit,
  onBack,
  isSubmitting,
  error,
}: ManualFormProps) {
  const set = (key: keyof ManualValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [key]: e.target.value });

  const canSubmit = values.name.trim().length > 0 && parsePositive(values.grams) !== null;
  const kcalValue = parseNonNegative(values.kcal);
  const noKcal = canSubmit && (kcalValue === undefined || kcalValue === 0);

  return (
    <div className="my-3 space-y-3">
      <div className="space-y-1">
        <label htmlFor="manual-name" className="text-sm font-medium">
          Nome
        </label>
        <Input
          id="manual-name"
          autoFocus
          value={values.name}
          onChange={set('name')}
          placeholder="Ex.: salada de frutas caseira"
          maxLength={160}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="manual-grams" className="text-sm font-medium">
          Gramas
        </label>
        <Input
          id="manual-grams"
          type="number"
          inputMode="decimal"
          value={values.grams}
          onChange={set('grams')}
          min={0}
          step={1}
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <ManualMacro id="manual-kcal" label="kcal" value={values.kcal} onChange={set('kcal')} />
        <ManualMacro
          id="manual-p"
          label="P (g)"
          value={values.proteinG}
          onChange={set('proteinG')}
        />
        <ManualMacro id="manual-c" label="C (g)" value={values.carbsG} onChange={set('carbsG')} />
        <ManualMacro id="manual-g" label="G (g)" value={values.fatG} onChange={set('fatG')} />
      </div>
      {noKcal && (
        <p className="text-xs text-amber-500">
          Sem calorias informadas — o item será salvo, mas não afetará seu resumo de kcal.
        </p>
      )}

      {nutrientTargets.length > 0 && (
        <div className="space-y-2 rounded-lg border border-white/5 bg-muted/30 p-3">
          <p className="text-xs font-bold text-muted-foreground">Metas personalizadas (opcional)</p>
          <div className="grid grid-cols-3 gap-2">
            {nutrientTargets.map((n) => (
              <div key={n.key} className="space-y-1">
                <label
                  htmlFor={`nut-${n.key}`}
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  {n.label} ({n.unit})
                </label>
                <Input
                  id={`nut-${n.key}`}
                  type="number"
                  inputMode="decimal"
                  value={nutrientValues[n.key] ?? ''}
                  onChange={(e) => onNutrientChange(n.key, e.target.value)}
                  min={0}
                  step={1}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-rose-500">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Voltar
        </Button>
        <Button className="flex-1" onClick={onSubmit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? 'Salvando...' : 'Adicionar'}
        </Button>
      </div>
    </div>
  );
}

interface ManualMacroProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function ManualMacro({ id, label, value, onChange }: ManualMacroProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        min={0}
        step={1}
      />
    </div>
  );
}
