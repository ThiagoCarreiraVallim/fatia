'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Cronômetro de descanso da sessão — o `use-rest-timer.ts` do app, sem o que só
 * existe no celular (háptico, notificação local, contagem na tela de bloqueio).
 *
 * Mora na página, e não no card, de propósito: quando a última série de um
 * exercício é registrada, o foco passa para o próximo e o card antigo desmonta.
 * Com o estado dentro dele, o descanso zerava justamente na hora em que ele
 * mais importa — era o que acontecia no PWA até aqui.
 *
 * A contagem vem de um instante-alvo (`deadline`) e não de um contador
 * decrementado a cada tique: o navegador estrangula o `setInterval` de aba em
 * segundo plano, e um contador acumularia atraso enquanto a pessoa responde
 * uma mensagem entre as séries.
 */

export const DEFAULT_REST_SECONDS = 90;

export interface RestTimer {
  /** Segundos restantes. `null` enquanto nenhum descanso foi iniciado. */
  remaining: number | null;
  /** Duração da rodada atual, para a barra de progresso. */
  total: number;
  running: boolean;
  finished: boolean;
  start: (seconds?: number) => void;
  addTime: (seconds: number) => void;
  toggle: () => void;
  stop: () => void;
}

export function useRestTimer(defaultSeconds: number = DEFAULT_REST_SECONDS): RestTimer {
  const [total, setTotal] = useState(defaultSeconds);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (deadline == null) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setDeadline(null);
    };

    tick();
    // Meio segundo, e não um: com o tique de 1s alinhado ao contrário do
    // relógio, o mostrador pularia um número de vez em quando.
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadline]);

  const start = useCallback(
    (seconds?: number) => {
      const duration = Math.max(5, Math.round(seconds ?? total));
      setTotal(duration);
      setRemaining(duration);
      setDeadline(Date.now() + duration * 1000);
    },
    [total],
  );

  // `+30s` mexe no alvo, no total e no que resta ao mesmo tempo: só o alvo
  // bastaria para a contagem, mas a barra (restante ÷ total) andaria para trás.
  const addTime = useCallback(
    (seconds: number) => {
      setTotal((current) => Math.max(5, current + seconds));
      setRemaining((current) => (current == null ? null : Math.max(0, current + seconds)));
      setDeadline((current) => {
        if (current != null) return current + seconds * 1000;
        // Zerou e a pessoa pediu mais meio minuto: volta a contar. No app o
        // `+30s` depois do fim deixava o descanso parado em 00:30, esperando
        // um "retomar" que ninguém lembra de tocar. Pausado, segue pausado.
        if (remaining === 0) return Date.now() + seconds * 1000;
        return null;
      });
    },
    [remaining],
  );

  // Pausar guarda o que resta e esquece o alvo; retomar recria o alvo a partir
  // de agora. Pausado, nada conta — nem com a aba em segundo plano.
  const toggle = useCallback(() => {
    setDeadline((current) => {
      if (current != null) return null;
      if (remaining == null || remaining <= 0) return null;
      return Date.now() + remaining * 1000;
    });
  }, [remaining]);

  const stop = useCallback(() => {
    setDeadline(null);
    setRemaining(null);
  }, []);

  return useMemo(
    () => ({
      remaining,
      total,
      running: deadline != null,
      finished: remaining === 0,
      start,
      addTime,
      toggle,
      stop,
    }),
    [remaining, total, deadline, start, addTime, toggle, stop],
  );
}
