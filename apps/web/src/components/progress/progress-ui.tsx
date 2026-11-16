'use client';

import { useId } from 'react';
import { barHeights, linePath, type GoalBadgeTone } from '@fatia/api-client';
import { cn } from '@/lib/utils';

/**
 * Peças pequenas das telas de Progresso (#382): a linha e as barras dos gráficos
 * da prancha, os quadradinhos da constância e o selo por tom.
 */

/** Linha com o degradê embaixo (Peso, Força). `values` em ordem de tempo. */
export function Sparkline({
  values,
  height = 44,
  className,
  colorClass = 'text-primary',
  fill = true,
}: {
  values: number[];
  height?: number;
  className?: string;
  /** A cor vem do `currentColor`: `text-primary`, `text-danger`... */
  colorClass?: string;
  fill?: boolean;
}) {
  const id = useId();
  const width = 300;
  if (values.length < 2) return <div aria-hidden style={{ height }} className={className} />;
  const d = linePath(values, width, height);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', colorClass, className)}
      style={{ height }}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={`url(#${id})`} />
        </>
      )}
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Barras verticais (Passos, Cardio). A última, a de hoje, acesa. */
export function MiniBars({
  values,
  height = 44,
  className,
  colorClass = 'bg-steps',
  gap = 'gap-[3px]',
}: {
  values: number[];
  height?: number;
  className?: string;
  colorClass?: string;
  gap?: string;
}) {
  const heights = barHeights(values);
  return (
    <div aria-hidden className={cn('flex items-end', gap, className)} style={{ height }}>
      {heights.map((h, i) => (
        <i
          key={i}
          className={cn(
            'anim-grow-y flex-1 rounded-[3px]',
            colorClass,
            i === heights.length - 1 ? 'opacity-100' : 'opacity-60',
          )}
          style={{ height: `${h}%`, ['--i' as string]: i }}
        />
      ))}
    </div>
  );
}

/** As cores da constância: 0 a 4 áreas cumpridas no dia. */
export const HEAT_SHADES = [
  'bg-surface-3',
  'bg-[hsl(var(--primary)/0.3)]',
  'bg-[hsl(var(--primary)/0.55)]',
  'bg-[hsl(var(--primary)/0.8)]',
  'bg-primary',
];

export function HeatCell({ level, className }: { level: number; className?: string }) {
  return (
    <i
      aria-hidden
      className={cn('block rounded-[5px]', HEAT_SHADES[level] ?? HEAT_SHADES[0], className)}
    />
  );
}

/** Selo por tom (os da prancha: `ok`, `warn`, `pro`, `mute`). */
export function ToneBadge({
  tone,
  children,
}: {
  tone: GoalBadgeTone | 'bad';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-[11px] font-bold',
        tone === 'ok' && 'bg-[hsl(var(--success)/0.12)] text-success',
        tone === 'warn' && 'bg-[hsl(var(--warning)/0.12)] text-warning',
        tone === 'bad' && 'bg-[hsl(var(--danger)/0.12)] text-danger',
        tone === 'pro' && 'bg-primary text-primary-foreground',
        tone === 'mute' && 'bg-surface-3 text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

/** Barra de progresso fina (metas, áreas da constância). */
export function ProgressBar({
  percent,
  colorClass = 'bg-primary',
  label,
}: {
  percent: number;
  colorClass?: string;
  label?: string;
}) {
  return (
    <div
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? percent : undefined}
      aria-hidden={label ? undefined : true}
      className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-3"
    >
      <div className={cn('h-full rounded-pill', colorClass)} style={{ width: `${percent}%` }} />
    </div>
  );
}
