'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SlidersHorizontal, ChevronRight } from 'lucide-react';
import { nutritionApi, type NutrientProgress } from '@/lib/api/nutrition';

const STATUS_COLOR: Record<NutrientProgress['status'], string> = {
  over: 'bg-rose-500',
  under: 'bg-amber-400',
  ok: 'bg-primary',
  none: 'bg-muted-foreground',
};

const STATUS_LABEL: Record<NutrientProgress['status'], string> = {
  over: 'acima',
  under: 'abaixo',
  ok: 'na meta',
  none: '—',
};

export function NutrientTargetsCard({ date }: { date: string }) {
  const q = useQuery({
    queryKey: ['nutrition', 'nutrient-summary', date],
    queryFn: () => nutritionApi.nutrientSummary(date),
  });

  const nutrients = q.data?.nutrients ?? [];

  return (
    <div className="space-y-3 rounded-2xl border border-white/5 bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <SlidersHorizontal size={15} className="text-primary" />
          Metas personalizadas
        </h3>
        <Link
          href="/nutrition/nutrient-targets"
          className="flex items-center gap-1 text-[11px] font-bold text-primary"
        >
          Gerenciar
          <ChevronRight size={12} />
        </Link>
      </div>

      {nutrients.length === 0 ? (
        <Link
          href="/nutrition/nutrient-targets"
          className="block rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-muted-foreground"
        >
          Acompanhe sódio, açúcar, fibra e outros. Toque para criar uma meta.
        </Link>
      ) : (
        <div className="space-y-3">
          {nutrients.map((n) => (
            <NutrientBar key={n.nutrientKey} n={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function NutrientBar({ n }: { n: NutrientProgress }) {
  // Referência da barra: max (limite) ou min (meta a atingir).
  const ref = n.max ?? n.min ?? 0;
  const pct = ref > 0 ? Math.min(100, Math.round((n.total / ref) * 100)) : 0;
  const target =
    n.min != null && n.max != null
      ? `${n.min}–${n.max}`
      : n.max != null
        ? `máx ${n.max}`
        : n.min != null
          ? `mín ${n.min}`
          : '—';
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-bold text-foreground">{n.label}</span>
        <span className="tabular-nums text-muted-foreground">
          {n.total} / {target} {n.unit}
          <span
            className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${
              n.status === 'over'
                ? 'bg-rose-500/15 text-rose-400'
                : n.status === 'under'
                  ? 'bg-amber-400/15 text-amber-400'
                  : 'bg-primary/15 text-primary'
            }`}
          >
            {STATUS_LABEL[n.status]}
          </span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${STATUS_COLOR[n.status]} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
