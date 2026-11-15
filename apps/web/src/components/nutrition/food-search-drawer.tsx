'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, Mic, Plus, ScanLine, Search, Star, Trash2, X } from 'lucide-react';
import { useAiMenu } from '@/components/layout/ai-menu';
import { headerButtonClass } from '@/components/layout/tab-header';
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
  addTargetLabel,
  mealForLabel,
  amountGrams,
  amountPayload,
  emptyCustomFoodForm,
  emptySearchCopy,
  foodAmountPreview,
  foodOriginTag,
  initialAmount,
  isSearching,
  nutritionApi,
  parseDecimalInput,
  resultsCaption,
  shortcutLine,
  templateSummary,
  withFavorite,
  type Amount,
  type AmountPreview,
  type CustomFoodForm as CustomFoodValues,
  type CustomFoodInput,
  type Food,
  type FoodPortion,
  type FoodShortcut,
  type FoodShortcuts,
  type MealTemplate,
  type MealType,
} from '@fatia/api-client';
import { instanteNoDia } from '@/lib/dias';
import { cn } from '@/lib/utils';
import { AmountPicker } from './amount-picker';
import { BarcodeFlow } from './barcode-flow';
import { CustomFoodForm } from './custom-food-form';
import { MEAL_CONFLICT_MESSAGE, errorMessage } from './error-message';
import { invalidateNutritionDay } from '@/lib/nutrition-cache';

const MEAL_TYPES: MealType[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'];
const MEAL_CHIP_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Café',
  LUNCH: 'Almoço',
  SNACK: 'Lanche',
  DINNER: 'Jantar',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se mealId for passado, adiciona item ao meal. Caso contrário cria nova refeição. */
  mealId?: string;
  mealType?: MealType;
  date: string;
  /**
   * `'scan'` abre direto no leitor: é o atalho do topo da Nutrição, para quem
   * está com a embalagem na mão (o "Escanear" do cabeçalho do app).
   */
  initialMode?: 'scan';
}

type Mode = 'search' | 'manual' | 'create' | 'scan';

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
  source?: 'BARCODE';
}

type BrowseTab = 'recent' | 'favorites' | 'templates' | 'mine';

const INITIAL_AMOUNT: Amount = { kind: 'grams', grams: '100' };

const INITIAL_MANUAL = { name: '', grams: '100', kcal: '', proteinG: '', carbsG: '', fatG: '' };

// Vírgula decimal ("1,5") vale como no resto do app.
function parsePositive(value: string): number | null {
  const n = parseDecimalInput(value);
  return n !== null && n > 0 ? n : null;
}

function parseNonNegative(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  return parseDecimalInput(value) ?? undefined;
}

export function FoodSearchDrawer({
  open,
  onOpenChange,
  mealId,
  mealType: mealTypeProp,
  date,
  initialMode,
}: Props) {
  // "Para" (prancha Al-N15): a pessoa troca a refeição antes do primeiro item.
  const [chosenType, setChosenType] = useState<MealType | null>(null);
  const mealType = chosenType ?? mealTypeProp;
  const startMode: Mode = initialMode ?? 'search';
  const [mode, setMode] = useState<Mode>(startMode);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [amount, setAmount] = useState<Amount>(INITIAL_AMOUNT);
  // As medidas do alimento escolhido, mais as que a pessoa criar sem fechar o drawer.
  const [portions, setPortions] = useState<FoodPortion[]>([]);
  const [manual, setManual] = useState(INITIAL_MANUAL);
  // O formulário de alimento próprio já preenchido: com o nome que a busca
  // tinha, o código que não foi achado ou o que a IA leu no rótulo.
  const [createInitial, setCreateInitial] = useState<CustomFoodValues>(() => emptyCustomFoodForm());
  // O alimento escolhido veio do código de barras (um alimento seu, vinculado).
  const [pickedByBarcode, setPickedByBarcode] = useState(false);
  const [savedOnly, setSavedOnly] = useState<string | null>(null);
  // O cadastro aberto pelo leitor: o item que ele registrar entra com origem BARCODE.
  const [createFromScan, setCreateFromScan] = useState(false);
  const [manualNutrients, setManualNutrients] = useState<Record<string, string>>({});
  // Vários itens por abertura: o primeiro cria a refeição, os seguintes entram nela.
  const [createdMealId, setCreatedMealId] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const qc = useQueryClient();
  const aiMenu = useAiMenu();
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
      setMode(startMode);
      setQ('');
      setDebounced('');
      setSelected(null);
      setAmount(INITIAL_AMOUNT);
      setPortions([]);
      setManual(INITIAL_MANUAL);
      setCreateInitial(emptyCustomFoodForm());
      setPickedByBarcode(false);
      setSavedOnly(null);
      setCreateFromScan(false);
      setManualNutrients({});
      setCreatedMealId(null);
      setAdded([]);
      setChosenType(null);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ['nutrition', 'search', debounced],
    queryFn: () => nutritionApi.searchFoods(debounced, 20),
    enabled: open && mode === 'search' && isSearching(debounced),
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

  // Refeição salva registra a refeição inteira: só faz sentido ao criar uma nova.
  const customFoods = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
    enabled: open,
  });

  const templates = useQuery({
    queryKey: ['nutrition', 'meal-templates'],
    queryFn: () => nutritionApi.mealTemplates(),
    enabled: open && !mealId,
  });

  const logTemplate = useMutation<unknown, Error, MealTemplate>({
    mutationFn: (template) =>
      nutritionApi.logMealTemplate(template.id, {
        eatenAt: instanteNoDia(date),
        mealType,
      }),
    onSuccess: () => {
      // O dashboard entra junto: a refeição pode vir do "+", fora da Nutrição.
      invalidateNutritionDay(qc, date);
      qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
      onOpenChange(false);
    },
  });

  const deleteTemplate = useMutation<void, Error, string>({
    mutationFn: (id) => nutritionApi.deleteMealTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition', 'meal-templates'] }),
  });

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
      // O dashboard entra junto: a refeição pode vir do "+", fora da Nutrição.
      invalidateNutritionDay(qc, date);
      qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
      setAdded((prev) => [...prev, label]);
      // De volta ao começo, pronto para o próximo item: os atalhos, ou o leitor
      // para quem abriu pelo atalho de escanear (a próxima embalagem).
      setMode(startMode);
      setSelected(null);
      setPickedByBarcode(false);
      setSavedOnly(null);
      setQ('');
      setDebounced('');
      setAmount(INITIAL_AMOUNT);
      setPortions([]);
      setManual(INITIAL_MANUAL);
      setManualNutrients({});
    },
  });

  // Criou, já escolhe: o alimento cai no seletor de quantidade da refeição aberta.
  // "Só salvar" guarda e volta para a busca; o outro botão já cai na quantidade.
  const createFood = useMutation<Food, Error, { input: CustomFoodInput; register: boolean }>({
    mutationFn: ({ input }) => nutritionApi.createCustomFood(input),
    onSuccess: (food, { register }) => {
      qc.invalidateQueries({ queryKey: ['nutrition', 'search'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'custom-foods'] });
      setMode('search');
      // Cadastrado a partir do leitor (rótulo ou código não achado): o item tem a
      // origem do código, como no app.
      if (register) pick(food, createFromScan);
      else setSavedOnly(food.name);
    },
  });

  const startCreateWith = (initial: CustomFoodValues, fromScan = false) => {
    addItem.reset();
    createFood.reset();
    setSavedOnly(null);
    setCreateInitial(initial);
    setCreateFromScan(fromScan);
    setMode('create');
  };
  const startCreate = (name: string) => startCreateWith(emptyCustomFoodForm(name));

  const createPortion = async (label: string, grams: number) => {
    if (!selected) throw new Error('Sem alimento');
    const created = await nutritionApi.createPortion(selected.id, { label, grams });
    setPortions((prev) => [...prev, created]);
    // Busca e atalhos guardaram o alimento sem a medida nova.
    qc.invalidateQueries({ queryKey: ['nutrition', 'search'] });
    qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
    return created;
  };

  const pick = (food: Food | FoodShortcut, byBarcode = false) => {
    addItem.reset();
    setSavedOnly(null);
    setPickedByBarcode(byBarcode);
    setSelected(food);
    setPortions(food.portions ?? []);
    setAmount(initialAmount(food));
  };

  const grams = selected ? amountGrams(amount, portions) : null;

  const preview = selected ? foodAmountPreview(selected, grams) : null;

  const submitFromSearch = () => {
    if (!selected || grams === null) return;
    addItem.mutate({
      foodId: selected.id,
      ...amountPayload(amount),
      ...(pickedByBarcode ? { source: 'BARCODE' as const } : {}),
      label: selected.name,
    });
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

  // 409 aqui é registro repetido: a mensagem diz que já está salvo, para a
  // pessoa não tentar de novo.
  const addError = addItem.error
    ? errorMessage(addItem.error, {
        conflict: targetMealId
          ? 'Esse item já foi registrado nessa refeição.'
          : MEAL_CONFLICT_MESSAGE,
        fallback: 'Não foi possível salvar. Tente de novo.',
      })
    : undefined;
  const templateError = logTemplate.error ?? deleteTemplate.error;

  const title = mealId ? 'Adicionar item' : 'Nova refeição';
  const browsing = mode === 'search' && !selected;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* A busca é a tela "Adicionar" da prancha (Al-N15): fundo da página,
        alta, com os blocos em --s1. Quantidade e o resto seguem como folha. */}
      <DrawerContent
        className={cn('px-4 pb-6', (browsing || mode === 'create') && 'h-[92vh] bg-background')}
      >
        {mode === 'create' ? (
          // Novo alimento (prancha Al-N11): o "x" volta para a busca.
          <DrawerHeader className="flex flex-row items-center gap-3 px-0 pt-2">
            <button
              type="button"
              aria-label="Voltar para a busca"
              onClick={() => setMode('search')}
              className={headerButtonClass()}
            >
              <X size={20} aria-hidden />
            </button>
            <DrawerTitle className="flex-1 pr-14 text-center text-[15px] font-bold">
              Novo alimento
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Copie o rótulo. O alimento fica salvo em Meus alimentos.
            </DrawerDescription>
          </DrawerHeader>
        ) : browsing ? (
          // Cabeçalho da busca (prancha Al-N15): fechar, "Adicionar" e quantos
          // itens já entraram.
          <DrawerHeader className="flex flex-row items-center gap-3 px-0 pt-2">
            <DrawerClose asChild>
              <button type="button" aria-label="Fechar" className={headerButtonClass()}>
                <X size={20} aria-hidden />
              </button>
            </DrawerClose>
            <DrawerTitle className="flex-1 text-center text-[15px] font-bold">
              {mealId ? 'Adicionar item' : 'Adicionar'}
            </DrawerTitle>
            <span
              aria-label={`${added.length} ${added.length === 1 ? 'item adicionado' : 'itens adicionados'}`}
              className={cn(
                'inline-flex h-[22px] min-w-11 items-center justify-center rounded-pill px-2.5 text-[11px] font-extrabold tabular-nums',
                added.length > 0
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-3 text-muted-foreground',
              )}
            >
              {added.length}
            </span>
            <DrawerDescription className="sr-only">
              Toque num atalho ou busque. Dá para adicionar vários.
            </DrawerDescription>
          </DrawerHeader>
        ) : selected && mode === 'search' ? (
          <DrawerHeader className="sr-only">
            <DrawerTitle>Quantidade</DrawerTitle>
            <DrawerDescription>{selected.name}</DrawerDescription>
          </DrawerHeader>
        ) : (
          <DrawerHeader className="px-0">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>
              {mode === 'manual'
                ? 'Só para esta refeição: informe nome e macros.'
                : 'Aponte a câmera para as barras ou digite o código.'}
            </DrawerDescription>
          </DrawerHeader>
        )}

        {browsing && !mealId && createdMealId === null && (
          <div
            role="radiogroup"
            aria-label="Para qual refeição"
            className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1"
          >
            <span className="w-9 shrink-0 text-xs text-muted-foreground">Para</span>
            {MEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={mealType === t}
                onClick={() => setChosenType(t)}
                className={cn(
                  'anim-press h-9 shrink-0 rounded-chip px-3.5 text-sm font-semibold',
                  mealType === t
                    ? 'bg-foreground text-background'
                    : 'bg-card text-muted-foreground',
                )}
              >
                {MEAL_CHIP_LABEL[t]}
              </button>
            ))}
          </div>
        )}

        {savedOnly && added.length === 0 && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            <Check size={16} aria-hidden />
            <span>{`${savedOnly} salvo em Meus alimentos`}</span>
          </p>
        )}

        {added.length > 0 && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            <Check size={16} aria-hidden />
            <span>{`${added[added.length - 1]} adicionado`}</span>
          </p>
        )}

        {mode === 'scan' ? (
          <BarcodeFlow
            onAdd={(payload) => addItem.mutate(payload)}
            adding={addItem.isPending}
            addError={addError}
            addedCount={added.length}
            onCreateManually={(barcode) =>
              startCreateWith({ ...emptyCustomFoodForm(), barcode }, true)
            }
            onPickOwn={(food) => {
              setMode('search');
              pick(food, true);
            }}
            onLabelRead={(form) => startCreateWith(form, true)}
            onBack={() => setMode('search')}
          />
        ) : mode === 'create' ? (
          <CustomFoodForm
            initial={createInitial}
            submitLabel="Salvar e registrar"
            pending={createFood.isPending}
            error={createFood.error?.message}
            onSubmit={(input) => createFood.mutate({ input, register: true })}
            saveOnly={{
              label: 'Só salvar',
              onSubmit: (input) => createFood.mutate({ input, register: false }),
            }}
            onCancel={() => setMode('search')}
          />
        ) : mode === 'manual' ? (
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
            error={addError}
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
            submitLabel={addTargetLabel(mealType)}
            forLabel={mealForLabel(mealType)}
            onBack={() => {
              setSelected(null);
              addItem.reset();
            }}
            onSubmit={submitFromSearch}
            isSubmitting={addItem.isPending}
            error={addError}
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
            customFoods={customFoods.data ?? []}
            templates={mealId ? [] : (templates.data ?? [])}
            onLogTemplate={(template) => logTemplate.mutate(template)}
            onDeleteTemplate={(template) => deleteTemplate.mutate(template.id)}
            templateError={templateError ? errorMessage(templateError) : undefined}
            onPick={pick}
            onSwitchToManual={() => {
              addItem.reset();
              setMode('manual');
            }}
            onCreate={startCreate}
            onScan={() => {
              addItem.reset();
              setMode('scan');
            }}
            onTalkToAi={() => {
              onOpenChange(false);
              aiMenu.open();
            }}
          />
        )}

        {browsing && (
          // O fim da busca (prancha Al-N15): "Criar" e o botão de concluir, que
          // só acende depois do primeiro item.
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => startCreate(q.trim())}
              className="anim-press inline-flex h-14 shrink-0 items-center gap-2 rounded-pill bg-card px-[18px] text-[15px] font-bold"
            >
              <Plus size={16} aria-hidden />
              Criar
            </button>
            <button
              type="button"
              disabled={added.length === 0}
              onClick={() => onOpenChange(false)}
              className={cn(
                'anim-press h-14 flex-1 rounded-pill text-[15px] font-bold',
                added.length > 0
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground',
              )}
            >
              {added.length > 0
                ? `Concluir · ${added.length} ${added.length === 1 ? 'item' : 'itens'}`
                : 'Selecione os itens'}
            </button>
          </div>
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
  customFoods: Food[];
  templates: MealTemplate[];
  onLogTemplate: (template: MealTemplate) => void;
  onDeleteTemplate: (template: MealTemplate) => void;
  templateError?: string;
  onPick: (food: Food | FoodShortcut) => void;
  onSwitchToManual: () => void;
  onCreate: (name: string) => void;
  onScan: () => void;
  /** Fecha a busca e abre o menu da IA (ditar a refeição). */
  onTalkToAi?: () => void;
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
  customFoods,
  templates,
  onLogTemplate,
  onDeleteTemplate,
  templateError,
  onPick,
  onSwitchToManual,
  onCreate,
  onScan,
  onTalkToAi,
}: SearchPanelProps) {
  const typing = isSearching(debounced);
  const [tab, setTab] = useState<BrowseTab>('recent');
  // Ao registrar numa refeição aberta, "Salvas" (a refeição inteira) não cabe.
  const tabs: Array<[BrowseTab, string]> = [
    ['recent', 'Recentes'],
    ['favorites', 'Favoritos'],
    ...(templates.length > 0 ? [['templates', 'Salvas'] as [BrowseTab, string]] : []),
    ['mine', 'Meus'],
  ];
  const browseFoods: Food[] =
    tab === 'recent'
      ? (shortcuts?.recent ?? [])
      : tab === 'favorites'
        ? (shortcuts?.favorites ?? [])
        : tab === 'mine'
          ? customFoods
          : [];
  const emptyTab: Record<BrowseTab, string> = {
    recent: 'O que você registrar aparece aqui, a um toque.',
    favorites: 'Toque na estrela de um alimento para ele morar aqui.',
    templates: 'Nenhuma refeição salva.',
    mine: 'Seus alimentos aparecem aqui: o produto embalado, a receita de casa.',
  };

  return (
    <>
      <div className="mt-3 flex gap-2">
        <label className="flex h-[52px] min-w-0 flex-1 items-center gap-2 rounded-pill bg-card px-4 shadow-[inset_0_0_0_1.5px_transparent] focus-within:shadow-[inset_0_0_0_1.5px_hsl(var(--primary))]">
          <Search size={16} className="shrink-0 text-faint" aria-hidden />
          <input
            aria-label="Buscar alimento"
            autoFocus
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            placeholder="Arroz, frango, banana…"
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-faint"
          />
        </label>
        <button
          type="button"
          onClick={onScan}
          aria-label="Ler código ou rótulo"
          title="Ler código ou rótulo"
          className="anim-press flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-pill bg-muted text-foreground"
        >
          <ScanLine size={20} aria-hidden />
        </button>
      </div>
      {!typing && onTalkToAi && (
        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            onClick={onTalkToAi}
            className="anim-press flex h-12 flex-1 items-center justify-center gap-2 rounded-pill bg-card text-[13px] font-bold"
          >
            <Mic size={16} className="text-primary" aria-hidden />
            Falar com a IA
          </button>
        </div>
      )}
      {!typing && (
        <div
          role="tablist"
          aria-label="Atalhos"
          className="mt-3.5 flex h-11 shrink-0 items-stretch gap-5 overflow-x-auto border-b border-subtle"
        >
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'shrink-0 text-sm font-bold',
                tab === key
                  ? 'text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]'
                  : 'text-muted-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {typing && !isFetching && !isError && (data?.length ?? 0) > 0 && (
        <p className="mt-3.5 px-1 text-xs text-muted-foreground">
          {resultsCaption(data?.length ?? 0)}
        </p>
      )}
      <ul className="mt-3.5 min-h-0 flex-1 shrink divide-y divide-subtle overflow-y-auto rounded-card bg-card px-4 empty:hidden">
        {isFetching && <li className="px-4 py-3 text-sm text-muted-foreground">Buscando...</li>}
        {!isFetching && isError && (
          <li className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-danger">Erro ao buscar alimentos.</span>
            <button type="button" onClick={onRetry} className="min-h-11 text-primary underline">
              Tentar novamente
            </button>
          </li>
        )}
        {!typing && templateError && (
          <li role="alert" className="px-4 py-3 text-sm text-danger">
            {templateError}
          </li>
        )}
        {!typing && tab === 'templates' && (
          <li>
            <ul aria-label="Refeições salvas" className="divide-y">
              {templates.map((template) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  onLog={() => onLogTemplate(template)}
                  onDelete={() => onDeleteTemplate(template)}
                />
              ))}
            </ul>
          </li>
        )}
        {!typing && tab !== 'templates' && browseFoods.length === 0 && (
          <li className="px-4 py-3 text-sm text-muted-foreground">{emptyTab[tab]}</li>
        )}
        {!typing &&
          tab !== 'templates' &&
          browseFoods.map((food) => (
            <FoodRow
              key={food.id}
              food={food}
              onPick={() => onPick(food)}
              {...('lastGrams' in food
                ? shortcutLine(food as FoodShortcut)
                : { detail: '100 g', kcal: food.kcalPer100g })}
            />
          ))}
        {typing && !isFetching && !isError && data?.length === 0 && (
          <li className="space-y-2 px-4 py-3 text-sm">
            <p className="font-medium">{emptySearchCopy(debounced).title}</p>
            <p className="text-xs text-muted-foreground">
              Produto embalado ou receita de casa? Cadastre uma vez e ele aparece aqui.
            </p>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => onCreate(debounced.trim())}
            >
              <Plus size={14} aria-hidden />
              {emptySearchCopy(debounced).action}
            </Button>
          </li>
        )}
        {typing &&
          data?.map((food) => (
            <FoodRow
              key={food.id}
              food={food}
              onPick={() => onPick(food)}
              kcal={food.kcalPer100g}
              detail={`100 g · P ${Math.round(food.proteinPer100g)} · C ${Math.round(food.carbsPer100g)} · G ${Math.round(food.fatPer100g)}`}
              showOrigin
            />
          ))}
      </ul>
      {/* Fora da prancha, mas não some: o item avulso, sem cadastrar alimento.
        O "Criar" fica no rodapé. */}
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={onSwitchToManual}
          className="min-h-9 text-sm font-semibold text-primary"
        >
          Registrar só desta vez
        </button>
      </div>
    </>
  );
}

/** Refeição salva: o toque registra tudo; apagar confirma na própria linha. */
function TemplateRow({
  template,
  onLog,
  onDelete,
}: {
  template: MealTemplate;
  onLog: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={onLog}
        className="min-h-11 flex-1 px-4 py-2 text-left hover:bg-accent"
      >
        <span className="block text-sm">{template.name}</span>
        <span className="block text-xs text-muted-foreground">{templateSummary(template)}</span>
      </button>
      {confirming ? (
        <div className="flex items-center gap-1 pr-2">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            aria-label={`Confirmar apagar ${template.name}`}
            onClick={onDelete}
          >
            Apagar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Não
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Apagar ${template.name}`}
          className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-danger"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      )}
    </li>
  );
}

/** Linha da lista (prancha Al-N15): o toque abre a quantidade (Al-N3), onde fica a estrela. */
function FoodRow({
  food,
  detail,
  kcal,
  onPick,
  showOrigin = false,
}: {
  food: Food;
  detail: string;
  /** As calorias da porção de costume, à direita. */
  kcal: number;
  onPick: () => void;
  /** Na busca, o selo de origem de cada linha (TACO, seu). */
  showOrigin?: boolean;
}) {
  const origin = foodOriginTag(food);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold">{food.name}</span>
            {(showOrigin || food.source === 'CUSTOM') && (
              <span
                className={cn(
                  'inline-flex h-[18px] shrink-0 items-center rounded-pill px-2 text-[11px] font-extrabold uppercase tracking-[0.04em]',
                  origin.tone === 'ok'
                    ? 'bg-primary-soft text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {origin.label}
              </span>
            )}
          </span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">{detail}</span>
        </span>
        <span className="shrink-0 text-sm font-bold tabular-nums">
          {Math.round(kcal)} <span className="text-xs font-medium text-muted-foreground">kcal</span>
        </span>
      </button>
    </li>
  );
}

interface SelectedFoodPanelProps {
  food: Food;
  favorite: boolean;
  onToggleFavorite: () => void;
  picker: React.ReactNode;
  canSubmit: boolean;
  preview: AmountPreview | null;
  submitLabel: string;
  /** "para o jantar". */
  forLabel: string;
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
  submitLabel,
  forLabel,
  onBack,
  onSubmit,
  isSubmitting,
  error,
}: SelectedFoodPanelProps) {
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const origin = foodOriginTag(food);
  const sub = [origin.tone === 'ok' ? 'seu alimento' : origin.label, forLabel]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="mt-2 flex flex-col gap-4">
      {/* Quantidade (prancha Al-N3): nome grande, de onde vem e para onde vai. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Quantidade</span>
          <p className="font-display text-h2 text-foreground">{food.name}</p>
          <span className="text-xs text-muted-foreground">{sub}</span>
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={`${favorite ? 'Desfavoritar' : 'Favoritar'} ${food.name}`}
          aria-pressed={favorite}
          className="anim-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
        >
          <Star
            size={20}
            className={favorite ? 'fill-warning text-warning' : undefined}
            aria-hidden
          />
        </button>
      </div>
      {picker}
      {preview && (
        <>
          <div className="grid grid-cols-4 gap-2 tabular-nums">
            <MacroTile value={String(preview.kcal)} label="kcal" />
            <MacroTile value={fmt(preview.proteinG)} label="prot g" className="text-protein" />
            <MacroTile value={fmt(preview.carbsG)} label="carb g" className="text-carbs" />
            <MacroTile value={fmt(preview.fatG)} label="gord g" className="text-fat" />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {`Fibra ${preview.fiberG === null ? '—' : `${fmt(preview.fiberG)} g`} · Sódio ${preview.sodiumMg === null ? '—' : `${preview.sodiumMg} mg`}`}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="anim-press flex h-14 w-14 shrink-0 items-center justify-center rounded-pill bg-muted"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          className="anim-press h-14 flex-1 rounded-pill bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-40"
        >
          {isSubmitting ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </div>
  );
}

function MacroTile({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[16px] bg-muted px-1 py-2.5">
      <b className={cn('text-lg', className)}>{value}</b>
      <span className="text-xs text-muted-foreground">{label}</span>
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
        <Input id="manual-grams" inputMode="decimal" value={values.grams} onChange={set('grams')} />
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
        <p className="text-xs text-warning">
          Sem calorias informadas — o item será salvo, mas não afetará seu resumo de kcal.
        </p>
      )}

      {nutrientTargets.length > 0 && (
        <div className="space-y-2 rounded-lg border border-subtle bg-muted/30 p-3">
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
                  inputMode="decimal"
                  value={nutrientValues[n.key] ?? ''}
                  onChange={(e) => onNutrientChange(n.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
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
      <Input id={id} inputMode="decimal" value={value} onChange={onChange} />
    </div>
  );
}
