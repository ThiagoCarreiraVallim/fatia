'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

/**
 * Seleção do design system v2 (prancha Componentes · Seleção): chip, segmentado,
 * interruptor e check. Em um arquivo só porque são quatro peças pequenas que
 * sempre aparecem juntas; `chip.tsx`, `segmented.tsx`, `switch.tsx` e
 * `checkbox.tsx` reexportam daqui.
 */

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** "Na meta" e afins: o chip verde, que destaca sem ser filtro. */
  tone?: 'default' | 'primary';
}

/** Chip de filtro: 36 px visíveis, alvo de 44 (`after:`). Selecionado = fundo claro. */
export function Chip({ selected = false, tone = 'default', className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'anim-press relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip px-3.5 text-sm font-semibold transition-colors duration-fast after:absolute after:-inset-1',
        tone === 'primary'
          ? 'bg-primary text-primary-foreground'
          : selected
            ? 'bg-foreground text-background'
            : 'bg-muted text-muted-foreground hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Segmentado (Dia · Semana · Mês; kg · lb): um grupo de rádio com teclas de seta. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = 'default',
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nome do grupo para o leitor de tela. */
  label: string;
  tone?: 'default' | 'primary';
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex gap-1 rounded-field bg-muted p-1', className)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'relative h-[38px] flex-1 rounded-chip text-sm font-semibold transition-colors duration-fast after:absolute after:-inset-y-[3px] after:inset-x-0',
              on
                ? tone === 'primary'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-3 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Interruptor (pílula só aqui e em selo). A bolinha anda com mola. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 rounded-pill transition-colors duration-fast after:absolute after:-inset-2 disabled:opacity-40',
        checked ? 'bg-primary' : 'bg-surface-3',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-pill transition-transform duration-base ease-spring motion-reduce:transition-none',
          checked ? 'translate-x-5 bg-primary-foreground' : 'bg-white',
        )}
      />
    </button>
  );
}

/** Check (24 px, alvo de 44). Ao marcar, entra com mola (`anim-pop`). */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] text-primary-foreground after:absolute after:-inset-2.5',
        checked ? 'anim-pop bg-primary' : 'shadow-[inset_0_0_0_2px_hsl(var(--border-strong))]',
        className,
      )}
    >
      {checked && <Icon name="check" size={16} strokeWidth={2.6} />}
    </button>
  );
}
