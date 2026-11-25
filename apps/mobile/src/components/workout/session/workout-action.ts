import type { QueryClient } from '@tanstack/react-query';
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
  type UnitPrefs,
  type WorkoutSession,
} from '@fatia/api-client';
import type { RestTimer } from './use-rest-timer';
import { currentExerciseKey } from './use-pending-exercises';
import {
  currentGroup,
  offerFor,
  predictedSet,
  resolveWorkoutAction,
  sessionAfterLog,
  workoutNotification,
  type PredictedSet,
  type WorkoutActionToken,
  type WorkoutNotification,
} from './workout-notification';

/**
 * O toque num botão da notificação do treino (#472), com o app aberto, em
 * segundo plano ou guardado com o app encerrado. Fora do componente para caber
 * no harness de Node, e sem depender de nada que só ande com o app na frente:
 * em segundo plano no Android os timers do JS param, e com eles o aviso do
 * TanStack aos observers (`setTimeout(0)`). Por isso o "Registrar" calcula a
 * notificação seguinte a partir da resposta do servidor e a reposta na hora.
 */

/** A ponta nativa: `null` onde o módulo não existe (iOS, Expo Go). */
export interface WorkoutNotifier {
  post(notification: WorkoutNotification): void;
  hide(): void;
}

type Api = Pick<typeof workoutApi, 'getSession' | 'logSet' | 'getLastSet' | 'getPrescription'>;

export interface WorkoutActionContext {
  qc: QueryClient;
  session: Pick<WorkoutSession, 'id' | 'startedAt'>;
  rest: Pick<RestTimer, 'deadline' | 'total' | 'start' | 'addTime' | 'stop'>;
  notifier: WorkoutNotifier | null;
  units: UnitPrefs;
  /** Segura o segundo toque enquanto o primeiro está em voo. */
  inFlight: Set<string>;
  api?: Api;
  now?: () => number;
}

export const sessionKey = (sessionId: string) => ['workout', 'session', sessionId] as const;
export const activeSessionKey = ['workout', 'active'] as const;
export const lastSetKey = (exerciseId: number, startedAt: string) =>
  ['workout', 'last-set', exerciseId, startedAt] as const;
export const prescriptionKey = (exerciseId: number, targetReps: string | undefined) =>
  ['workout', 'prescription', exerciseId, targetReps] as const;

export function sessionGroups(
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

/**
 * A previsão de um exercício com os dados esperados de verdade (as mesmas
 * chaves do card da série): o cache, se já tiver, senão o servidor.
 */
async function predictFromServer(
  ctx: WorkoutActionContext,
  api: Api,
  group: ExerciseGroup,
): Promise<{ predicted: PredictedSet | null; restSeconds: number | undefined }> {
  if (group.isCardio) return { predicted: null, restSeconds: undefined };
  const { qc, session } = ctx;
  const [previous, prescription] = await Promise.all([
    qc
      .fetchQuery({
        queryKey: lastSetKey(group.exerciseId, session.startedAt),
        queryFn: () => api.getLastSet(group.exerciseId, session.startedAt),
        staleTime: 60_000,
      })
      .catch(() => null),
    qc
      .fetchQuery({
        queryKey: prescriptionKey(group.exerciseId, group.targetReps),
        queryFn: () => api.getPrescription(group.exerciseId, group.targetReps),
        staleTime: 60_000,
      })
      .catch(() => undefined),
  ]);
  const p: LoadPrescription | undefined = prescription;
  const ok = p?.status === 'ok' ? p : null;
  return {
    predicted: predictedSet({
      group,
      draft: qc.getQueryData<SetDraft>(setDraftKey(session.id, group.exerciseId)),
      previousSessionSet: (previous as SessionSet | null) ?? null,
      prescription: ok,
    }),
    restSeconds: ok?.restSeconds,
  };
}

export async function applyWorkoutAction(
  ctx: WorkoutActionContext,
  action: { id: string; token: WorkoutActionToken | null },
  /** Toque sem oferta marcada (iOS): registra a próxima série deste exercício. */
  nextOf: number | null = null,
): Promise<void> {
  const api = ctx.api ?? workoutApi;
  const now = ctx.now ?? Date.now;
  const { qc, session, rest } = ctx;

  const quick = resolveWorkoutAction(action, [], session.id);
  if (quick.type === 'rest') {
    const t = now();
    // O `deadline` pode estar vencido sem o tique do JS ter rodado (segundo
    // plano). Descanso acabado: o "+15 s" (o do aviso do fim, no iOS) começa
    // um de 15 s; o "−15 s" não tem o que encurtar.
    if (rest.deadline == null || rest.deadline <= t) {
      if (quick.delta > 0) rest.start(quick.delta);
      else rest.stop();
    } else if (rest.deadline + quick.delta * 1000 <= t) {
      // A mesma regra do nativo (`WorkoutNotifications.nudgeRest`).
      rest.stop();
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
      queryKey: sessionKey(session.id),
      queryFn: () => api.getSession(session.id),
      staleTime: 0,
    });
    // Finalizada em outro lugar (web, IA): nada a registrar, e a notificação sai.
    if (fresh.completedAt) {
      ctx.notifier?.hide();
      qc.setQueryData(activeSessionKey, null);
      return;
    }
    const groups = sessionGroups(
      fresh,
      qc.getQueryData<PendingExercise[]>(pendingExercisesKey(session.id)),
      qc.getQueryData<number[]>(endedExercisesKey(session.id)),
    );

    let token = action.token;
    if (!token && nextOf != null) {
      const group = groups.find((g) => g.exerciseId === nextOf);
      const { predicted } = group ? await predictFromServer(ctx, api, group) : { predicted: null };
      token = group && predicted ? offerFor(session.id, group, predicted) : null;
    }
    const plan = resolveWorkoutAction({ id: action.id, token }, groups, session.id);
    if (plan.type !== 'log' || ctx.inFlight.has(plan.clientKey)) return;

    ctx.inFlight.add(plan.clientKey);
    try {
      const created = await api.logSet(session.id, {
        exerciseId: plan.exerciseId,
        weightKg: plan.weightKg,
        reps: plan.reps,
        clientKey: plan.clientKey,
      });

      // O cache recebe a sessão nova já (quem renderizar lê dela), sem esperar
      // o refetch nem o aviso aos observers.
      const updated = sessionAfterLog(fresh, created);
      qc.setQueryData(sessionKey(session.id), updated);
      qc.setQueryData<WorkoutSession | null>(activeSessionKey, (old) =>
        old && old.id === session.id ? { ...old, sets: updated.sets } : old,
      );

      // Como na tela: registrada a série, começa o descanso (o prescrito, se houver).
      const logged = groups.find((g) => g.exerciseId === plan.exerciseId);
      const loggedRest = logged
        ? (await predictFromServer(ctx, api, logged)).restSeconds
        : undefined;
      const seconds = Math.max(5, Math.round(loggedRest ?? rest.total));

      const groupsAfter = sessionGroups(
        updated,
        qc.getQueryData<PendingExercise[]>(pendingExercisesKey(session.id)),
        qc.getQueryData<number[]>(endedExercisesKey(session.id)),
      );
      const next = currentGroup(
        groupsAfter,
        qc.getQueryData<number | null>(currentExerciseKey(session.id)) ?? plan.exerciseId,
      );
      const { predicted } = next ? await predictFromServer(ctx, api, next) : { predicted: null };
      ctx.notifier?.post(
        workoutNotification({
          sessionId: session.id,
          group: next,
          predicted,
          restDeadline: now() + seconds * 1000,
          units: ctx.units,
          now: now(),
        }),
      );
      rest.start(seconds);

      void qc.invalidateQueries({ queryKey: activeSessionKey });
      void qc.invalidateQueries({ queryKey: sessionKey(session.id) });
    } finally {
      ctx.inFlight.delete(plan.clientKey);
    }
  } catch {
    // Sem rede: a notificação continua oferecendo a mesma série, e a chave fixa
    // da oferta faz o próximo toque não dobrar o que talvez tenha chegado.
  }
}
