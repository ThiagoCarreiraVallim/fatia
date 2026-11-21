'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { foodSnap, nutritionApi, type Food, type NutritionFoodSnap } from '@fatia/api-client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * A quantidade inicial de um alimento escolhido: 1 porção do catálogo
 * quando há, senão 100 g. A pessoa ajusta depois na linha.
 */
export function pickedSnap(food: Food): NutritionFoodSnap {
  const portion = food.portions?.[0];
  return portion
    ? foodSnap(food, portion.grams, { label: portion.label, quantity: 1 })
    : foodSnap(food, 100);
}

/**
 * Busca de alimento do editor: só os da base (TACO), nunca o alimento
 * próprio de alguém (ADR 045). O servidor confere de novo ao salvar.
 */
export function FoodSearch({
  label,
  onPick,
  exclude,
  placeholder = 'Buscar alimento da TACO',
  autoFocus,
}: {
  label: string;
  onPick: (food: Food) => void;
  /** Os ids que já estão ali (o mesmo alimento duas vezes não entra). */
  exclude?: ReadonlySet<number>;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const term = q.trim();
  const search = useQuery({
    queryKey: ['nutrition', 'foods', 'search', term],
    queryFn: () => nutritionApi.searchFoods(term, 20),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
  const shown = (search.data ?? []).filter((f) => f.createdByUserId === null).slice(0, 8);
  const pick = (f: Food) => {
    onPick(f);
    setQ('');
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <div className="relative">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Enter escolhe o primeiro (e não envia o formulário em volta).
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const first = shown.find((f) => !exclude?.has(f.id));
            if (first) pick(first);
          }}
          placeholder={placeholder}
          className="h-10 pl-9"
          autoComplete="off"
        />
      </div>
      {term.length >= 2 && (
        <ul
          aria-label="Alimentos encontrados"
          className="divide-y divide-subtle overflow-hidden rounded-xl border border-subtle"
        >
          {shown.length === 0 ? (
            <li className="p-3 text-xs text-muted-foreground">
              {search.isFetching ? 'Buscando...' : 'Nada com esse nome na TACO.'}
            </li>
          ) : (
            shown.map((f) => {
              const already = exclude?.has(f.id) ?? false;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => pick(f)}
                    className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{f.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {`${Math.round(f.kcalPer100g)} kcal em 100 g`}
                        {f.portions?.[0] ? ` · ${f.portions[0].label}` : ''}
                        {already ? ' · já está aqui' : ''}
                      </span>
                    </span>
                    <Plus size={16} aria-hidden className="shrink-0 text-primary" />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
