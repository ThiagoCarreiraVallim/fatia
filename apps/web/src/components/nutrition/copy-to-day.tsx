'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { dayLabel } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Escolha do dia de destino e o botão que diz para onde vai ("Copiar para hoje").
 * Comum a copiar refeição e copiar dia: depois de copiar a pessoa continua onde
 * está (pode copiar mais uma) e ganha o atalho para ver o destino.
 */
export function CopyToDay({
  defaultTarget,
  today,
  inputId,
  pending,
  error,
  done,
  onCopy,
  onNavigate,
}: {
  defaultTarget: string;
  today: string;
  inputId: string;
  pending: boolean;
  error: string | null;
  /** Texto do que foi feito, e para qual dia. */
  done: { text: string; target: string } | null;
  onCopy: (target: string) => void;
  onNavigate: () => void;
}) {
  const [target, setTarget] = useState(defaultTarget);
  const label = target ? dayLabel(target, today) : null;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        Dia de destino
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="date"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-40"
        />
        <Button
          type="button"
          className="flex-1"
          disabled={!label || pending}
          onClick={() => onCopy(target)}
        >
          {pending ? 'Copiando...' : label ? `Copiar para ${label}` : 'Escolha o dia'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {done && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2">
          <p role="status" className="flex items-center gap-2 text-sm text-primary">
            <Check size={16} aria-hidden />
            {done.text}
          </p>
          <Link
            href={`/nutrition?date=${done.target}`}
            onClick={onNavigate}
            className="text-sm font-medium text-primary underline"
          >
            {`Ver ${dayLabel(done.target, today)}`}
          </Link>
        </div>
      )}
    </div>
  );
}
