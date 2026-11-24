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
} from '@fatia/api-client';
import { isExerciseComplete, loadValue, parseFirstRep, targetSetsOf } from './format';

/**
 * A notificação fixa do treino (#472, `docs/NOTIFICACAO_TREINO.md`): o que ela
 * mostra e o que cada botão faz. A ponta nativa (`modules/rest-countdown`) só
 * desenha e repassa o toque. As decisões moram aqui, fora do componente, para
 * caber no harness de Node: com o app aberto, em segundo plano ou reaberto
 * depois de encerrado, o toque passa pela mesma regra.
 */

/** O passo do −/+ do descanso na notificação. */
export const REST_NUDGE_SECONDS = 15;

export type WorkoutActionId = 'rest-minus' | 'rest-plus' | 'rest-skip' | 'log-set';

/** A série que a notificação mostrava quando o botão foi tocado. */
export interface WorkoutActionToken {
  exerciseId: number;
  setNumber: number;
}

export interface WorkoutNotification {
  title: string;
  body: string;
  /** Fim do descanso em ms; o cronômetro do sistema conta. `null`: sem descanso. */
  restDeadline: number | null;
  actions: { id: WorkoutActionId; label: string }[];
  token: WorkoutActionToken | null;
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

/**
 * O conteúdo. O Android mostra no máximo três botões: descansando, os do
 * descanso; na série, o de registrar. Registrar no meio do descanso é "Pular"
 * e depois "Registrar".
 */
export function workoutNotification({
  group,
  predicted,
  restDeadline,
  units = BRAZIL_UNITS,
}: {
  group: ExerciseGroup | undefined;
  predicted: PredictedSet | null;
  restDeadline: number | null;
  units?: UnitPrefs;
}): WorkoutNotification {
  const restActions: WorkoutNotification['actions'] = [
    { id: 'rest-minus', label: `−${REST_NUDGE_SECONDS} s` },
    { id: 'rest-plus', label: `+${REST_NUDGE_SECONDS} s` },
    { id: 'rest-skip', label: 'Pular' },
  ];
  const resting = restDeadline != null;

  if (!group) {
    return {
      title: 'Treino em andamento',
      body: resting ? 'Descanso' : 'Tudo feito. Finalize no app.',
      restDeadline,
      actions: resting ? restActions : [],
      token: null,
    };
  }

  const setNumber = group.sets.length + 1;
  const title = group.isCardio
    ? group.exerciseName
    : `${group.exerciseName} · série ${setNumber} de ${targetSetsOf(group)}`;

  if (group.isCardio || !predicted) {
    return {
      title,
      body: resting ? 'Descanso' : 'Cardio',
      restDeadline,
      actions: resting ? restActions : [],
      token: null,
    };
  }

  const meta = target(predicted, units);
  if (resting) {
    return {
      title,
      body: `Descanso · próxima: ${meta}`,
      restDeadline,
      actions: restActions,
      token: null,
    };
  }
  const logLabel =
    predicted.weightKg > 0
      ? `Registrar ${predicted.reps} × ${loadValue(predicted.weightKg, units)} ${loadUnitLabel(units.loadUnit)}`
      : `Registrar ${predicted.reps} reps`;
  return {
    title,
    body: `Meta: ${meta}`,
    restDeadline: null,
    actions: [{ id: 'log-set', label: logLabel }],
    token: { exerciseId: group.exerciseId, setNumber },
  };
}

/**
 * Chave fixa por exercício e série: dois toques (ou o toque guardado com o app
 * encerrado e aplicado depois) gravam uma série só — a API deduplica por sessão
 * e chave. Cabe nos 64 caracteres do DTO.
 */
export function notificationSetClientKey(token: WorkoutActionToken): string {
  return `ntf:${token.exerciseId}:${token.setNumber}`;
}

export type WorkoutActionPlan =
  | { type: 'rest'; delta: number }
  | { type: 'skip-rest' }
  | { type: 'log'; exerciseId: number; clientKey: string }
  | { type: 'ignore' };

/**
 * O que fazer com o toque. "Registrar" só vale se a série que a notificação
 * mostrava ainda é a próxima: registrada no app, ou o exercício encerrado, o
 * toque é velho e não grava nada.
 */
export function resolveWorkoutAction(
  action: { id: string; token: WorkoutActionToken | null },
  groups: ExerciseGroup[],
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
      if (!token) return { type: 'ignore' };
      const group = groups.find((g) => g.exerciseId === token.exerciseId);
      if (!group || group.isCardio || isExerciseComplete(group)) return { type: 'ignore' };
      if (group.sets.length + 1 !== token.setNumber) return { type: 'ignore' };
      return {
        type: 'log',
        exerciseId: token.exerciseId,
        clientKey: notificationSetClientKey(token),
      };
    }
    default:
      return { type: 'ignore' };
  }
}

/** O pacote que vem do nativo (`{ action, token }`, com o token em JSON). */
export function parseWorkoutAction(
  raw: unknown,
): { id: string; token: WorkoutActionToken | null } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { action, token } = raw as { action?: unknown; token?: unknown };
  if (typeof action !== 'string') return null;
  return { id: action, token: parseToken(token) };
}

function parseToken(raw: unknown): WorkoutActionToken | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const value = JSON.parse(raw) as Partial<WorkoutActionToken>;
    if (typeof value.exerciseId === 'number' && typeof value.setNumber === 'number') {
      return { exerciseId: value.exerciseId, setNumber: value.setNumber };
    }
  } catch {
    // Pacote quebrado: o toque não grava nada.
  }
  return null;
}
