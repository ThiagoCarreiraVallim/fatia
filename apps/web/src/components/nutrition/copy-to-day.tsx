'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { copyTargetDays, dayLabel } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

/** "qua", "qui": o dia da semana em cima do número. */
function weekdayShort(iso: string): string {
  return new Date(`${iso}T12:00:00`)
    .toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '');
}

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
  sourceDate,
}: {
  /** O dia de origem: com ele, os próximos dias viram chips (prancha Al-N9). */
  sourceDate?: string;
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
  const [otherDay, setOtherDay] = useState(!sourceDate);
  const label = target ? dayLabel(target, today) : null;
  const days = sourceDate ? copyTargetDays(sourceDate, today) : [];

  return (
    <div className="flex flex-col gap-3">
      {sourceDate && (
        <>
          <span className="text-eb uppercase text-muted-foreground">Para</span>
          {/* Os próximos dias em blocos (prancha Al-N9): o escolhido em verde. */}
          <div role="radiogroup" aria-label="Para" className="flex gap-1.5">
            {days.map((day) => {
              const on = day === target;
              return (
                <button
                  key={day}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={dayLabel(day, today)}
                  onClick={() => setTarget(day)}
                  className={cn(
                    'anim-press flex h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-field',
                    on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span className="text-[13px]">{weekdayShort(day)}</span>
                  <b className={cn('font-display text-base', !on && 'text-foreground')}>
                    {Number(day.slice(8))}
                  </b>
                </button>
              );
            })}
          </div>
          {!otherDay && (
            <button
              type="button"
              onClick={() => setOtherDay(true)}
              className="self-start text-sm font-semibold text-primary"
            >
              Outro dia
            </button>
          )}
        </>
      )}
      {otherDay && (
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-sm font-medium">
            {sourceDate ? 'Outro dia' : 'Dia de destino'}
          </label>
          <Input
            id={inputId}
            type="date"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-44"
          />
        </div>
      )}
      <button
        type="button"
        disabled={!label || pending}
        onClick={() => onCopy(target)}
        className="anim-press h-14 w-full rounded-pill bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-40"
      >
        {pending ? 'Copiando...' : label ? `Copiar para ${label}` : 'Escolha o dia'}
      </button>
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
