'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { formatClock, pluralize, type SessionProgress } from './format';

/**
 * Cabeçalho da sessão (prancha Al-T3): minimizar (a barra do treino em
 * andamento segue nas outras telas), o relógio do treino e o finalizar. O
 * progresso fica logo abaixo, numa linha fina.
 */
export function SessionHeader({
  startedAt,
  progress,
  onCancel,
  onFinish,
}: {
  startedAt: string;
  progress: SessionProgress;
  onCancel: () => void;
  onFinish: () => void;
}) {
  const seconds = useElapsedSeconds(startedAt);
  const progressLabel = `${progress.done}/${progress.total} ${pluralize(progress.total, 'exercício', 'exercícios')}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          aria-label="Minimizar treino"
          className="anim-press flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground"
        >
          <ChevronDown size={20} aria-hidden />
        </Link>
        <div className="flex flex-col items-center">
          <span
            role="timer"
            aria-label="Tempo de treino"
            className="font-display text-xl font-extrabold text-foreground tabular-nums"
          >
            {formatClock(seconds)}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-8 px-2 text-[11px] font-bold text-muted-foreground"
          >
            Cancelar treino
          </button>
        </div>
        <button
          type="button"
          onClick={onFinish}
          aria-label="Finalizar treino"
          className="anim-press h-11 rounded-full bg-primary px-4 text-sm font-extrabold text-primary-foreground"
        >
          Finalizar
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div
          role="progressbar"
          aria-label="Progresso do treino"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-valuetext={progressLabel}
          className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round(progress.ratio * 100)}%` }}
          />
        </div>
        <p className="text-[11px] font-bold text-muted-foreground tabular-nums">{progressLabel}</p>
      </div>
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
