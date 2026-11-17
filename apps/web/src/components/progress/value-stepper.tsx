'use client';

import { forwardRef } from 'react';
import { Icon } from '@/components/ui/icon';

/**
 * O número grande com − e + da prancha Al-G7. Continua digitável: o − e o + são para o
 * ajuste fino, e quem pesa 20 kg a menos que o último registro digita.
 */
export const ValueStepper = forwardRef<
  HTMLInputElement,
  {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    step: number;
    /** Ponto de partida do − e + com o campo vazio (o último registro). */
    base: number | null;
    unit: string;
    decimals: number;
    placeholder?: string;
    /**
     * `lg`: o número grande do G7. `sm`: o `.stepper` compacto do G10 (− 68 kg +), numa
     * pílula à direita do rótulo.
     */
    size?: 'lg' | 'sm';
  }
>(function ValueStepper(
  { id, label, value, onChange, step, base, unit, decimals, placeholder, size = 'lg' },
  ref,
) {
  const bump = (dir: 1 | -1) => {
    const current = value.trim() === '' ? (base ?? 0) : Number(value);
    if (!Number.isFinite(current)) return;
    const next = Math.max(0, current + dir * step);
    onChange(decimals ? next.toFixed(decimals) : String(Math.round(next)));
  };
  // O campo cresce com o número, para a unidade ficar colada nele (70,2kg), como na prancha.
  const chars = Math.max(2, (value || placeholder || '').length);
  const input = (
    <input
      id={id}
      ref={ref}
      type="number"
      inputMode={decimals ? 'decimal' : 'numeric'}
      step={decimals ? String(1 / 10 ** decimals) : '1'}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: `${chars + 0.3}ch` }}
      className={`bg-transparent font-display font-bold leading-none tabular-nums outline-none [appearance:textfield] placeholder:text-faint focus-visible:rounded-field focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${size === 'sm' ? 'text-center text-[18px]' : 'text-right text-[44px]'}`}
    />
  );
  if (size === 'sm') {
    return (
      <div className="flex items-center gap-1.5 rounded-[14px] bg-muted p-1">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <button
          type="button"
          aria-label="Menos"
          onClick={() => bump(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-card text-foreground"
        >
          <span aria-hidden className="h-0.5 w-3 bg-current" />
        </button>
        <div className="flex min-w-[56px] items-baseline justify-center gap-1">
          {input}
          <span className="font-display text-[18px] font-bold">{unit}</span>
        </div>
        <button
          type="button"
          aria-label="Mais"
          onClick={() => bump(1)}
          className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-card text-foreground"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Menos"
          onClick={() => bump(-1)}
          className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-muted text-foreground"
        >
          <span aria-hidden className="h-0.5 w-3 bg-current" />
        </button>
        <div className="flex min-w-[150px] items-baseline justify-center">
          {input}
          <span className="font-display text-[22px] font-semibold text-muted-foreground">
            {unit}
          </span>
        </div>
        <button
          type="button"
          aria-label="Mais"
          onClick={() => bump(1)}
          className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-muted text-foreground"
        >
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
});
