'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  appendCircuitEvents,
  circuitCue,
  circuitFinishBody,
  circuitState,
  workoutApi,
  type CircuitEvent,
  type CircuitEventType,
  type CircuitSessionData,
  type WorkoutSession,
} from '@fatia/api-client';
import { playCircuitCue, unlockCircuitSound } from './circuit-sound';

const SOUND_KEY = 'fatia.circuit.sound';

function readSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * O relógio do circuito na tela. O estado sai de `circuitState` (api-client)
 * a cada desenho, a partir do começo e dos toques com horário: o intervalo só
 * pede um desenho novo, e aba escondida ou celular bloqueado não atrasam nada.
 *
 * Cada toque vai para a API (`PUT /workout/sessions/:id/circuit`): outra aba ou
 * o app retomam do mesmo ponto. Envios em fila, o último sempre vence.
 */
export function useCircuitRun(session: WorkoutSession & { circuit: CircuitSessionData }) {
  const qc = useQueryClient();
  const router = useRouter();
  const data = session.circuit;
  const def = data.definition;
  const startedAt = useMemo(() => Date.parse(data.startedAt), [data.startedAt]);
  const [events, setEvents] = useState<CircuitEvent[]>(data.events);
  const [now, setNow] = useState(() => Date.now());
  // Só monta com a sessão carregada (nunca no servidor): ler o armazenamento aqui é seguro.
  const [sound, setSound] = useState(readSound);

  const run = useMemo(() => ({ startedAt, events }), [startedAt, events]);
  const state = useMemo(() => circuitState(def, run, now), [def, run, now]);
  const done = state.status === 'done';

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [done]);

  // Som e vibração nas trocas, na contagem de 3 e no fim.
  const prev = useRef(state);
  useEffect(() => {
    const cue = circuitCue(prev.current, state);
    prev.current = state;
    if (cue) playCircuitCue(cue, { sound });
  }, [state, sound]);

  // Fila de gravação: um envio por vez, sempre com a lista mais nova.
  const latest = useRef(events);
  const sending = useRef(false);
  const dirty = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const flush = useCallback(async () => {
    if (sending.current) {
      dirty.current = true;
      return;
    }
    sending.current = true;
    try {
      do {
        dirty.current = false;
        await workoutApi.saveCircuitProgress(session.id, latest.current);
      } while (dirty.current);
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    } finally {
      sending.current = false;
    }
  }, [session.id]);

  const push = useCallback(
    (type: CircuitEventType, count = 1) => {
      unlockCircuitSound();
      const at = Date.now();
      setNow(at);
      setEvents((prevEvents) => {
        // O teto guarda lugar para o "Encerrar" (`appendCircuitEvents`).
        const next = appendCircuitEvents(prevEvents, type, count, at);
        if (next === prevEvents) return prevEvents;
        latest.current = next;
        // A barra do treino em andamento lê a sessão do cache.
        qc.setQueryData<WorkoutSession | null>(['workout', 'active'], (s) =>
          s && s.id === session.id && s.circuit
            ? { ...s, circuit: { ...s.circuit, events: next } }
            : s,
        );
        return next;
      });
      queueMicrotask(() => void flush());
    },
    [flush, qc, session.id],
  );

  const toggleSound = () => {
    unlockCircuitSound();
    setSound((on) => {
      try {
        window.localStorage.setItem(SOUND_KEY, on ? 'off' : 'on');
      } catch {
        // Sem armazenamento: vale só nesta tela.
      }
      return !on;
    });
  };

  const finish = useMutation({
    mutationFn: () => workoutApi.finishCircuit(session.id, circuitFinishBody(def, run, Date.now())),
    onSuccess: () => {
      qc.setQueryData(['workout', 'active'], null);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'sessions'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'session', session.id] });
      router.push(`/workout/session/${session.id}`);
    },
  });

  return {
    def,
    state,
    events,
    sound,
    toggleSound,
    push,
    finish,
    saveFailed,
    previous: data.previous,
  };
}
