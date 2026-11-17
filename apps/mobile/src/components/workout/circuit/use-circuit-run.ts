import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import {
  MAX_CIRCUIT_EVENTS,
  circuitCue,
  circuitFinishBody,
  circuitState,
  workoutApi,
  type CircuitEvent,
  type CircuitEventType,
  type CircuitSessionData,
  type WorkoutSession,
} from '@fatia/api-client';
import { circuitAlarmNotices } from './circuit-alarms';
import { createCircuitNoticeScheduler } from './circuit-notice-scheduler';
import {
  cancelCircuitNotices,
  playCircuitCue,
  preloadCircuitSounds,
  releaseCircuitSounds,
  scheduleCircuitNotices,
} from './circuit-feedback';

/**
 * O relógio do circuito no app. Mesma conta da web (`use-circuit-run.ts` do
 * PWA): o estado sai de `circuitState` a cada desenho, a partir do começo e dos
 * toques com horário, e cada toque vai para a API. A tela fica acesa
 * (`expo-keep-awake`); se o app vai para o fundo ou a tela bloqueia, as trocas
 * que faltam viram avisos agendados do sistema, cancelados na volta.
 */
export function useCircuitRun(session: WorkoutSession & { circuit: CircuitSessionData }) {
  useKeepAwake();
  const qc = useQueryClient();
  const router = useRouter();
  const data = session.circuit;
  const def = data.definition;
  const startedAt = useMemo(() => Date.parse(data.startedAt), [data.startedAt]);
  const [events, setEvents] = useState<CircuitEvent[]>(data.events);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(true);

  const run = useMemo(() => ({ startedAt, events }), [startedAt, events]);
  const state = useMemo(() => circuitState(def, run, now), [def, run, now]);
  const done = state.status === 'done';

  useEffect(() => {
    preloadCircuitSounds();
    return releaseCircuitSounds;
  }, []);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [done]);

  const prev = useRef(state);
  useEffect(() => {
    const cue = circuitCue(prev.current, state);
    prev.current = state;
    if (cue) playCircuitCue(cue, { sound });
  }, [state, sound]);

  // Fundo e tela bloqueada: as trocas viram avisos do sistema.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(() => {
    const notices = createCircuitNoticeScheduler({
      notices: (now) => circuitAlarmNotices(def, runRef.current, now),
      schedule: scheduleCircuitNotices,
      cancel: (ids) => void cancelCircuitNotices(ids),
    });
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        notices.active();
        setNow(Date.now());
      } else if (next === 'background') {
        notices.background();
      }
    });
    return () => {
      sub.remove();
      notices.dispose();
    };
  }, [def]);

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
      const at = Date.now();
      setNow(at);
      setEvents((prevEvents) => {
        if (prevEvents.length + count > MAX_CIRCUIT_EVENTS) return prevEvents;
        const next = [...prevEvents, ...Array.from({ length: count }, () => ({ type, at }))];
        latest.current = next;
        qc.setQueryData<WorkoutSession | null>(['workout', 'active'], (s) =>
          s && s.id === session.id && s.circuit
            ? { ...s, circuit: { ...s.circuit, events: next } }
            : s,
        );
        return next;
      });
      setTimeout(() => void flush(), 0);
    },
    [flush, qc, session.id],
  );

  const finish = useMutation({
    mutationFn: () => workoutApi.finishCircuit(session.id, circuitFinishBody(def, run, Date.now())),
    onSuccess: () => {
      qc.setQueryData(['workout', 'active'], null);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'sessions'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'session', session.id] });
      router.replace(`/workout/session/${session.id}` as Href);
    },
  });

  return {
    def,
    state,
    sound,
    toggleSound: () => setSound((on) => !on),
    push,
    finish,
    saveFailed,
    previous: data.previous,
  };
}
