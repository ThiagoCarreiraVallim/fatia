'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Package } from 'lucide-react';
import { nutritionApi } from '@fatia/api-client';

const PREVIEW = 3;

/** Acesso a "Meus alimentos" na Nutrição, no mesmo formato do card de metas. */
export function CustomFoodsCard() {
  const foods = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
  });
  const list = foods.data ?? [];
  const rest = list.length - PREVIEW;

  return (
    <div className="space-y-3 rounded-2xl border border-subtle bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Package size={15} className="text-primary" aria-hidden />
          Meus alimentos
        </h3>
        <Link
          href="/nutrition/foods"
          aria-label="Gerenciar meus alimentos"
          className="flex min-h-11 items-center gap-1 text-[11px] font-bold text-primary"
        >
          Gerenciar
          <ChevronRight size={12} aria-hidden />
        </Link>
      </div>
      {list.length === 0 ? (
        <Link
          href="/nutrition/foods?novo=1"
          className="block rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-muted-foreground"
        >
          Produto embalado ou receita de casa que não está na busca? Toque para cadastrar.
        </Link>
      ) : (
        <p className="text-xs text-muted-foreground">
          {list
            .slice(0, PREVIEW)
            .map((f) => f.name)
            .join(', ')}
          {rest > 0 ? ` e mais ${rest}` : ''}
        </p>
      )}
    </div>
  );
}
