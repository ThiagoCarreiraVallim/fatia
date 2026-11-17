'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import {
  activeWorkoutBarLabel,
  activeWorkoutBarLines,
  activeWorkoutBarView,
  circuitBarSnapshot,
  circuitRunPath,
  circuitState,
  workoutApi,
  type WorkoutSession,
} from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { useSessionRestTimer } from '@/components/workout/rest-timer-provider';

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
  // Circuito (#380): a barra mostra o relógio dele, calculado dos toques como na tela.
  const circuit = session.circuit;
  const snapshot = circuit
    ? circuitBarSnapshot(
        circuit.definition,
        circuitState(
          circuit.definition,
          { startedAt: Date.parse(circuit.startedAt), events: circuit.events },
          now.getTime(),
        ),
      )
    : null;
  const view = activeWorkoutBarView(session, rest, now, snapshot);
  const target = circuit ? circuitRunPath(session.id) : href;
  // A sessão não traz o plano; a lista de planos já está em cache na aba Treino.
  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
    enabled: session.planId != null,
  });
  const planName = plans.data?.find((p) => p.id === session.planId)?.name;
  const lines = activeWorkoutBarLines(view, planName);
  const resting = view.mode === 'rest';
  // A linha fina embaixo (#377): séries feitas contra as planejadas. Sem plano,
  // não há contra o que medir e ela some.
  // No circuito as séries só nascem no fim: a linha ficaria parada em zero.
  const planned = circuit
    ? 0
    : (session.plannedExercises ?? []).reduce((acc, e) => acc + (e.targetSets ?? 0), 0);
  const done = session.sets?.length ?? 0;

  return (
    <div
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom))` }}
      className="fixed inset-x-4 z-40 flex h-14 items-center gap-1 overflow-hidden rounded-[22px] bg-muted/85 pe-2 shadow-[0_0_0_1px_hsl(var(--border-subtle)),0_20px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl md:hidden"
    >
      <Link
        href={target}
        aria-label={activeWorkoutBarLabel(view)}
        className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-[22px] ps-4"
      >
        <span aria-hidden className="flex w-5 shrink-0 items-center justify-center">
          {resting ? (
            <Icon name="timer" size={16} className="text-water" />
          ) : (
            <span className="anim-pulse-dot block h-2 w-2 rounded-full bg-primary" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold leading-[18px] text-foreground">
            {lines.primary}
          </span>
          <span className="block truncate text-xs leading-4 tabular-nums text-muted-foreground">
            {lines.secondary}
          </span>
        </span>
        {!resting && (
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-primary text-primary-foreground"
          >
            <Play size={16} fill="currentColor" />
          </span>
        )}
      </Link>
      {resting && (
        <button
          type="button"
          aria-label="Mais 30 segundos de descanso"
          onClick={() => rest.addTime(30)}
          className="anim-press h-10 shrink-0 rounded-[14px] bg-card px-3 text-[13px] font-bold text-foreground"
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
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] overflow-hidden"
        >
          <span
            style={{ width: `${Math.min(1, done / planned) * 100}%` }}
            className="block h-full bg-primary transition-[width]"
          />
        </span>
      )}
    </div>
  );
}
