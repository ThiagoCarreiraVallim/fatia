import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  buildExerciseGroups,
  endedExercisesKey,
  markEndedExercises,
  orderExerciseGroups,
  pendingExercisesKey,
  setDraftKey,
  workoutApi,
  type ExerciseGroup,
  type LoadPrescription,
  type PendingExercise,
  type SessionSet,
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
import type { RestTimer } from './use-rest-timer';
import {
  useCurrentExercise,
  useEndedExercises,
  usePendingExercises,
} from './use-pending-exercises';
import {
  currentGroup,
  nextSetToken,
  parseWorkoutAction,
  predictedSet,
  resolveWorkoutAction,
  workoutNotification,
  type WorkoutActionToken,
} from './workout-notification';

/**
 * A notificação fixa do treino no Android (#472, `docs/NOTIFICACAO_TREINO.md`).
 *
 * Mora acima das telas, junto do descanso global (`RestTimerProvider`): a
 * notificação vale com a sessão minimizada, o app em segundo plano e a tela
 * bloqueada. Desenha o que `workoutNotification` decide e responde aos botões
 * pelo `resolveWorkoutAction` — a mesma regra para o toque com o app aberto, em
 * segundo plano ou guardado com o app encerrado (`consumePendingActions`).
 *
 * No iOS não há notificação fixa: o aviso do fim do descanso ganha os botões
 * "Registrar série" e "+15 s" (`expo-rest-notifier.ts`), e a resposta passa
 * por aqui. No Expo Go do Android, sem módulo nenhum, fica o de antes.
 */
const enabled = RestCountdown != null || Notifications != null;

export function WorkoutNotificationSync() {
  const active = useActiveSession(enabled);
  const session = active.data;
  // Circuito tem o relógio e os alarmes dele (#380).
  if (!enabled || !session || session.circuit) return <HideWorkoutNotification />;
  return <SessionNotification key={session.id} session={session} />;
}

function HideWorkoutNotification() {
  useEffect(() => {
    try {
      RestCountdown?.hide();
    } catch {
      // É o extra: sem ela o treino segue na tela.
    }
  }, []);
  return null;
}

/** Último descanso prescrito, para o descanso de depois de um registro pela notificação. */
type Prescription = LoadPrescription | undefined;

function sessionGroups(
  session: WorkoutSession,
  pending: PendingExercise[] | undefined,
  ended: number[] | undefined,
): ExerciseGroup[] {
  return markEndedExercises(
    orderExerciseGroups(
      buildExerciseGroups(session.plannedExercises, session.sets, pending ?? []),
      session.exerciseOrder,
    ),
    ended,
  );
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
    queryKey: ['workout', 'last-set', exerciseId, session.startedAt],
    queryFn: () => workoutApi.getLastSet(exerciseId, session.startedAt),
    enabled: group != null && !group.isCardio,
  });
  const prescription = useQuery({
    queryKey: ['workout', 'prescription', exerciseId, group?.targetReps],
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
  const serialized = JSON.stringify(content);
  useEffect(() => {
    const c = JSON.parse(serialized) as typeof content;
    try {
      RestCountdown?.update(
        c.title,
        c.body,
        c.restDeadline ?? 0,
        c.actions.map((a) => a.id),
        c.actions.map((a) => a.label),
        c.token ? JSON.stringify(c.token) : '',
      );
    } catch {
      // É o extra: sem ela o treino segue na tela e o fim do descanso avisa.
    }
  }, [serialized]);
  useEffect(
    () => () => {
      try {
        RestCountdown?.hide();
      } catch {
        // idem
      }
    },
    [],
  );

  // O toque chega a qualquer momento; o tratador lê o estado mais recente.
  const restRef = useRef(rest);
  useEffect(() => {
    restRef.current = rest;
  }, [rest]);
  const inFlight = useRef(new Set<string>());

  const handle = useCallback(
    (raw: unknown) => {
      const action = parseWorkoutAction(raw);
      if (!action) return;
      void applyAction(qc, session, action, restRef.current, inFlight.current);
    },
    [qc, session],
  );

  // iOS: os botões do aviso do fim do descanso. A série é a próxima do
  // exercício na hora do toque (`nextSetToken`).
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
      void applyAction(
        qc,
        session,
        { id, token: null },
        restRef.current,
        inFlight.current,
        exerciseId,
      );
    });
    return () => subscription.remove();
  }, [qc, session]);

  useEffect(() => {
    if (!RestCountdown) return;
    const subscription = RestCountdown.addListener('onAction', handle);
    // Toques feitos com o app encerrado: valem agora, se a série ainda for a mesma.
    try {
      for (const pendingAction of RestCountdown.consumePendingActions()) handle(pendingAction);
    } catch {
      // Sem a fila, nada a aplicar.
    }
    return () => subscription.remove();
  }, [handle]);

  return null;
}

/**
 * Aplica o toque. "Registrar série" relê a sessão do servidor antes de decidir:
 * o cache pode estar velho com o app em segundo plano, e é a contagem de
 * séries de agora que diz se o toque ainda vale.
 */
async function applyAction(
  qc: QueryClient,
  session: WorkoutSession,
  action: { id: string; token: WorkoutActionToken | null },
  rest: RestTimer,
  inFlight: Set<string>,
  /** Toque sem série marcada (iOS): registra a próxima deste exercício. */
  nextOf: number | null = null,
): Promise<void> {
  const quick = resolveWorkoutAction(action, []);
  if (quick.type === 'rest') {
    // Descanso já acabado (o "+15 s" do aviso do fim): começa um de 15 s.
    if (rest.deadline == null) {
      if (quick.delta > 0) rest.start(quick.delta);
    } else {
      rest.addTime(quick.delta);
    }
    return;
  }
  if (quick.type === 'skip-rest') {
    rest.stop();
    return;
  }
  if (action.id !== 'log-set' || (!action.token && nextOf == null)) return;

  try {
    const fresh = await qc.fetchQuery({
      queryKey: ['workout', 'session', session.id],
      queryFn: () => workoutApi.getSession(session.id),
      staleTime: 0,
    });
    const groups = sessionGroups(
      fresh,
      qc.getQueryData<PendingExercise[]>(pendingExercisesKey(session.id)),
      qc.getQueryData<number[]>(endedExercisesKey(session.id)),
    );
    const token = action.token ?? (nextOf != null ? nextSetToken(groups, nextOf) : null);
    const plan = resolveWorkoutAction({ id: action.id, token }, groups);
    if (plan.type !== 'log' || inFlight.has(plan.clientKey)) return;
    const group = groups.find((g) => g.exerciseId === plan.exerciseId);
    if (!group) return;

    inFlight.add(plan.clientKey);
    try {
      const prescription = qc.getQueryData<Prescription>([
        'workout',
        'prescription',
        group.exerciseId,
        group.targetReps,
      ]);
      const ok = prescription?.status === 'ok' ? prescription : null;
      const values = predictedSet({
        group,
        draft: qc.getQueryData<SetDraft>(setDraftKey(session.id, group.exerciseId)),
        previousSessionSet: qc.getQueryData<SessionSet | null>([
          'workout',
          'last-set',
          group.exerciseId,
          session.startedAt,
        ]),
        prescription: ok,
      });
      await workoutApi.logSet(session.id, {
        exerciseId: group.exerciseId,
        weightKg: values.weightKg,
        reps: values.reps || undefined,
        clientKey: plan.clientKey,
      });
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'session', session.id] });
      // Como na tela: registrada a série, começa o descanso (o prescrito, se houver).
      rest.start(ok?.restSeconds);
    } finally {
      inFlight.delete(plan.clientKey);
    }
  } catch {
    // Sem rede: a notificação continua oferecendo a mesma série, e a chave fixa
    // faz o próximo toque não dobrar o que talvez tenha chegado ao servidor.
  }
}
