import {
  BRAZIL_UNITS,
  loadUnitLabel,
  pickFocusedGroup,
  prefillForNextSet,
  restoreSetDraft,
  type ExerciseGroup,
  type PrescribedSet,
  type SessionSet,
  type SetDraft,
  type UnitPrefs,
  type WorkoutSession,
} from '@fatia/api-client';
import { isExerciseComplete, loadValue, parseFirstRep, targetSetsOf } from './format';

/**
 * A notificação fixa do treino (#472, `docs/NOTIFICACAO_TREINO.md`): o que ela
 * mostra e o que cada botão faz. A ponta nativa (`modules/rest-countdown`) só
 * desenha, troca para o estado seguinte no fim do descanso e repassa o toque.
 * As decisões moram aqui, fora do componente, para caber no harness de Node:
 * com o app aberto, em segundo plano ou reaberto depois de encerrado, o toque
 * passa pela mesma regra.
 */

/** O passo do −/+ do descanso na notificação. */
export const REST_NUDGE_SECONDS = 15;

export type WorkoutActionId = 'rest-minus' | 'rest-plus' | 'rest-skip' | 'log-set';

/**
 * A oferta de "Registrar série": a série e os valores que a notificação
 * mostrava. Os valores viajam com o toque, e é isso que se grava, também no
 * toque guardado com o app encerrado (o cache, na volta, está vazio).
 */
export interface WorkoutActionToken {
  /** O toque só vale nesta sessão: a fila do app encerrado não vaza para a próxima. */
  sessionId: string;
  exerciseId: number;
  setNumber: number;
  /** A última série do exercício quando a oferta foi feita (`null`: nenhuma). */
  after: string | null;
  weightKg: number;
  reps: number;
}

/** Um estado da notificação: o de agora, ou o que entra quando o descanso acaba. */
export interface NotificationState {
  title: string;
  body: string;
  actions: { id: WorkoutActionId; label: string }[];
  token: WorkoutActionToken | null;
}

export interface WorkoutNotification extends NotificationState {
  /** Fim do descanso em ms; o cronômetro do sistema conta. `null`: sem descanso. */
  restDeadline: number | null;
  /**
   * O que aparece quando o descanso acaba. O nativo troca sozinho no prazo: em
   * segundo plano o `setInterval` do JS não roda, e quem esperasse por ele
   * ficaria no descanso, com o cronômetro negativo e sem o "Registrar".
   */
  next: NotificationState | null;
}

export interface PredictedSet {
  weightKg: number;
  reps: number;
}

/**
 * Os valores que "Registrar série" grava: os mesmos que a tela mostraria. Vale
 * o rascunho da série em andamento (o que a pessoa já digitou, #485); sem ele,
 * o palpite de `prefillForNextSet`; sem palpite, o padrão do campo (carga 0 e a
 * primeira rep da meta).
 */
export function predictedSet({
  group,
  draft,
  previousSessionSet,
  prescription,
}: {
  group: ExerciseGroup;
  draft?: SetDraft;
  previousSessionSet?: SessionSet | null;
  prescription?: PrescribedSet | null;
}): PredictedSet {
  const doneSets = group.sets.length;
  const saved = restoreSetDraft(draft, doneSets);
  if (saved) return { weightKg: saved.weightKg, reps: saved.reps };
  const prefill = prefillForNextSet({
    touched: false,
    sessionLastSet: group.sets[doneSets - 1],
    previousSessionSet,
    prescription,
  });
  return {
    weightKg: prefill.weightKg ?? 0,
    reps: prefill.reps ?? parseFirstRep(group.targetReps),
  };
}

/** O exercício da notificação: o aberto na tela, se ainda estiver por fazer, ou o próximo. */
export function currentGroup(
  groups: ExerciseGroup[],
  preferredId: number | null | undefined,
): ExerciseGroup | undefined {
  return pickFocusedGroup(groups, new Set(), preferredId);
}

function target(predicted: PredictedSet, units: UnitPrefs): string {
  if (predicted.weightKg <= 0) return `${predicted.reps} reps`;
  return `${predicted.reps} reps × ${loadValue(predicted.weightKg, units)} ${loadUnitLabel(units.loadUnit)}`;
}

/** A oferta da próxima série do exercício; `null` onde não há o que registrar. */
export function offerFor(
  sessionId: string,
  group: ExerciseGroup,
  predicted: PredictedSet,
): WorkoutActionToken | null {
  if (group.isCardio || isExerciseComplete(group)) return null;
  return {
    sessionId,
    exerciseId: group.exerciseId,
    setNumber: group.sets.length + 1,
    after: group.sets[group.sets.length - 1]?.id ?? null,
    weightKg: predicted.weightKg,
    reps: predicted.reps,
  };
}

/** O estado fora do descanso: a série com o "Registrar", cardio, ou tudo feito. */
function workingState(
  sessionId: string,
  group: ExerciseGroup | undefined,
  predicted: PredictedSet | null,
  units: UnitPrefs,
): NotificationState & { restBody: string } {
  if (!group) {
    return {
      title: 'Treino em andamento',
      body: 'Tudo feito. Finalize no app.',
      restBody: 'Descanso',
      actions: [],
      token: null,
    };
  }
  const title = group.isCardio
    ? group.exerciseName
    : `${group.exerciseName} · série ${group.sets.length + 1} de ${targetSetsOf(group)}`;
  const token = predicted ? offerFor(sessionId, group, predicted) : null;
  if (!predicted || !token) {
    return { title, body: 'Cardio', restBody: 'Descanso', actions: [], token: null };
  }
  const meta = target(predicted, units);
  const logLabel =
    predicted.weightKg > 0
      ? `Registrar ${predicted.reps} × ${loadValue(predicted.weightKg, units)} ${loadUnitLabel(units.loadUnit)}`
      : `Registrar ${predicted.reps} reps`;
  return {
    title,
    body: `Meta: ${meta}`,
    restBody: `Descanso · próxima: ${meta}`,
    actions: [{ id: 'log-set', label: logLabel }],
    token,
  };
}

/**
 * O conteúdo. O Android mostra no máximo três botões: descansando, os do
 * descanso; na série, o de registrar. Registrar no meio do descanso é "Pular"
 * e depois "Registrar". Descansando, leva também o estado de depois (`next`),
 * para o nativo trocar no prazo sem depender do JS.
 */
export function workoutNotification({
  sessionId,
  group,
  predicted,
  restDeadline,
  units = BRAZIL_UNITS,
  now = Date.now(),
}: {
  sessionId: string;
  group: ExerciseGroup | undefined;
  predicted: PredictedSet | null;
  restDeadline: number | null;
  units?: UnitPrefs;
  now?: number;
}): WorkoutNotification {
  const { restBody, ...working } = workingState(sessionId, group, predicted, units);
  // Prazo vencido é fim de descanso, mesmo que o tique do JS ainda não tenha
  // rodado (com o app em segundo plano ele não roda).
  if (restDeadline == null || restDeadline <= now) {
    return { ...working, restDeadline: null, next: null };
  }
  return {
    title: working.title,
    body: restBody,
    actions: [
      { id: 'rest-minus', label: `−${REST_NUDGE_SECONDS} s` },
      { id: 'rest-plus', label: `+${REST_NUDGE_SECONDS} s` },
      { id: 'rest-skip', label: 'Pular' },
    ],
    token: null,
    restDeadline,
    next: working,
  };
}

/**
 * O pacote para o nativo (`RestCountdown.update`): o token vai como texto, que
 * o Android devolve intacto no toque.
 */
export function nativePayload(n: WorkoutNotification): string {
  const state = (s: NotificationState) => ({
    title: s.title,
    body: s.body,
    actions: s.actions,
    token: s.token ? JSON.stringify(s.token) : '',
  });
  return JSON.stringify({
    ...state(n),
    restDeadline: n.restDeadline ?? 0,
    next: n.next ? state(n.next) : null,
  });
}

/**
 * A chave de idempotência da oferta. Leva a última série do exercício no
 * momento da oferta (`after`): dois toques na mesma oferta gravam uma série só
 * (a API deduplica por sessão e chave), e apagar uma série anterior gera outra
 * oferta, com outra chave — com a chave só por número de série, a oferta nova
 * repetiria a de uma série que ficou, e a API devolveria aquela sem gravar
 * nada. Cabe nos 64 caracteres do DTO (o id da série é um uuid).
 */
export function notificationSetClientKey(token: WorkoutActionToken): string {
  return `ntf:${token.exerciseId}:${token.setNumber}:${token.after ?? '0'}`;
}

export type WorkoutActionPlan =
  | { type: 'rest'; delta: number }
  | { type: 'skip-rest' }
  | {
      type: 'log';
      exerciseId: number;
      clientKey: string;
      weightKg: number;
      reps: number;
    }
  | { type: 'ignore' };

/**
 * O que fazer com o toque. "Registrar" só vale se a oferta ainda é a de agora:
 * a mesma sessão, a próxima série do exercício e a mesma última série. Série
 * registrada no app, exercício encerrado ou toque de outra sessão: o toque é
 * velho e não grava nada.
 */
export function resolveWorkoutAction(
  action: { id: string; token: WorkoutActionToken | null },
  groups: ExerciseGroup[],
  sessionId: string,
): WorkoutActionPlan {
  switch (action.id) {
    case 'rest-minus':
      return { type: 'rest', delta: -REST_NUDGE_SECONDS };
    case 'rest-plus':
      return { type: 'rest', delta: REST_NUDGE_SECONDS };
    case 'rest-skip':
      return { type: 'skip-rest' };
    case 'log-set': {
      const token = action.token;
      if (!token || token.sessionId !== sessionId) return { type: 'ignore' };
      const group = groups.find((g) => g.exerciseId === token.exerciseId);
      if (!group) return { type: 'ignore' };
      const current = offerFor(sessionId, group, token);
      if (
        !current ||
        current.setNumber !== token.setNumber ||
        current.after !== token.after ||
        token.reps <= 0
      ) {
        return { type: 'ignore' };
      }
      return {
        type: 'log',
        exerciseId: token.exerciseId,
        clientKey: notificationSetClientKey(token),
        weightKg: token.weightKg,
        reps: token.reps,
      };
    }
    default:
      return { type: 'ignore' };
  }
}

/**
 * A sessão depois do registro, com a série que o servidor devolveu. É dela que
 * sai a notificação seguinte: em segundo plano o cache não avisa ninguém (o
 * aviso do TanStack passa por `setTimeout`, parado com o app em segundo plano).
 */
export function sessionAfterLog(session: WorkoutSession, created: SessionSet): WorkoutSession {
  const sets = (session.sets ?? []).filter((s) => s.id !== created.id);
  return { ...session, sets: [...sets, created] };
}

/** O pacote que vem do nativo (`{ action, token, requestId? }`, com o token em JSON). */
export function parseWorkoutAction(
  raw: unknown,
): { id: string; token: WorkoutActionToken | null; requestId: string | null } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { action, token, requestId } = raw as {
    action?: unknown;
    token?: unknown;
    requestId?: unknown;
  };
  if (typeof action !== 'string') return null;
  return {
    id: action,
    token: parseToken(token),
    requestId: typeof requestId === 'string' && requestId !== '' ? requestId : null,
  };
}

function parseToken(raw: unknown): WorkoutActionToken | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const v = JSON.parse(raw) as Partial<WorkoutActionToken>;
    if (
      typeof v.sessionId === 'string' &&
      typeof v.exerciseId === 'number' &&
      typeof v.setNumber === 'number' &&
      (typeof v.after === 'string' || v.after === null) &&
      typeof v.weightKg === 'number' &&
      typeof v.reps === 'number'
    ) {
      return {
        sessionId: v.sessionId,
        exerciseId: v.exerciseId,
        setNumber: v.setNumber,
        after: v.after,
        weightKg: v.weightKg,
        reps: v.reps,
      };
    }
  } catch {
    // Pacote quebrado: o toque não grava nada.
  }
  return null;
}
