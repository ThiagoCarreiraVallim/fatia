'use client';

import type { ReactNode } from 'react';
import { Pause, Play, Plus, SkipForward, Timer } from 'lucide-react';
import { formatCountdown } from './format';
import type { RestTimer as RestTimerState } from './use-rest-timer';

/**
 * Bloco de descanso do card de série, com os controles que o app ganhou e o
 * PWA não tinha: `+30s`, pausar e pular. Antes o descanso só contava — quem
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

  return (
    <div className="rounded-xl bg-muted/40 px-4 py-3">
      <div className="flex items-center justify-center gap-2 text-primary">
        <Timer size={16} aria-hidden />
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground">
          TEMPO DE DESCANSO
        </p>
      </div>

      {/* Sem região viva no número: anunciar cada segundo atropelaria o leitor
          de tela. Quem fala é o aviso do fim, logo abaixo. */}
      <p className="mt-1 text-center text-3xl font-extrabold text-primary tabular-nums">
        {formatCountdown(seconds)}
      </p>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-blue-500 transition-all"
          style={{ width: `${Math.round(elapsedRatio * 100)}%` }}
        />
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

      <div className="mt-2 flex items-center justify-center gap-2">
        {idle ? (
          <Control label="Iniciar descanso" onClick={() => timer.start(idleSeconds)}>
            <Play size={16} />
          </Control>
        ) : (
          <>
            <Control label="Somar 30 segundos ao descanso" onClick={() => timer.addTime(30)}>
              <Plus size={16} />
              <span className="text-xs font-bold">30s</span>
            </Control>
            <Control
              label={timer.running ? 'Pausar descanso' : 'Retomar descanso'}
              disabled={timer.finished}
              onClick={timer.toggle}
            >
              {timer.running ? <Pause size={16} /> : <Play size={16} />}
            </Control>
            <Control label="Pular descanso" onClick={timer.stop}>
              <SkipForward size={16} />
            </Control>
          </>
        )}
      </div>
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
