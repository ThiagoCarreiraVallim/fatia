import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import { expoRestNotifier } from './expo-rest-notifier';
import { createRestNotifications, restWasInterrupted } from './rest-notification';

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
 * O aviso do fim é háptico, visual e, desde a #182, também uma notificação
 * local: com o app em segundo plano ou a tela apagada — que é o que a pessoa
 * faz durante o descanso — o `setInterval` é estrangulado e o háptico só
 * dispara quando o app volta, ou seja, tarde. A notificação é agendada pelo
 * sistema, então chega na hora mesmo com o JS parado.
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

  const notifications = useMemo(() => createRestNotifications(expoRestNotifier), []);

  // O `deadline` é a única fonte da verdade do descanso, então a notificação
  // acompanha ele e não os botões: iniciar, `+30s` e retomar reagendam; pausar
  // e pular cancelam. Amarrar isso a cada handler deixaria de fora justamente o
  // caminho que ninguém lembra — sair da sessão com o descanso correndo, que
  // aqui é só o desmonte.
  useEffect(() => {
    if (deadline == null) return;
    void notifications.schedule(deadline);
    // A limpeza é quem cancela, e cobre os quatro jeitos de o descanso acabar
    // antes da hora: pausar, pular, esticar com `+30s` (que reagenda) e sair da
    // sessão com o descanso correndo. O que ela não pode fazer é cancelar o
    // aviso do descanso que chegou ao fim — ver `restWasInterrupted`.
    return () => {
      if (restWasInterrupted(deadline, Date.now())) void notifications.cancel();
    };
  }, [deadline, notifications]);

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
