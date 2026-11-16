'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * O −/+ do Novo circuito (prancha Al-T22): botões redondos de 36 px e o número
 * no meio, que também é digitável (memória: números digitáveis). O texto vive
 * aqui enquanto a pessoa digita; o número só sobe quando é válido, e ao sair
 * do campo volta para dentro do mínimo e do máximo.
 */
export function CircuitStepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  className,
}: {
  /** "duração", "trabalho", "Burpee": vira "Diminuir duração" e o nome do campo. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  // O número mudou por fora (−/+, troca de reps para tempo): o texto acompanha.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const round =
    'anim-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-foreground disabled:opacity-40';

  return (
    <span className={cn('flex shrink-0 items-center gap-1', className)}>
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
        className={round}
      >
        <Minus size={14} aria-hidden />
      </button>
      <span className="flex min-w-[64px] items-baseline justify-center">
        <input
          aria-label={label}
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
            setText(raw);
            const n = Number(raw);
            if (raw && n >= min && n <= max) onChange(n);
          }}
          onBlur={() => {
            const n = clamp(Number(text) || min);
            setText(String(n));
            if (n !== value) onChange(n);
          }}
          className={cn(
            'w-10 bg-transparent text-center text-[15px] font-bold tabular-nums text-foreground outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary',
            suffix && 'w-9 text-right',
          )}
        />
        {suffix && <span className="ml-1 text-[15px] font-bold">{suffix}</span>}
      </span>
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
        className={round}
      >
        <Plus size={14} aria-hidden />
      </button>
    </span>
  );
}
