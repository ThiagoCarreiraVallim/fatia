'use client';

import { cn } from '@/lib/utils';

/**
 * Régua (prancha Componentes · Campos: peso, altura, porções). O desenho são
 * os traços com o marcador verde no centro; quem recebe o toque, a roda e as
 * setas é um `<input type="range">` transparente por cima — leitor de tela e
 * teclado ganham o controle nativo de graça.
 */
export function Ruler({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  label,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  label: string;
  className?: string;
}) {
  const ticks = 21;
  // Os traços andam com o valor: o do meio é sempre o valor atual.
  const offset = ((value - min) / step) % 5;
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-end justify-between">
        <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
        <span className="font-display text-[28px] font-bold leading-none tabular-nums">
          {value.toLocaleString('pt-BR')}
          <span className="ml-1 text-xs font-semibold text-muted-foreground">{unit}</span>
        </span>
      </div>
      <div className="relative h-11 overflow-hidden rounded-field bg-muted">
        <div aria-hidden className="absolute inset-0 flex items-center justify-between px-3">
          {Array.from({ length: ticks }, (_, i) => {
            const major = (i + offset) % 5 === 0;
            return <i key={i} className={cn('w-px bg-border-strong', major ? 'h-5' : 'h-3')} />;
          })}
        </div>
        <i
          aria-hidden
          className="absolute left-1/2 top-2 bottom-2 w-0.5 -translate-x-1/2 rounded bg-primary"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          aria-valuetext={`${value.toLocaleString('pt-BR')} ${unit}`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
    </div>
  );
}
