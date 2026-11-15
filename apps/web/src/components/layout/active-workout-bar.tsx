'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  activeWorkoutBarLabel,
  activeWorkoutBarView,
  type WorkoutSession,
} from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { useSessionRestTimer } from '@/components/workout/rest-timer-provider';
import { cn } from '@/lib/utils';

/** Altura da barra e o que as telas ganham de margem embaixo quando ela aparece. */
export const ACTIVE_WORKOUT_BAR_HEIGHT = 56;
export const ACTIVE_WORKOUT_BAR_GAP = 10;

/** O relógio da barra anda de segundo em segundo; parado, o tempo de treino mentiria. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * "Treino em andamento" (prancha `Al-T-Cards-treino`): 56 px, mesma largura,
 * raio e vidro da barra de baixo, 10 px acima dela, em toda tela de ver
 * enquanto houver sessão aberta. Toque abre a sessão. No descanso mostra a
 * contagem e o "+30 s", que mexe no descanso sem sair da tela.
 *
 * No PWA a sessão aberta vive em `/workout` (não há rota de sessão em
 * andamento), então é para lá que a barra leva.
 */
export function ActiveWorkoutBar({
  session,
  bottom,
  href = '/workout',
}: {
  session: WorkoutSession;
  bottom: number;
  href?: string;
}) {
  const rest = useSessionRestTimer();
  const now = useNow();
  const view = activeWorkoutBarView(session, rest, now);
  const resting = view.mode === 'rest';
  // A linha fina embaixo (#377): séries feitas contra as planejadas. Sem plano,
  // não há contra o que medir e ela some.
  const planned = (session.plannedExercises ?? []).reduce((acc, e) => acc + (e.targetSets ?? 0), 0);
  const done = session.sets?.length ?? 0;

  return (
    <div
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom))` }}
      className="fixed inset-x-4 z-40 flex h-14 items-center gap-1 rounded-[22px] bg-muted/85 pe-1.5 shadow-[0_0_0_1px_hsl(var(--border-subtle)),0_20px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl md:hidden"
    >
      <Link
        href={href}
        aria-label={activeWorkoutBarLabel(view)}
        className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-[22px] ps-3"
      >
        <span
          aria-hidden
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            resting ? 'bg-foreground text-background' : 'bg-primary text-primary-foreground',
          )}
        >
          <Icon
            name={resting ? 'timer' : view.mode === 'cardio' ? 'steps' : 'dumbbell'}
            size={16}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">{view.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{view.detail}</span>
        </span>
        <span
          aria-hidden
          className="shrink-0 pe-2 font-display text-base font-semibold tabular-nums text-foreground"
        >
          {view.clock}
        </span>
      </Link>
      {resting && (
        <button
          type="button"
          aria-label="Mais 30 segundos de descanso"
          onClick={() => rest.addTime(30)}
          className="anim-press h-11 shrink-0 rounded-full bg-card px-3 text-[13px] font-bold text-foreground"
        >
          +30 s
        </button>
      )}
      {planned > 0 && (
        <span
          role="progressbar"
          aria-label="Séries do treino"
          aria-valuemin={0}
          aria-valuemax={planned}
          aria-valuenow={Math.min(done, planned)}
          className="pointer-events-none absolute inset-x-5 bottom-1 h-0.5 overflow-hidden rounded-full bg-foreground/10"
        >
          <span
            style={{ width: `${Math.min(1, done / planned) * 100}%` }}
            className="block h-full rounded-full bg-primary transition-[width]"
          />
        </span>
      )}
    </div>
  );
}
