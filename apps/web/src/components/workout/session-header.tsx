'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown } from 'lucide-react';
import { formatClock } from './format';

/**
 * Cabeçalho da sessão (prancha Al-T3): minimizar (a barra do treino em
 * andamento segue nas outras telas), o relógio do treino numa pílula e o
 * finalizar, redondo. O "Cancelar treino" mora no "Treino atual".
 */
export function SessionHeader({
  startedAt,
  onFinish,
}: {
  startedAt: string;
  onFinish: () => void;
}) {
  const seconds = useElapsedSeconds(startedAt);

  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href="/"
        aria-label="Minimizar treino"
        className="anim-press flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <ChevronDown size={20} aria-hidden />
      </Link>
      <span className="flex h-11 items-center gap-2 rounded-full bg-muted px-4">
        <span aria-hidden className="anim-pulse-dot block h-2 w-2 rounded-full bg-primary" />
        <span
          role="timer"
          aria-label="Tempo de treino"
          className="font-display text-lg font-semibold text-foreground tabular-nums"
        >
          {formatClock(seconds)}
        </span>
      </span>
      <button
        type="button"
        onClick={onFinish}
        aria-label="Finalizar treino"
        className="anim-press flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Check size={20} aria-hidden />
      </button>
    </div>
  );
}

/** Os segundos desde o início, de segundo em segundo. */
function useElapsedSeconds(startedAt: string): number {
  const compute = () =>
    Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const [seconds, setSeconds] = useState(compute);

  // Troca de sessão recalcula durante o render, e não num efeito (#187).
  const [previousStartedAt, setPreviousStartedAt] = useState(startedAt);
  if (previousStartedAt !== startedAt) {
    setPreviousStartedAt(startedAt);
    setSeconds(compute());
  }

  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return Number.isFinite(seconds) ? seconds : 0;
}
