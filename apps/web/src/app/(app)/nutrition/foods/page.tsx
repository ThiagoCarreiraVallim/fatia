'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Apple,
  ChevronRight,
  Info,
  Plus,
  ScanBarcode,
  Search,
  Star,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import {
  customFoodSummary,
  filterMyFoods,
  MY_FOODS_HINT,
  myFoodsEmptySearch,
  myFoodsTabs,
  nutritionApi,
  templateSummary,
  type Food,
  type MealTemplate,
  type MyFoodsTab,
} from '@fatia/api-client';
import { CustomFoodDrawer } from '@/components/nutrition/custom-food-drawer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TopBarActions, topBarActionClass } from '@/components/layout/app-top-bar';
import { cn } from '@/lib/utils';

/** `null` = drawer fechado; `'novo'` = cadastro; alimento = edição. */
type Editing = Food | 'novo' | null;

/**
 * Meus alimentos (Al-N12): os alimentos próprios e as refeições salvas, com
 * busca e abas. Sem a aba "Lidos": o produto lido pelo código não é guardado
 * (ADR 017); o que a pessoa salvou dele já está em "Alimentos".
 */
function CustomFoodsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  // `?novo=1` chega do card vazio e do "Cadastrar à mão" do scanner.
  const [editing, setEditing] = useState<Editing>(params.get('novo') ? 'novo' : null);
  const [tab, setTab] = useState<MyFoodsTab>('all');
  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState<MealTemplate | null>(null);
  const foods = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
  });
  const templates = useQuery({
    queryKey: ['nutrition', 'meal-templates'],
    queryFn: () => nutritionApi.mealTemplates(),
  });
  const removeTemplate = useMutation<void, Error, string>({
    mutationFn: (id) => nutritionApi.deleteMealTemplate(id),
    onSuccess: () => {
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['nutrition', 'meal-templates'] });
    },
  });

  const close = (open: boolean) => {
    if (open) return;
    setEditing(null);
    if (params.get('novo')) router.replace('/nutrition/foods');
  };

  const shown = filterMyFoods(foods.data ?? [], templates.data ?? [], tab, q);
  const nothingSaved =
    foods.data?.length === 0 && (templates.data?.length ?? 0) === 0 && !templates.isLoading;
  const nothingShown = !nothingSaved && shown.foods.length + shown.meals.length === 0;

  return (
    <div className="space-y-4 px-5 pb-28 pt-2" aria-busy={foods.isLoading}>
      <TopBarActions>
        <button
          type="button"
          className={cn(
            topBarActionClass,
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
          aria-label="Novo alimento"
          onClick={() => setEditing('novo')}
        >
          <Plus size={22} aria-hidden />
        </button>
      </TopBarActions>

      <div className="relative">
        <Search
          size={20}
          className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label="Buscar em Meus alimentos"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nos seus"
          className="h-[52px] rounded-pill border-0 bg-card pl-14 text-base"
        />
      </div>

      <div role="tablist" aria-label="O que mostrar" className="flex gap-2">
        {myFoodsTabs().map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'h-11 rounded-chip px-4 text-[15px] font-semibold',
              tab === key ? 'bg-foreground text-background' : 'bg-card text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Carregando, como no app: antes a tela ficava só com o texto de cima. */}
      {foods.isLoading && <Skeleton className="h-28" />}
      {foods.isError && (
        <p role="alert" className="text-sm text-danger">
          Não deu para carregar seus alimentos.{' '}
          <button type="button" className="underline" onClick={() => foods.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {nothingSaved && (
        <EmptyState
          icon={UtensilsCrossed}
          title="Nenhum alimento cadastrado ainda."
          description="Cadastre o que não está na tabela — um produto embalado ou uma receita de casa — e registre em dois toques."
        />
      )}
      {nothingShown && foods.data && (
        <div className="space-y-2 rounded-2xl bg-card p-4 text-sm">
          <p>{q.trim() ? myFoodsEmptySearch(q) : 'Nada nesta aba ainda.'}</p>
          <Button variant="outline" className="min-h-11" onClick={() => setEditing('novo')}>
            <Plus size={14} aria-hidden />
            Cadastrar alimento
          </Button>
        </div>
      )}
      {shown.foods.length > 0 && (
        <ul
          aria-label="Meus alimentos"
          className="divide-y divide-border overflow-hidden rounded-card bg-card"
        >
          {shown.foods.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => setEditing(food)}
                aria-label={`Editar ${food.name}`}
                className="flex min-h-[72px] w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40"
              >
                <FoodTile kind={food.barcode ? 'scanned' : 'food'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold">{food.name}</span>
                  <span className="block text-[15px] text-muted-foreground">
                    {customFoodSummary(food)}
                  </span>
                </span>
                <ChevronRight size={18} className="text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.meals.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] text-muted-foreground">Refeições salvas</h2>
          <ul
            aria-label="Refeições salvas"
            className="divide-y divide-border overflow-hidden rounded-card bg-card"
          >
            {shown.meals.map((template) => (
              <li key={template.id} className="flex min-h-[72px] items-center gap-4 pl-4">
                <FoodTile kind="meal" />
                <span className="min-w-0 flex-1 py-3">
                  <span className="block truncate text-[17px] font-semibold">{template.name}</span>
                  <span className="block text-[15px] text-muted-foreground">
                    {templateSummary(template)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Apagar ${template.name}`}
                  onClick={() => setDeleting(template)}
                  className="flex h-12 w-12 items-center justify-center text-muted-foreground hover:text-danger"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* O que cabe aqui, embaixo da lista como na prancha. */}
      {!nothingSaved && (
        <p className="flex gap-3 rounded-card bg-card px-4 py-4 text-sm text-muted-foreground">
          <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>{MY_FOODS_HINT} Cadastre uma vez e registre como qualquer alimento.</span>
        </p>
      )}

      <CustomFoodDrawer
        open={editing !== null}
        onOpenChange={close}
        food={editing === 'novo' ? null : editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Apagar "${deleting?.name ?? ''}"?`}
        description="Some dos atalhos. As refeições já registradas continuam como estão."
        confirmLabel="Apagar"
        pending={removeTemplate.isPending}
        onConfirm={() => deleting && removeTemplate.mutate(deleting.id)}
      />
    </div>
  );
}

/** O quadradinho da prancha: maçã (alimento), código (lido) ou estrela (refeição). */
function FoodTile({ kind }: { kind: 'food' | 'scanned' | 'meal' }) {
  const Icon = kind === 'meal' ? Star : kind === 'scanned' ? ScanBarcode : Apple;
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-field',
        kind === 'meal'
          ? 'bg-protein/15 text-protein'
          : kind === 'scanned'
            ? 'bg-warning/15 text-steps'
            : 'bg-primary/15 text-primary',
      )}
    >
      <Icon size={20} />
    </span>
  );
}

export default function CustomFoodsPage() {
  return (
    <Suspense>
      <CustomFoodsContent />
    </Suspense>
  );
}
