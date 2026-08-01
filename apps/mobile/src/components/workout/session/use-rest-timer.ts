import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Cronômetro de descanso da sessão.
 *
 * Mora fora do card de propósito: quando a última série de um exercício é
 * registrada, o foco passa para o próximo e o card antigo desmonta. Com o estado
 * dentro dele, o descanso zeraria justamente na hora em que ele mais importa.
 *
 * A contagem vem de um instante-alvo (`deadline`) e não de um contador
 * decrementado a cada tique: o `setInterval` do JS é estrangulado quando o app
 * vai para segundo plano, e um contador acumularia atraso enquanto a pessoa
 * responde uma mensagem no meio da série.
 *
 * O aviso do fim é háptico e visual. Notificação local seria melhor com a tela
 * apagada, mas `expo-notifications` não é dependência do app — ver o relatório
 * da issue #126.
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
      if (left === 0) {
        setDeadline(null);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        AccessibilityInfo.announceForAccessibility('Descanso terminado. Hora da próxima série.');
      }
    };

    tick();
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

  const addTime = useCallback((seconds: number) => {
    setTotal((current) => Math.max(5, current + seconds));
    setRemaining((current) => (current == null ? null : Math.max(0, current + seconds)));
    setDeadline((current) => (current == null ? null : current + seconds * 1000));
  }, []);

  const toggle = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
