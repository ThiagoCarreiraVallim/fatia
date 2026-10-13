'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, Star } from 'lucide-react';
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
  initialAmount,
  nutritionApi,
  shortcutDetail,
  withFavorite,
  type Amount,
  type Food,
  type FoodPortion,
  type FoodShortcut,
  type FoodShortcuts,
  type MealType,
} from '@fatia/api-client';
import { instanteNoDia } from '@/lib/dias';
import { AmountPicker } from './amount-picker';

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
  grams?: number;
  portionId?: string;
  quantity?: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  nutrients?: Record<string, number>;
}

const INITIAL_AMOUNT: Amount = { kind: 'grams', grams: '100' };

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
  const [amount, setAmount] = useState<Amount>(INITIAL_AMOUNT);
  // As medidas do alimento escolhido, mais as que a pessoa criar sem fechar o drawer.
  const [portions, setPortions] = useState<FoodPortion[]>([]);
  const [manual, setManual] = useState(INITIAL_MANUAL);
  const [manualNutrients, setManualNutrients] = useState<Record<string, string>>({});
  // Vários itens por abertura: o primeiro cria a refeição, os seguintes entram nela.
  const [createdMealId, setCreatedMealId] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const qc = useQueryClient();
  const targetMealId = mealId ?? createdMealId;

  // Metas de nutrientes ativas: o item manual pode informar esses nutrientes (ADR 009).
  const targets = useQuery({
    queryKey: ['nutrition', 'nutrient-targets'],
    queryFn: () => nutritionApi.nutrientTargets(),
    enabled: open,
  });

  // Ajuste durante o render, e não num efeito (#187). A comparação é a mesma que
  // estava no array de dependências, então a limpeza acontece no mesmo fechamento
  // — só que antes de pintar. Não há passagem de montagem porque cada `useState`
  // acima já parte destes mesmos valores: no efeito, a rodada de montagem era um
  // no-op.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setMode('search');
      setQ('');
      setDebounced('');
      setSelected(null);
      setAmount(INITIAL_AMOUNT);
      setPortions([]);
      setManual(INITIAL_MANUAL);
      setManualNutrients({});
      setCreatedMealId(null);
      setAdded([]);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ['nutrition', 'search', debounced],
    queryFn: () => nutritionApi.searchFoods(debounced, 20),
    enabled: open && mode === 'search' && debounced.trim().length >= 2,
  });

  const myFoodsKey = ['nutrition', 'my-foods', mealType ?? null] as const;
  const shortcuts = useQuery({
    queryKey: myFoodsKey,
    queryFn: () => nutritionApi.myFoods(mealType),
    enabled: open,
  });
  const favoriteIds = useMemo(
    () => new Set((shortcuts.data?.favorites ?? []).map((f) => f.id)),
    [shortcuts.data],
  );

  // Otimista: a estrela responde no toque, e o servidor confirma depois.
  const favorite = useMutation<void, Error, { food: Food; favorite: boolean }>({
    mutationFn: ({ food, favorite }) => nutritionApi.setFavorite(food.id, favorite),
    onMutate: ({ food, favorite }) => {
      qc.setQueryData<FoodShortcuts>(myFoodsKey, (prev) => withFavorite(prev, food, favorite));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] }),
  });

  const addItem = useMutation<{ id?: string } | unknown, Error, ItemPayload & { label: string }>({
    mutationFn: ({ label: _label, ...payload }) => {
      if (targetMealId) return nutritionApi.addItem(targetMealId, payload);
      return nutritionApi.createMeal({
        mealType: mealType ?? 'SNACK',
        eatenAt: instanteNoDia(date),
        items: [payload],
      });
    },
    onSuccess: (result, { label }) => {
      if (!targetMealId) {
        const id = (result as { id?: string } | undefined)?.id;
        if (id) setCreatedMealId(id);
      }
      qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
      setAdded((prev) => [...prev, label]);
      // De volta aos atalhos, pronto para o próximo item.
      setMode('search');
      setSelected(null);
      setQ('');
      setDebounced('');
      setAmount(INITIAL_AMOUNT);
      setPortions([]);
      setManual(INITIAL_MANUAL);
      setManualNutrients({});
    },
  });

  const createPortion = async (label: string, grams: number) => {
    if (!selected) throw new Error('Sem alimento');
    const created = await nutritionApi.createPortion(selected.id, { label, grams });
    setPortions((prev) => [...prev, created]);
    // Busca e atalhos guardaram o alimento sem a medida nova.
    qc.invalidateQueries({ queryKey: ['nutrition', 'search'] });
    qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
    return created;
  };

  const pick = (food: Food | FoodShortcut) => {
    addItem.reset();
    setSelected(food);
    setPortions(food.portions ?? []);
    setAmount(initialAmount(food));
  };

  const grams = selected ? amountGrams(amount, portions) : null;

  const preview = useMemo(() => {
    if (!selected) return null;
    const g = grams;
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
    if (!selected || grams === null) return;
    addItem.mutate({ foodId: selected.id, ...amountPayload(amount), label: selected.name });
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
      label: name,
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
              : 'Toque num atalho ou busque. Dá para adicionar vários.'}
          </DrawerDescription>
        </DrawerHeader>

        {added.length > 0 && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            <Check size={16} aria-hidden />
            <span>{`${added[added.length - 1]} adicionado`}</span>
          </p>
        )}

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
            favorite={favoriteIds.has(selected.id)}
            onToggleFavorite={() =>
              favorite.mutate({ food: selected, favorite: !favoriteIds.has(selected.id) })
            }
            picker={
              <AmountPicker
                portions={portions}
                amount={amount}
                onChange={setAmount}
                onCreatePortion={createPortion}
              />
            }
            canSubmit={grams !== null}
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
            shortcuts={shortcuts.data}
            favoriteIds={favoriteIds}
            onToggleFavorite={(food) =>
              favorite.mutate({ food, favorite: !favoriteIds.has(food.id) })
            }
            onPick={pick}
            onSwitchToManual={() => {
              addItem.reset();
              setMode('manual');
            }}
          />
        )}

        {added.length > 0 ? (
          <Button className="mt-2 w-full" onClick={() => onOpenChange(false)}>
            Concluir · {added.length} {added.length === 1 ? 'item' : 'itens'}
          </Button>
        ) : (
          <DrawerClose asChild>
            <Button variant="ghost" className="mt-2 w-full">
              Cancelar
            </Button>
          </DrawerClose>
        )}
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
  shortcuts: FoodShortcuts | undefined;
  favoriteIds: ReadonlySet<number>;
  onToggleFavorite: (food: Food) => void;
  onPick: (food: Food | FoodShortcut) => void;
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
  shortcuts,
  favoriteIds,
  onToggleFavorite,
  onPick,
  onSwitchToManual,
}: SearchPanelProps) {
  const typing = debounced.trim().length >= 2;
  const hasShortcuts = !!shortcuts && shortcuts.favorites.length + shortcuts.recent.length > 0;

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
        {!typing && !hasShortcuts && (
          <li className="px-4 py-3 text-sm text-muted-foreground">
            Digite pelo menos 2 caracteres. O que você registrar aparece aqui, a um toque.
          </li>
        )}
        {!typing && hasShortcuts && (
          <>
            <ShortcutSection
              title="Favoritos"
              foods={shortcuts.favorites}
              favoriteIds={favoriteIds}
              onPick={onPick}
              onToggleFavorite={onToggleFavorite}
            />
            <ShortcutSection
              title="Recentes"
              foods={shortcuts.recent}
              favoriteIds={favoriteIds}
              onPick={onPick}
              onToggleFavorite={onToggleFavorite}
            />
          </>
        )}
        {typing && !isFetching && !isError && data?.length === 0 && (
          <li className="px-4 py-3 text-sm text-muted-foreground">Nenhum resultado.</li>
        )}
        {typing &&
          data?.map((food) => (
            <FoodRow
              key={food.id}
              food={food}
              favorite={favoriteIds.has(food.id)}
              onPick={() => onPick(food)}
              onToggleFavorite={() => onToggleFavorite(food)}
              detail={`${Math.round(food.kcalPer100g)} kcal/100g · P${Math.round(food.proteinPer100g)} · C${Math.round(food.carbsPer100g)} · G${Math.round(food.fatPer100g)}`}
            />
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

function ShortcutSection({
  title,
  foods,
  favoriteIds,
  onPick,
  onToggleFavorite,
}: {
  title: string;
  foods: FoodShortcut[];
  favoriteIds: ReadonlySet<number>;
  onPick: (food: Food, lastGrams?: number | null) => void;
  onToggleFavorite: (food: Food) => void;
}) {
  if (foods.length === 0) return null;
  return (
    <li>
      <h3 className="px-4 pt-3 pb-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <ul aria-label={title} className="divide-y">
        {foods.map((food) => (
          <FoodRow
            key={food.id}
            food={food}
            favorite={favoriteIds.has(food.id)}
            onPick={() => onPick(food)}
            onToggleFavorite={() => onToggleFavorite(food)}
            detail={shortcutDetail(food)}
          />
        ))}
      </ul>
    </li>
  );
}

/** Linha da lista: escolher e favoritar são alvos separados (botão dentro de botão não vale). */
function FoodRow({
  food,
  favorite,
  detail,
  onPick,
  onToggleFavorite,
}: {
  food: Food;
  favorite: boolean;
  detail: string;
  onPick: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={onPick}
        className="flex min-h-14 flex-1 items-center justify-between gap-2 py-3 pl-4 text-left hover:bg-accent"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">{food.name}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{detail}</p>
        </div>
        {food.source === 'CUSTOM' && (
          <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[10px] uppercase">Meu</span>
        )}
      </button>
      <FavoriteButton name={food.name} favorite={favorite} onToggle={onToggleFavorite} />
    </li>
  );
}

function FavoriteButton({
  name,
  favorite,
  onToggle,
}: {
  name: string;
  favorite: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${favorite ? 'Desfavoritar' : 'Favoritar'} ${name}`}
      aria-pressed={favorite}
      className="flex h-12 w-12 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
    >
      <Star
        size={18}
        className={favorite ? 'fill-amber-400 text-amber-400' : undefined}
        aria-hidden
      />
    </button>
  );
}

interface SelectedFoodPanelProps {
  food: Food;
  favorite: boolean;
  onToggleFavorite: () => void;
  picker: React.ReactNode;
  canSubmit: boolean;
  preview: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | undefined;
}

function SelectedFoodPanel({
  food,
  favorite,
  onToggleFavorite,
  picker,
  canSubmit,
  preview,
  onBack,
  onSubmit,
  isSubmitting,
  error,
}: SelectedFoodPanelProps) {
  return (
    <div className="my-3 space-y-4">
      <div className="flex items-center rounded-lg border pl-3">
        <div className="flex-1 py-3">
          <p className="text-sm font-medium">{food.name}</p>
          <p className="text-xs text-muted-foreground">{Math.round(food.kcalPer100g)} kcal/100g</p>
        </div>
        <FavoriteButton name={food.name} favorite={favorite} onToggle={onToggleFavorite} />
      </div>
      {picker}
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
