'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const show = (n: number | undefined, scale: number) =>
  n === undefined ? '' : String(Math.round((n / scale) * 100) / 100).replace('.', ',');

/**
 * Número digitável (o canvas desenha passos; a usabilidade pede teclado):
 * guarda o texto enquanto a pessoa digita e só entrega número válido. Vazio
 * entrega `undefined`. `scale` converte a unidade da tela para a da API
 * (minutos → segundos = 60).
 */
export function NumField({
  label,
  value,
  onChange,
  scale = 1,
  integer = true,
  min = 0,
  max,
  className,
  hideLabel = false,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  scale?: number;
  /** Inteiro na unidade da API (depois de `scale`). */
  integer?: boolean;
  min?: number;
  max?: number;
  className?: string;
  hideLabel?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const [text, setText] = useState(show(value, scale));
  // Mudança de fora (mover, trocar de sessão) reescreve o texto; a que veio
  // da digitação deixa o texto como está ("2," não vira "2").
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    const parsed = Number(text.replace(',', '.'));
    const same = text.trim() === '' ? value === undefined : parsed * scale === value;
    if (!same) setText(show(value, scale));
  }

  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-xs text-muted-foreground'}>
        {label}
      </Label>
      <Input
        id={id}
        inputMode={integer && scale === 1 ? 'numeric' : 'decimal'}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, '');
          setText(t);
          if (t.trim() === '') return onChange(undefined);
          const n = Number(t.replace(',', '.'));
          if (!Number.isFinite(n)) return;
          let v = n * scale;
          if (integer) v = Math.round(v);
          if (v < min || (max !== undefined && v > max)) return;
          onChange(v);
        }}
        className="h-10"
      />
    </div>
  );
}
