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
  next,
}: {
  timer: RestTimerState;
  /** O que o mostrador exibe, e o que "Iniciar" usa, enquanto nada conta. */
  idleSeconds?: number;
  /** "Próxima: série 3 · 52,5 kg × 8" — o que vem depois do descanso. */
  next?: string | null;
}) {
  const idle = timer.remaining == null;
  const seconds = timer.remaining ?? idleSeconds ?? timer.total;
  const total = idle ? seconds : timer.total;
  const elapsedRatio = total > 0 ? 1 - Math.min(1, seconds / total) : 0;

  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div className="rounded-card border border-water/35 bg-card p-4">
      <div className="flex items-center gap-4">
        {/* O anel esvazia conforme o descanso passa. Sem região viva no número:
            anunciar cada segundo atropelaria o leitor de tela. Quem fala é o
            aviso do fim, logo abaixo. */}
        <div role="timer" aria-label="Descanso" className="relative h-[104px] w-[104px] shrink-0">
          <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="52" cy="52" r={R} fill="none" strokeWidth="7" className="stroke-muted" />
            <circle
              cx="52"
              cy="52"
              r={R}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * elapsedRatio}
              className="stroke-water transition-[stroke-dashoffset] duration-500"
            />
          </svg>
          <p className="absolute inset-0 flex items-center justify-center font-display text-[26px] font-semibold text-foreground tabular-nums">
            {formatCountdown(seconds)}
          </p>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[13px] font-bold text-water">
            {idle ? 'Descanso' : timer.running ? 'Descansando' : 'Pausado'}
          </p>
          {next && <p className="truncate text-[13px] text-muted-foreground">{next}</p>}
          <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Montada sempre, e não junto com o texto: um `aria-live` que nasce já
          preenchido costuma não ser anunciado. */}
      <p
        role="status"
        aria-live="polite"
        className="mt-2 text-center text-[11px] font-bold text-water empty:hidden"
      >
        {timer.finished ? 'Descanso terminado. Hora da próxima série.' : ''}
      </p>

      {!idle && (
        <button
          type="button"
          onClick={timer.stop}
          className="anim-press mt-3 flex h-[60px] w-full items-center justify-center gap-1.5 rounded-full bg-water text-base font-extrabold text-[#06121f]"
        >
          <SkipForward size={18} aria-hidden />
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
      className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-muted px-3 text-foreground hover:bg-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}
