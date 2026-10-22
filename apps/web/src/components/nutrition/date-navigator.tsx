'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(iso: string): string {
  // iso é YYYY-MM-DD no fuso do usuário; interpreta como meia-noite local para exibição
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

export function DateNavigator({ date }: { date: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (newDate: string) => {
    const next = new URLSearchParams(params);
    next.set('date', newDate);
    router.push(`?${next.toString()}`);
  };

  // Setas com alvo de 44 px, como no app: é o controle mais tocado da tela, e
  // o de 28 px ficava abaixo do mínimo de toque.
  return (
    <div className="flex items-center justify-between rounded-md border bg-card p-2">
      <button
        type="button"
        onClick={() => go(shift(date, -1))}
        className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
        aria-label="Dia anterior"
      >
        <ChevronLeft size={20} />
      </button>
      <span className="text-sm font-medium capitalize">{fmt(date)}</span>
      <button
        type="button"
        onClick={() => go(shift(date, 1))}
        className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent"
        aria-label="Próximo dia"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
