'use client';

import type { ReactNode } from 'react';
import { Pause, Play, SkipForward } from 'lucide-react';
import { formatCountdown } from './format';
import type { RestTimer as RestTimerState } from './use-rest-timer';

/**
 * Bloco de descanso do card de série (prancha Al-T3): anel, `−15 s`, pausar,
 * `+15 s` e pular. Antes o descanso só contava — quem
 * precisava de mais meio minuto ou já estava pronto não tinha o que fazer.
 *
 * Parado, mostra o descanso que vai valer (`idleSeconds`, o prescrito para o
 * exercício) e oferece começar na mão; registrar a série também começa.
 * Alvos de 44px porque a mão que os toca acabou de largar a barra.
 */
export function RestTimer({
  timer,
  idleSeconds,
}: {
  timer: RestTimerState;
  /** O que o mostrador exibe, e o que "Iniciar" usa, enquanto nada conta. */
  idleSeconds?: number;
}) {
  const idle = timer.remaining == null;
  const seconds = timer.remaining ?? idleSeconds ?? timer.total;
  const total = idle ? seconds : timer.total;
  const elapsedRatio = total > 0 ? 1 - Math.min(1, seconds / total) : 0;

  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div className="rounded-3xl bg-muted/40 px-4 py-4">
      <p className="text-center text-[11px] font-bold tracking-wide text-muted-foreground">
        Descanso
      </p>

      {/* O anel enche conforme o descanso passa. Sem região viva no número:
          anunciar cada segundo atropelaria o leitor de tela. Quem fala é o
          aviso do fim, logo abaixo. */}
      <div role="timer" aria-label="Descanso" className="relative mx-auto mt-2 h-32 w-32">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="8" className="stroke-muted" />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - elapsedRatio)}
            className="stroke-primary transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <p className="absolute inset-0 flex items-center justify-center text-3xl font-extrabold text-foreground tabular-nums">
          {formatCountdown(seconds)}
        </p>
      </div>

      {/* Montada sempre, e não junto com o texto: um `aria-live` que nasce já
          preenchido costuma não ser anunciado. */}
      <p
        role="status"
        aria-live="polite"
        className="mt-2 text-center text-[11px] font-bold text-primary empty:hidden"
      >
        {timer.finished ? 'Descanso terminado. Hora da próxima série.' : ''}
      </p>

      <div className="mt-3 flex items-center justify-center gap-2">
        {idle ? (
          <Control label="Iniciar descanso" onClick={() => timer.start(idleSeconds)}>
            <Play size={16} />
          </Control>
        ) : (
          <>
            <Control
              label="Tirar 15 segundos do descanso"
              disabled={timer.finished}
              onClick={() => timer.addTime(-15)}
            >
              <span className="text-xs font-bold">−15 s</span>
            </Control>
            <Control
              label={timer.running ? 'Pausar descanso' : 'Retomar descanso'}
              disabled={timer.finished}
              onClick={timer.toggle}
            >
              {timer.running ? <Pause size={16} /> : <Play size={16} />}
            </Control>
            <Control label="Somar 15 segundos ao descanso" onClick={() => timer.addTime(15)}>
              <span className="text-xs font-bold">+15 s</span>
            </Control>
          </>
        )}
      </div>
      {!idle && (
        <button
          type="button"
          onClick={timer.stop}
          className="anim-press mx-auto mt-2 flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold text-primary"
        >
          <SkipForward size={16} aria-hidden />
          Pular descanso
        </button>
      )}
    </div>
  );
}

function Control({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-background px-3 text-foreground hover:bg-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}
