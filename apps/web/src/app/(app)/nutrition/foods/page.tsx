'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, Search, Trash2, UtensilsCrossed } from 'lucide-react';
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
    <div className="space-y-4 p-4" aria-busy={foods.isLoading}>
      <TopBarActions>
        <button
          type="button"
          className={topBarActionClass}
          aria-label="Novo alimento"
          onClick={() => setEditing('novo')}
        >
          <Plus size={22} aria-hidden />
        </button>
      </TopBarActions>

      <p className="text-sm text-muted-foreground">
        {MY_FOODS_HINT} Cadastre uma vez e registre como qualquer alimento.
      </p>

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label="Buscar em Meus alimentos"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nos seus"
          className="pl-9"
        />
      </div>

      <div role="tablist" aria-label="O que mostrar" className="flex gap-1">
        {myFoodsTabs().map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'min-h-10 rounded-full px-4 text-sm',
              tab === key
                ? 'bg-primary/15 font-medium text-primary'
                : 'bg-muted text-muted-foreground',
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
          className="divide-y rounded-2xl border border-subtle bg-card"
        >
          {shown.foods.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => setEditing(food)}
                aria-label={`Editar ${food.name}`}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{food.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {customFoodSummary(food)}
                  </span>
                </span>
                <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.meals.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
            Refeições salvas
          </h2>
          <ul
            aria-label="Refeições salvas"
            className="divide-y rounded-2xl border border-subtle bg-card"
          >
            {shown.meals.map((template) => (
              <li key={template.id} className="flex min-h-14 items-center gap-3 pl-4">
                <span className="min-w-0 flex-1 py-3">
                  <span className="block truncate text-sm font-medium">{template.name}</span>
                  <span className="block text-xs text-muted-foreground">
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

export default function CustomFoodsPage() {
  return (
    <Suspense>
      <CustomFoodsContent />
    </Suspense>
  );
}
