'use client';

import * as React from 'react';
import type { IconName } from '@fatia/design';
import { useCountUp } from '@/lib/use-count-up';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

/**
 * Blocos de dado (prancha Componentes · Blocos de dado e Movimento): anel com
 * contagem, bloco de um número, faixa de dias e mapa de calor. Um número por
 * bloco, grande; o rótulo pequeno embaixo. `ring.tsx`, `stat-block.tsx`,
 * `day-strip.tsx` e `heatmap.tsx` reexportam daqui.
 */

/** Anel que enche em 1,3 s (`anim-ring`), com o número no meio subindo junto. */
export function Ring({
  value,
  max,
  size = 132,
  stroke = 10,
  color = 'hsl(var(--primary))',
  label,
  unit,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  /** Cor do traço; padrão o verde da marca. Nunca a cor da comunidade. */
  color?: string;
  /** Nome do anel para o leitor de tela ("kcal restantes"). */
  label: string;
  unit?: string;
  children?: React.ReactNode;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const shown = useCountUp(Math.round(value));
  const r = (size - stroke) / 2;
  return (
    <div
      role="img"
      aria-label={`${label}: ${Math.round(value).toLocaleString('pt-BR')}${unit ? ` ${unit}` : ''}`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - pct}
          stroke={color}
          className="anim-ring"
        />
      </svg>
      <div
        aria-hidden
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        {children ?? (
          <>
            <span className="font-display text-[28px] font-bold leading-none tracking-tight tabular-nums">
              {shown.toLocaleString('pt-BR')}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">{label}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Um número, grande, com o rótulo pequeno embaixo. */
export function StatBlock({
  value,
  unit,
  label,
  icon,
  tone = 'card',
  className,
  children,
}: {
  value: string;
  unit?: string;
  label: string;
  icon?: IconName;
  /** `primary` = o bloco verde (sequência); texto escuro por cima. */
  tone?: 'card' | 'primary';
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 overflow-hidden rounded-card p-5',
        tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground',
        className,
      )}
    >
      {icon && <Icon name={icon} size={20} />}
      <p className="font-display text-[40px] font-bold leading-none tracking-tight tabular-nums">
        {value}
        {unit && (
          <span
            className={cn(
              'ml-1 text-base font-semibold',
              tone === 'primary' ? 'opacity-70' : 'text-muted-foreground',
            )}
          >
            {unit}
          </span>
        )}
      </p>
      <p className={cn('text-[13px]', tone === 'primary' ? 'opacity-70' : 'text-muted-foreground')}>
        {label}
      </p>
      {children}
    </div>
  );
}

export interface Day {
  /** Letra do dia (S, T, Q…). */
  weekday: string;
  /** Dia do mês. */
  day: number;
  /** Nome completo para o leitor de tela ("quarta, 4 de novembro"). */
  label: string;
  done?: boolean;
}

/** Faixa de dias: o selecionado em verde, os já feitos com contorno. */
export function DayStrip({
  days,
  selected,
  onSelect,
  className,
}: {
  days: Day[];
  selected: number;
  onSelect: (index: number) => void;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label="Dias" className={cn('flex justify-between gap-1.5', className)}>
      {days.map((d, i) => {
        const on = i === selected;
        return (
          <button
            key={d.label}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${d.label}${d.done ? ', registrado' : ''}`}
            onClick={() => onSelect(i)}
            className={cn(
              'flex h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-field text-xs font-semibold transition-colors duration-fast',
              on
                ? 'bg-primary text-primary-foreground'
                : cn(
                    'bg-muted text-faint',
                    d.done && 'shadow-[inset_0_0_0_1.5px_hsl(var(--primary-text)/0.5)]',
                  ),
            )}
          >
            <span aria-hidden>{d.weekday}</span>
            <b aria-hidden className={cn('font-display text-base', !on && 'text-foreground')}>
              {d.day}
            </b>
          </button>
        );
      })}
    </div>
  );
}

/** Mapa de calor da constância: 0 a 3 por dia, em 7 colunas. */
export function Heatmap({
  levels,
  label,
  className,
}: {
  levels: (0 | 1 | 2 | 3)[];
  /** Resumo para o leitor de tela ("12 de 14 dias registrados"). */
  label: string;
  className?: string;
}) {
  const shade = [
    'bg-card',
    'bg-[hsl(var(--primary)/0.25)]',
    'bg-[hsl(var(--primary)/0.5)]',
    'bg-primary',
  ];
  return (
    <div role="img" aria-label={label} className={cn('grid grid-cols-7 gap-1.5', className)}>
      {levels.map((l, i) => (
        <i
          key={i}
          aria-hidden
          className={cn('anim-fade aspect-square rounded-[8px]', shade[l])}
          style={{ animationDelay: `${i * 25}ms` }}
        />
      ))}
    </div>
  );
}

/** Barras verticais que crescem de baixo para cima, 60 ms entre elas. */
export function Bars({
  values,
  highlight = [],
  labels,
  className,
}: {
  values: number[];
  highlight?: number[];
  labels: string[];
  className?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className={cn('flex h-[120px] items-end gap-2', className)}>
      {values.map((v, i) => (
        <i
          key={labels[i]}
          aria-hidden
          className={cn(
            'anim-grow-y flex-1 rounded-[10px]',
            highlight.includes(i) ? 'bg-primary' : 'bg-surface-3',
          )}
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, ['--i' as string]: i }}
        />
      ))}
    </div>
  );
}
