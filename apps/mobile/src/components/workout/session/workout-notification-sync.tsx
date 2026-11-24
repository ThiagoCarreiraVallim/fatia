import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  setDraftKey,
  workoutApi,
  type LoadPrescription,
  type SetDraft,
  type WorkoutSession,
} from '@fatia/api-client';
import { RestCountdown } from '../../../../modules/rest-countdown';
import { useActiveSession } from '@/components/layout/bottom-nav';
import { Notifications } from '@/notifications/native';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { setRestNotificationExercise } from './expo-rest-notifier';
import { isRestNotification } from './rest-notification';
import { useSessionRestTimer } from './rest-timer-provider';
import {
  useCurrentExercise,
  useEndedExercises,
  usePendingExercises,
} from './use-pending-exercises';
import {
  applyWorkoutAction,
  lastSetKey,
  prescriptionKey,
  sessionGroups,
  type WorkoutActionContext,
  type WorkoutNotifier,
} from './workout-action';
import {
  currentGroup,
  nativePayload,
  parseWorkoutAction,
  predictedSet,
  workoutNotification,
} from './workout-notification';

/**
 * A notificação fixa do treino no Android (#472, `docs/NOTIFICACAO_TREINO.md`).
 *
 * Mora acima das telas, junto do descanso global (`RestTimerProvider`): a
 * notificação vale com a sessão minimizada, o app em segundo plano e a tela
 * bloqueada. Desenha o que `workoutNotification` decide (com o estado de depois
 * do descanso, que o nativo troca sozinho no prazo) e responde aos botões pelo
 * `applyWorkoutAction` — a mesma regra para o toque com o app aberto, em
 * segundo plano ou guardado com o app encerrado (`consumePendingActions`).
 *
 * No iOS não há notificação fixa: o aviso do fim do descanso ganha os botões
 * "Registrar série" e "+15 s" (`expo-rest-notifier.ts`), e a resposta passa
 * por aqui. No Expo Go do Android, sem módulo nenhum, fica o de antes.
 */
const enabled = RestCountdown != null || Notifications != null;

const notifier: WorkoutNotifier | null = RestCountdown
  ? {
      post(notification) {
        try {
          RestCountdown?.update(nativePayload(notification));
        } catch {
          // É o extra: sem ela o treino segue na tela e o fim do descanso avisa.
        }
      },
      hide() {
        try {
          RestCountdown?.hide();
        } catch {
          // idem
        }
      },
    }
  : null;

export function WorkoutNotificationSync() {
  const active = useActiveSession(enabled);
  const session = active.data;
  // Circuito tem o relógio e os alarmes dele (#380).
  if (!enabled || !session || session.circuit) return <HideWorkoutNotification />;
  return <SessionNotification key={session.id} session={session} />;
}

function HideWorkoutNotification() {
  useEffect(() => {
    notifier?.hide();
  }, []);
  return null;
}

function SessionNotification({ session }: { session: WorkoutSession }) {
  const qc = useQueryClient();
  const rest = useSessionRestTimer();
  const units = useUnitPrefs();
  const { pending } = usePendingExercises(session.id);
  const { ended } = useEndedExercises(session.id);
  const { current: currentId } = useCurrentExercise(session.id);

  const groups = useMemo(() => sessionGroups(session, pending, ended), [session, pending, ended]);
  const group = currentGroup(groups, currentId);

  // As mesmas chaves do card da série: o cache é dividido com a tela.
  const exerciseId = group?.exerciseId ?? 0;
  const previous = useQuery({
    queryKey: lastSetKey(exerciseId, session.startedAt),
    queryFn: () => workoutApi.getLastSet(exerciseId, session.startedAt),
    enabled: group != null && !group.isCardio,
  });
  const prescription = useQuery({
    queryKey: prescriptionKey(exerciseId, group?.targetReps),
    queryFn: () => workoutApi.getPrescription(exerciseId, group?.targetReps),
    enabled: group != null && !group.isCardio,
    staleTime: 60_000,
  });
  // O rascunho só é lido (o card escreve); `enabled: false` ainda acompanha o cache.
  const draft = useQuery({
    queryKey: setDraftKey(session.id, exerciseId),
    queryFn: () => qc.getQueryData<SetDraft>(setDraftKey(session.id, exerciseId)) ?? null,
    enabled: false,
  });

  // Anotado à mão para o `status` estreitar a união (o mesmo do card da série).
  const prescribed: LoadPrescription | undefined = prescription.data;
  const ok = prescribed?.status === 'ok' ? prescribed : null;
  const predicted =
    group && !group.isCardio
      ? predictedSet({
          group,
          draft: draft.data ?? undefined,
          previousSessionSet: previous.data ?? null,
          prescription: ok,
        })
      : null;
  const content = workoutNotification({
    sessionId: session.id,
    group,
    predicted,
    restDeadline: rest.deadline,
    units,
  });

  // O "Registrar série" do aviso do fim do descanso (iOS) é deste exercício.
  const restExercise = group && !group.isCardio ? group.exerciseId : null;
  useEffect(() => {
    setRestNotificationExercise(restExercise);
    return () => setRestNotificationExercise(null);
  }, [restExercise]);

  // O nativo só recebe o que mudou: o card escreve o rascunho a cada tecla.
  const serialized = nativePayload(content);
  useEffect(() => {
    try {
      RestCountdown?.update(serialized);
    } catch {
      // É o extra: sem ela o treino segue na tela e o fim do descanso avisa.
    }
  }, [serialized]);
  useEffect(() => () => notifier?.hide(), []);

  // Permissão concedida com a notificação já montada (Android 13+): o nativo
  // guardou o último estado e o desenha quando o app volta à frente.
  useEffect(() => {
    if (!RestCountdown) return;
    const refresh = () => {
      try {
        RestCountdown?.refresh();
      } catch {
        // idem
      }
    };
    const change = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const focus = AppState.addEventListener('focus', refresh);
    return () => {
      change.remove();
      focus.remove();
    };
  }, []);

  // O toque chega a qualquer momento; o tratador lê o estado mais recente.
  const ctxRef = useRef<WorkoutActionContext | null>(null);
  const inFlight = useRef(new Set<string>());
  useEffect(() => {
    ctxRef.current = { qc, session, rest, notifier, units, inFlight: inFlight.current };
  });

  const handle = useCallback((raw: unknown) => {
    const action = parseWorkoutAction(raw);
    const ctx = ctxRef.current;
    if (!action || !ctx) return;
    void applyWorkoutAction(ctx, action).finally(() => {
      // Solta o broadcast segurado pelo receiver (`goAsync`).
      if (action.requestId) {
        try {
          RestCountdown?.finishAction(action.requestId);
        } catch {
          // O nativo solta sozinho no tempo limite.
        }
      }
    });
  }, []);

  // iOS: os botões do aviso do fim do descanso. A série é a próxima do
  // exercício na hora do toque, com os valores previstos nessa hora.
  useEffect(() => {
    if (!Notifications) return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (!isRestNotification(data)) return;
      const id = response.actionIdentifier;
      if (id !== 'log-set' && id !== 'rest-plus') return;
      const exerciseId =
        typeof data === 'object' && data && typeof data.exerciseId === 'number'
          ? data.exerciseId
          : null;
      const ctx = ctxRef.current;
      if (ctx) void applyWorkoutAction(ctx, { id, token: null }, exerciseId);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!RestCountdown) return;
    const subscription = RestCountdown.addListener('onAction', handle);
    // Toques feitos com o app encerrado: valem agora, se a oferta ainda for a
    // desta sessão e desta série (`resolveWorkoutAction`).
    try {
      for (const pendingAction of RestCountdown.consumePendingActions()) handle(pendingAction);
    } catch {
      // Sem a fila, nada a aplicar.
    }
    return () => subscription.remove();
  }, [handle]);

  return null;
}
