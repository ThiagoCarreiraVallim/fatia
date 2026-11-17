'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, Check, Minus, Pause, Play, X } from 'lucide-react';
import {
  circuitDoneLine,
  circuitHeader,
  circuitIntervalsView,
  circuitLiveComparison,
  circuitRoundsView,
  circuitTotals,
  formatClock,
  type CircuitDefinition,
  type CircuitSessionData,
  type CircuitState,
  type WorkoutSession,
} from '@fatia/api-client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DockedAction, DockedPage } from '@/components/layout/bottom-nav';
import { useWakeLock } from '@/components/workout/use-wake-lock';
import { CircuitBadge } from './circuit-badge';
import { useCircuitRun } from './use-circuit-run';
import { cn } from '@/lib/utils';

const roundBtn =
  'anim-press flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-foreground';
const darkBtn =
  'anim-press flex h-14 items-center justify-center rounded-pill bg-foreground text-[15px] font-bold text-background disabled:opacity-60';

/**
 * O relógio do circuito (#380): AMRAP (Al-T4), For Time (Al-T4c, e o fim
 * Al-T4e), e a tela de intervalos de Tabata (Al-T4b) e EMOM (Al-T4d). Sem barra
 * de topo e sem a navegação: o X sai deixando o circuito correndo (a barra do
 * treino em andamento leva de volta), e "Encerrar" grava e abre o "Treino
 * feito" (Al-T5).
 */
export function CircuitRun({
  session,
}: {
  session: WorkoutSession & { circuit: CircuitSessionData };
}) {
  const router = useRouter();
  const run = useCircuitRun(session);
  const { def, state } = run;
  const done = state.status === 'done';
  const [confirmEnd, setConfirmEnd] = useState(false);
  // A tela apagando no meio do circuito some com o relógio. No navegador o
  // pedido pode ser negado (bateria, iOS antigo): o relógio segue certo pelos
  // horários, mas a tela pode apagar (ver o aviso embaixo).
  useWakeLock(!done);
  const wakeLockMissing = typeof navigator !== 'undefined' && !('wakeLock' in navigator);
  const intervals = def.format === 'EMOM' || def.format === 'TABATA';

  const finishError = run.finish.isError ? (
    <p role="alert" className="px-1 text-center text-sm text-danger">
      Não foi possível salvar o circuito.{' '}
      {run.finish.error instanceof Error ? run.finish.error.message : 'Tente de novo.'}
    </p>
  ) : null;

  return (
    <DockedPage className="relative isolate px-4 pt-[env(safe-area-inset-top)]">
      {intervals && !done && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 -top-4 -z-10 h-[75dvh] transition-[background] duration-500',
            circuitIntervalsView(def, state).tone === 'rest'
              ? 'bg-[radial-gradient(90%_60%_at_50%_30%,hsl(var(--water)/0.2),transparent_70%)]'
              : 'bg-[radial-gradient(90%_60%_at_50%_30%,hsl(var(--primary)/0.2),transparent_70%)]',
          )}
        />
      )}
      <header className="flex items-center justify-between gap-2 pt-3">
        <button
          type="button"
          aria-label="Sair do circuito"
          onClick={() => router.push('/workout/plans?tab=circuitos')}
          className="anim-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground"
        >
          <X size={20} aria-hidden />
        </button>
        <h1 className="flex min-w-0 flex-1 justify-center">
          <CircuitBadge format={def.format} className="max-w-full truncate">
            {circuitHeader(def)}
          </CircuitBadge>
        </h1>
        <button
          type="button"
          aria-label={run.sound ? 'Desligar o som' : 'Ligar o som'}
          aria-pressed={run.sound}
          onClick={run.toggleSound}
          className={cn(
            'anim-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground',
            !run.sound && 'opacity-40',
          )}
        >
          {run.sound ? <Bell size={20} aria-hidden /> : <BellOff size={20} aria-hidden />}
        </button>
      </header>

      {intervals ? (
        <IntervalsBody def={def} state={state} />
      ) : (
        <RoundsBody
          def={def}
          state={state}
          comparison={circuitLiveComparison(
            def.format,
            {
              roundsCompleted: state.roundsCompleted,
              partialExercises: state.exerciseIndex,
              finalTimeSeconds: state.finalTimeSeconds,
            },
            run.previous,
          )}
          onMark={(count) => run.push('mark', count)}
          onRound={() => run.push('round')}
          onUnround={() => run.push('unround')}
          onSkipRest={() => run.push('skip')}
        />
      )}

      {run.saveFailed && !done && (
        <p role="status" className="px-1 text-center text-xs text-warning">
          Sem conexão: o relógio segue aqui e grava quando a rede voltar.
        </p>
      )}
      {wakeLockMissing && !done && (
        <p className="px-1 text-center text-xs text-faint">
          Neste navegador a tela pode apagar. O tempo continua certo quando você voltar.
        </p>
      )}
      {finishError}

      <DockedAction>
        {done ? (
          <button
            type="button"
            disabled={run.finish.isPending}
            onClick={() => run.finish.mutate()}
            className="anim-press flex h-14 flex-1 items-center justify-center rounded-pill bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {run.finish.isPending ? 'Salvando...' : 'Salvar treino'}
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-label={state.status === 'paused' ? 'Continuar' : 'Pausar'}
              onClick={() => run.push(state.status === 'paused' ? 'resume' : 'pause')}
              className={roundBtn}
            >
              {state.status === 'paused' ? (
                <Play size={20} aria-hidden />
              ) : (
                <Pause size={20} aria-hidden />
              )}
            </button>
            {intervals && (
              <button
                type="button"
                onClick={() => run.push('skip')}
                className="anim-press flex h-14 flex-1 items-center justify-center rounded-pill bg-muted text-[15px] font-bold text-foreground"
              >
                {def.format === 'EMOM' ? 'Próximo minuto' : 'Pular fase'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              className={cn(darkBtn, intervals ? 'shrink-0 px-[18px]' : 'flex-1')}
            >
              {intervals ? 'Encerrar' : 'Encerrar circuito'}
            </button>
          </>
        )}
      </DockedAction>

      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="Encerrar o circuito?"
        description="O que você fez até aqui fica salvo no histórico."
        confirmLabel="Encerrar"
        pendingLabel="Salvando..."
        pending={run.finish.isPending}
        onConfirm={() => run.finish.mutate()}
      />
    </DockedPage>
  );
}

/** O círculo verde com o check do fim (Al-T4b, T4d, T4e). */
function DoneMark() {
  return (
    <span
      aria-hidden
      className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-primary text-primary-foreground"
    >
      <Check size={36} strokeWidth={3} />
    </span>
  );
}

function IntervalsBody({ def, state }: { def: CircuitDefinition; state: CircuitState }) {
  if (state.status === 'done') {
    const totals = circuitTotals(def, {
      roundsCompleted: 0,
      partialExercises: 0,
      intervalsCompleted: state.intervalsCompleted,
    });
    return (
      <section className="flex flex-col items-center gap-3 pt-16 text-center" aria-live="polite">
        <DoneMark />
        <h2 className="font-display text-[30px] font-bold">
          {def.format === 'EMOM' ? 'EMOM concluído' : 'Tabata concluído'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {circuitDoneLine(def, { ...state, totals })}
        </p>
      </section>
    );
  }
  const v = circuitIntervalsView(def, state);
  return (
    <section className="flex flex-1 flex-col items-center gap-3.5 px-2 pt-6 text-center">
      <p
        className={cn(
          'text-sm font-extrabold tracking-[0.12em]',
          state.status === 'paused'
            ? 'text-muted-foreground'
            : v.tone === 'rest'
              ? 'text-water'
              : 'text-primary-text',
        )}
      >
        {v.phaseLabel}
      </p>
      <p
        aria-label={`${v.seconds} segundos`}
        className="font-display text-[150px] font-bold leading-[0.9] tracking-[-0.05em] tabular-nums"
      >
        {v.seconds}
      </p>
      <p className="font-display text-[28px] font-bold">{v.now}</p>
      <p className="text-sm text-muted-foreground">a seguir · {v.next}</p>
      <div className="flex-1" />
      <div aria-hidden className="flex w-full gap-1.5">
        {v.dots.map((d, k) => (
          <span
            key={k}
            className={cn(
              'h-2 flex-1 rounded-full',
              d === 'done' && 'bg-primary',
              d === 'work' && 'bg-foreground',
              d === 'rest' && 'bg-water',
              d === 'todo' && 'bg-surface-3',
            )}
          />
        ))}
      </div>
      <p className="text-xs text-faint">{v.foot}</p>
    </section>
  );
}

function RoundsBody({
  def,
  state,
  comparison,
  onMark,
  onRound,
  onUnround,
  onSkipRest,
}: {
  def: CircuitDefinition;
  state: CircuitState;
  comparison: { text: string; tone: 'ok' | 'neutral' } | null;
  onMark: (count: number) => void;
  onRound: () => void;
  onUnround: () => void;
  onSkipRest: () => void;
}) {
  const forTime = def.format === 'FOR_TIME';
  const rounds = def.config.rounds ?? 1;

  if (state.status === 'done') {
    return (
      <section className="flex flex-col items-center gap-2.5 pt-8 text-center" aria-live="polite">
        <DoneMark />
        <p className="text-sm text-muted-foreground">
          {forTime && state.finalTimeSeconds !== null ? 'tempo final' : 'rounds + exercícios'}
        </p>
        <p className="font-display text-[64px] font-bold leading-none tracking-[-0.04em] tabular-nums">
          {forTime && state.finalTimeSeconds !== null
            ? formatClock(state.finalTimeSeconds)
            : `${state.roundsCompleted} + ${state.exerciseIndex}`}
        </p>
        <p className="text-sm text-muted-foreground">
          {circuitDoneLine(def, { ...state, totals: [] })}
        </p>
        {comparison && (
          <span
            className={cn(
              'inline-flex h-[22px] items-center rounded-pill px-[9px] text-[11px] font-extrabold uppercase tracking-[0.04em]',
              comparison.tone === 'ok'
                ? 'bg-[hsl(var(--success)/0.12)] text-success'
                : 'bg-surface-3 text-muted-foreground',
            )}
          >
            {comparison.text}
          </span>
        )}
      </section>
    );
  }

  const v = circuitRoundsView(def, state);
  const total = state.totalSeconds ?? 0;
  const ringOffset = total > 0 ? 100 - (state.clockSeconds / total) * 100 : 0;

  return (
    <>
      {forTime ? (
        <>
          <div className="flex items-center gap-4 rounded-[24px] bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-faint">tempo</p>
              <p className="font-display text-[52px] font-bold leading-none tracking-[-0.03em] tabular-nums">
                {formatClock(state.clockSeconds)}
              </p>
              <p className="text-xs text-faint">o cronômetro sobe até você terminar</p>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-xs text-faint">round</p>
              <p className="font-display text-[44px] font-bold leading-none tabular-nums">
                {Math.min(rounds, state.roundsCompleted + 1)}
                <span className="text-xl text-faint"> de {rounds}</span>
              </p>
            </div>
          </div>
          <div aria-hidden className="flex gap-1.5">
            {Array.from({ length: rounds }, (_, k) => (
              <span
                key={k}
                className={cn(
                  'h-2 flex-1 rounded-full',
                  k < state.roundsCompleted
                    ? 'bg-primary'
                    : k === state.roundsCompleted
                      ? 'bg-foreground'
                      : 'bg-surface-3',
                )}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-4 rounded-[24px] bg-card p-4">
          <div className="relative h-[132px] w-[132px] shrink-0">
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                strokeWidth="2.4"
                className="stroke-surface-3"
              />
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                strokeWidth="2.4"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="100"
                strokeDashoffset={ringOffset}
                className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums">
                {formatClock(state.clockSeconds)}
              </span>
              <span className="text-xs text-faint">
                {state.status === 'paused' ? 'pausado' : 'restam'}
              </span>
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center gap-2">
            <p className="text-xs text-faint">rounds completos</p>
            <p
              aria-live="polite"
              className="font-display text-[56px] font-bold leading-none tabular-nums"
            >
              {state.roundsCompleted}
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                aria-label="Tirar um round"
                disabled={state.roundsCompleted === 0}
                onClick={onUnround}
                className="anim-press flex h-10 w-10 items-center justify-center rounded-full bg-surface-3 text-foreground disabled:opacity-40"
              >
                <Minus size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={onRound}
                className="anim-press h-10 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                +1 round
              </button>
            </div>
          </div>
        </div>
      )}

      {v.resting ? (
        <div className="flex flex-col items-center gap-1 py-1 text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-water">
            descanso
          </p>
          <p className="font-display text-[28px] font-bold tabular-nums">
            {formatClock(v.resting.seconds)}
          </p>
          <p className="text-xs text-faint">a seguir · {v.resting.next}</p>
          <button
            type="button"
            onClick={onSkipRest}
            className="anim-press mt-1 h-10 rounded-full bg-muted px-4 text-sm font-bold text-foreground"
          >
            Pular descanso
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-0.5 py-1 text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-faint">agora</p>
          <p className="font-display text-[28px] font-bold">{v.now}</p>
          <p className="text-xs text-faint">toque no exercício quando terminar</p>
        </div>
      )}

      <ul aria-label="Exercícios do round" className="rounded-[20px] bg-card px-4">
        {v.items.map((item, i) => {
          const current = item.status === 'current';
          return (
            <li
              key={`${item.name}-${i}`}
              className={cn(i > 0 && !current && 'border-t border-border')}
            >
              <button
                type="button"
                disabled={item.status === 'done' || v.resting !== null}
                aria-label={
                  item.status === 'done' ? `${item.name}, feito` : `Terminei ${item.name}`
                }
                // Tocar num exercício adiante marca também os anteriores do round.
                onClick={() => onMark(i - state.exerciseIndex + 1)}
                className={cn(
                  'flex min-h-[60px] w-full items-center gap-3 text-left text-foreground',
                  current &&
                    '-mx-4 w-[calc(100%+2rem)] bg-gradient-to-r from-primary-soft to-transparent px-4',
                  item.status === 'done' && 'opacity-50',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full',
                    item.status === 'done'
                      ? 'bg-primary text-primary-foreground'
                      : 'shadow-[inset_0_0_0_2px_hsl(var(--border-strong))]',
                  )}
                >
                  {item.status === 'done' && <Check size={14} strokeWidth={3} />}
                </span>
                <span className="flex-1 text-[15px] font-semibold">{item.name}</span>
                <span className="text-sm font-bold tabular-nums">{item.value}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!forTime && (
        <p className="px-1 text-xs text-faint">
          Ao marcar o último, o round conta sozinho. Se perder a conta, use +1 round.
        </p>
      )}
    </>
  );
}
