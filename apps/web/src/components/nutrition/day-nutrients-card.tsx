'use client';

import Link from 'next/link';
import {
  dayNutrientBar,
  dayNutrientRangeText,
  dayNutrientStatusText,
  formatNutrientAmount,
  type DayNutrient,
} from '@fatia/api-client';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { todayCard } from '@/components/today/parts';
import { cn } from '@/lib/utils';

const MACROS = ['protein_g', 'carbs_g', 'fat_g'];

/**
 * O dia em faixas (prancha Al-N1): "Todos" mostra calorias, macros e os
 * micronutrientes com meta; um chip mostra só aquele nutriente, com o estado
 * escrito ("faltam 300 kcal"), nunca só a cor.
 */
export function DayNutrientsCard({
  nutrients,
  selected,
  onSelect,
}: {
  nutrients: DayNutrient[];
  /** Chave do nutriente escolhido; `null` é "Todos". */
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const one = selected ? nutrients.find((n) => n.key === selected) : undefined;
  const kcal = nutrients.find((n) => n.key === 'kcal');
  const macros = nutrients.filter((n) => MACROS.includes(n.key));
  const micros = nutrients.filter((n) => n.key !== 'kcal' && !MACROS.includes(n.key));

  return (
    <div className="space-y-3">
      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1" aria-label="Nutriente">
        <Chip selected={!one} onClick={() => onSelect(null)}>
          Todos
        </Chip>
        {nutrients.map((n) => (
          <Chip key={n.key} selected={one?.key === n.key} onClick={() => onSelect(n.key)}>
            {n.label}
          </Chip>
        ))}
        <Link
          href="/nutrition/nutrient-targets"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-chip border border-dashed border-border px-3.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <Icon name="plus" size={16} />
          Nutriente
        </Link>
      </div>

      {one ? (
        <OneNutrient n={one} />
      ) : (
        <div className={todayCard}>
          {kcal && (
            <button
              type="button"
              onClick={() => onSelect('kcal')}
              aria-label={`${kcal.label}, ${formatNutrientAmount(kcal.value, kcal.unit)}`}
              className="flex flex-col gap-2 text-left"
            >
              <span className="flex items-end justify-between gap-3">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-display text-4xl font-bold tabular-nums">
                    {formatNutrientAmount(kcal.value, '').trim()}
                  </span>
                  <span className="text-sm text-muted-foreground">kcal</span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">faixa do dia</span>
                  <b className="text-sm tabular-nums">{dayNutrientRangeText(kcal)}</b>
                </span>
              </span>
              <RangeBar n={kcal} />
            </button>
          )}
          {macros.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {macros.map((n) => (
                <NutrientCell key={n.key} n={n} onSelect={onSelect} />
              ))}
            </div>
          )}
          {micros.length > 0 && (
            <div className="grid grid-cols-3 gap-3 border-t border-subtle pt-3">
              {micros.map((n) => (
                <NutrientCell key={n.key} n={n} onSelect={onSelect} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NutrientCell({ n, onSelect }: { n: DayNutrient; onSelect: (key: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(n.key)}
      aria-label={`${n.label}, ${formatNutrientAmount(n.value, n.unit)}`}
      className="flex min-h-11 flex-col gap-1 text-left"
    >
      <span className="truncate text-xs text-muted-foreground">{n.label}</span>
      <b className="text-base tabular-nums">
        {formatNutrientAmount(n.value, '').trim()}
        <span className="text-xs font-normal text-muted-foreground"> {n.unit}</span>
      </b>
      <RangeBar n={n} />
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {dayNutrientRangeText(n)}
      </span>
    </button>
  );
}

const STATUS_CLASS: Record<DayNutrient['status'], string> = {
  under: 'bg-surface-3 text-foreground',
  ok: 'bg-primary-soft text-primary',
  over: 'bg-[hsl(var(--danger)/0.12)] text-danger',
  none: 'bg-surface-3 text-muted-foreground',
};

function OneNutrient({ n }: { n: DayNutrient }) {
  const bar = dayNutrientBar(n);
  const isGoal = n.key === 'kcal' || MACROS.includes(n.key);
  return (
    <div className={todayCard}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{n.label}</span>
        <span
          className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_CLASS[n.status])}
        >
          {dayNutrientStatusText(n)}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-4xl font-bold tabular-nums">
            {formatNutrientAmount(n.value, '').trim()}
          </span>
          <span className="text-sm text-muted-foreground">{n.unit}</span>
        </span>
        <span className="flex flex-col items-end">
          <span className="text-xs text-muted-foreground">
            {n.min != null && n.max != null ? 'faixa do dia' : n.min != null ? 'mínimo' : 'limite'}
          </span>
          <b className="text-sm tabular-nums">{dayNutrientRangeText(n)}</b>
        </span>
      </div>
      <RangeBar n={n} tall />
      {bar.lo == null && bar.hi == null && (
        <p className="text-xs text-muted-foreground">Sem meta para este nutriente.</p>
      )}
      <Link
        href={isGoal ? '/nutrition/goals' : '/nutrition/nutrient-targets'}
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-primary"
      >
        {bar.lo == null && bar.hi == null ? 'Definir meta' : 'Ajustar meta'}
        <Icon name="chevR" size={16} />
      </Link>
    </div>
  );
}

/** Barra com a faixa marcada por trás do preenchido. */
function RangeBar({ n, tall = false }: { n: DayNutrient; tall?: boolean }) {
  const bar = dayNutrientBar(n);
  const lo = bar.lo ?? 0;
  const hi = bar.hi ?? 100;
  return (
    <div
      aria-hidden
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-surface-3',
        tall ? 'h-3' : 'h-1.5',
      )}
    >
      {(bar.lo != null || bar.hi != null) && (
        <span
          className="absolute inset-y-0 bg-primary/20"
          style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }}
        />
      )}
      <span
        className={cn(
          'absolute inset-y-0 left-0 rounded-full transition-[width] duration-[400ms] ease-ds',
          n.status === 'over' ? 'bg-danger' : 'bg-primary',
        )}
        style={{ width: `${bar.fill}%` }}
      />
    </div>
  );
}
