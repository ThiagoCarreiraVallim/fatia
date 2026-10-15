'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, UtensilsCrossed } from 'lucide-react';
import { customFoodSummary, nutritionApi, type Food } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { CustomFoodDrawer } from '@/components/nutrition/custom-food-drawer';
import { EmptyState } from '@/components/ui/empty-state';

/** `null` = drawer fechado; `'novo'` = cadastro; alimento = edição. */
type Editing = Food | 'novo' | null;

function CustomFoodsContent() {
  const params = useSearchParams();
  const router = useRouter();
  // `?novo=1` chega do card vazio e do "Cadastrar à mão" do scanner.
  const [editing, setEditing] = useState<Editing>(params.get('novo') ? 'novo' : null);
  const foods = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
  });

  const close = (open: boolean) => {
    if (open) return;
    setEditing(null);
    if (params.get('novo')) router.replace('/nutrition/foods');
  };

  return (
    <div className="space-y-5 p-4">
      <header className="flex items-center gap-2">
        <Link href="/nutrition" className="rounded p-1 hover:bg-accent" aria-label="Voltar">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="flex-1 text-xl font-semibold">Meus alimentos</h1>
        <Button size="sm" onClick={() => setEditing('novo')}>
          <Plus size={16} aria-hidden />
          Novo alimento
        </Button>
      </header>

      <p className="text-sm text-muted-foreground">
        O que não está na busca: produto embalado, receita de casa, o pão da padaria. Cadastre uma
        vez e registre como qualquer alimento.
      </p>

      {foods.isError && (
        <p role="alert" className="text-sm text-danger">
          Não deu para carregar seus alimentos.{' '}
          <button type="button" className="underline" onClick={() => foods.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {foods.data && foods.data.length === 0 && (
        <EmptyState
          icon={UtensilsCrossed}
          title="Nenhum alimento cadastrado ainda."
          description="Cadastre o que não está na tabela — um produto embalado ou uma receita de casa — e registre em dois toques."
        />
      )}
      {foods.data && foods.data.length > 0 && (
        <ul
          aria-label="Meus alimentos"
          className="divide-y rounded-2xl border border-subtle bg-card"
        >
          {foods.data.map((food) => (
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

      <CustomFoodDrawer
        open={editing !== null}
        onOpenChange={close}
        food={editing === 'novo' ? null : editing}
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
