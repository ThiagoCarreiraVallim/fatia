import { describe, expect, it } from 'vitest';
import type { ExerciseGroup, PrescribedSet, SessionSet, SetDraft } from '@fatia/api-client';
import {
  currentGroup,
  notificationSetClientKey,
  parseWorkoutAction,
  predictedSet,
  resolveWorkoutAction,
  workoutNotification,
} from '../workout-notification';

/**
 * A notificação fixa do treino (#472): o que ela mostra e o que cada botão faz.
 * A ponta nativa (`modules/rest-countdown`) só desenha e repassa o toque; as
 * decisões moram aqui, onde o harness de Node alcança.
 */
function set(over: Partial<SessionSet> = {}): SessionSet {
  return {
    id: 'x',
    sessionId: 's',
    exerciseId: 1,
    setNumber: 1,
    weightKg: null,
    reps: null,
    rpe: null,
    durationSeconds: null,
    distanceMeters: null,
    avgHeartRate: null,
    kcalBurned: null,
    notes: null,
    exercise: {} as SessionSet['exercise'],
    ...over,
  };
}

function group(
  id: number,
  sets: SessionSet[] = [],
  over: Partial<ExerciseGroup> = {},
): ExerciseGroup {
  return {
    exerciseId: id,
    exerciseName: `Remada ${id}`,
    isCardio: false,
    targetSets: 4,
    targetReps: '8-10',
    isPlanned: true,
    sets,
    ...over,
  };
}

const prescription: PrescribedSet = {
  status: 'ok',
  weightKg: 65,
  reps: 8,
  restSeconds: 90,
  basis: 'rpe',
  action: 'increase_load',
  capped: false,
};

describe('predictedSet — a mesma previsão da tela', () => {
  it('o rascunho da série em andamento vale primeiro (o que a pessoa já digitou)', () => {
    const draft: SetDraft = {
      doneSets: 1,
      weightKg: 70,
      reps: 9,
      feeling: null,
      touched: true,
      prefill: { weightKg: 60, reps: 10 },
    };
    const g = group(1, [set({ weightKg: 60, reps: 10 })]);
    expect(predictedSet({ group: g, draft, prescription })).toEqual({ weightKg: 70, reps: 9 });
  });

  it('rascunho de outra série não vale', () => {
    const draft: SetDraft = {
      doneSets: 0,
      weightKg: 70,
      reps: 9,
      feeling: null,
      touched: true,
      prefill: { weightKg: null, reps: null },
    };
    const g = group(1, [set({ weightKg: 60, reps: 10 })]);
    expect(predictedSet({ group: g, draft })).toEqual({ weightKg: 60, reps: 10 });
  });

  it('sem rascunho, a série da sessão, depois a prescrição', () => {
    expect(
      predictedSet({ group: group(1, [set({ weightKg: 60, reps: 10 })]), prescription }),
    ).toEqual({ weightKg: 60, reps: 10 });
    expect(predictedSet({ group: group(1), prescription })).toEqual({ weightKg: 65, reps: 8 });
  });

  it('sem nada, carga 0 e a primeira rep da meta, como o campo da tela', () => {
    expect(predictedSet({ group: group(1) })).toEqual({ weightKg: 0, reps: 8 });
  });
});

describe('currentGroup — o exercício da notificação', () => {
  it('o que a tela tem aberto, se ainda estiver por fazer', () => {
    const groups = [group(1), group(2)];
    expect(currentGroup(groups, 2)?.exerciseId).toBe(2);
  });

  it('o aberto da tela já acabou: o primeiro por fazer', () => {
    const done = group(1, [set(), set(), set(), set()]);
    expect(currentGroup([done, group(2)], 1)?.exerciseId).toBe(2);
  });

  it('pula o encerrado (#473)', () => {
    expect(currentGroup([group(1, [], { ended: true }), group(2)], null)?.exerciseId).toBe(2);
  });
});

describe('workoutNotification — o que aparece', () => {
  it('na série: exercício, série, meta e o botão de registrar com os valores', () => {
    const n = workoutNotification({
      group: group(7, [set()]),
      predicted: { weightKg: 62.5, reps: 10 },
      restDeadline: null,
    });
    expect(n.title).toBe('Remada 7 · série 2 de 4');
    expect(n.body).toBe('Meta: 10 reps × 62,5 kg');
    expect(n.actions).toEqual([{ id: 'log-set', label: 'Registrar 10 × 62,5 kg' }]);
    expect(n.token).toEqual({ exerciseId: 7, setNumber: 2 });
    expect(n.restDeadline).toBeNull();
  });

  it('descansando: o cronômetro e os botões do descanso (o Android mostra só 3)', () => {
    const n = workoutNotification({
      group: group(7, [set()]),
      predicted: { weightKg: 62.5, reps: 10 },
      restDeadline: 123_000,
    });
    expect(n.restDeadline).toBe(123_000);
    expect(n.body).toBe('Descanso · próxima: 10 reps × 62,5 kg');
    expect(n.actions.map((a) => a.id)).toEqual(['rest-minus', 'rest-plus', 'rest-skip']);
  });

  it('sem carga, só as reps', () => {
    const n = workoutNotification({
      group: group(7),
      predicted: { weightKg: 0, reps: 12 },
      restDeadline: null,
    });
    expect(n.body).toBe('Meta: 12 reps');
    expect(n.actions[0]?.label).toBe('Registrar 12 reps');
  });

  it('em libras, a carga na unidade da pessoa', () => {
    const n = workoutNotification({
      group: group(7),
      predicted: { weightKg: 45.359237, reps: 10 },
      restDeadline: null,
      units: { loadUnit: 'LB', distanceUnit: 'KM' },
    });
    expect(n.body).toBe('Meta: 10 reps × 100 lb');
  });

  it('cardio não tem previsão para registrar', () => {
    const n = workoutNotification({
      group: group(7, [], { isCardio: true }),
      predicted: { weightKg: 0, reps: 0 },
      restDeadline: null,
    });
    expect(n.actions).toEqual([]);
    expect(n.token).toBeNull();
  });

  it('tudo feito: só o descanso, se houver', () => {
    const n = workoutNotification({ group: undefined, predicted: null, restDeadline: null });
    expect(n.title).toBe('Treino em andamento');
    expect(n.actions).toEqual([]);
  });
});

describe('resolveWorkoutAction — o toque, com o app aberto ou não', () => {
  const groups = [group(7, [set()])];

  it('descanso: ±15 s e pular', () => {
    expect(resolveWorkoutAction({ id: 'rest-minus', token: null }, groups)).toEqual({
      type: 'rest',
      delta: -15,
    });
    expect(resolveWorkoutAction({ id: 'rest-plus', token: null }, groups)).toEqual({
      type: 'rest',
      delta: 15,
    });
    expect(resolveWorkoutAction({ id: 'rest-skip', token: null }, groups)).toEqual({
      type: 'skip-rest',
    });
  });

  it('registrar: a série que a notificação mostrava, com chave fixa', () => {
    expect(
      resolveWorkoutAction({ id: 'log-set', token: { exerciseId: 7, setNumber: 2 } }, groups),
    ).toEqual({ type: 'log', exerciseId: 7, clientKey: 'ntf:7:2' });
  });

  it('a série já entrou (no app ou num toque anterior): ignora', () => {
    const after = [group(7, [set(), set()])];
    expect(
      resolveWorkoutAction({ id: 'log-set', token: { exerciseId: 7, setNumber: 2 } }, after),
    ).toEqual({ type: 'ignore' });
  });

  it('exercício encerrado, completo ou fora do treino: ignora', () => {
    const token = { exerciseId: 7, setNumber: 2 };
    expect(
      resolveWorkoutAction({ id: 'log-set', token }, [group(7, [set()], { ended: true })]),
    ).toEqual({ type: 'ignore' });
    expect(resolveWorkoutAction({ id: 'log-set', token }, [group(8)])).toEqual({ type: 'ignore' });
  });

  it('ação desconhecida: ignora', () => {
    expect(resolveWorkoutAction({ id: 'outra', token: null }, groups)).toEqual({ type: 'ignore' });
  });
});

describe('a chave e o pacote do toque', () => {
  it('a chave cabe no limite da API (64) e é a mesma para a mesma série', () => {
    const key = notificationSetClientKey({ exerciseId: 123456, setNumber: 12 });
    expect(key).toBe('ntf:123456:12');
    expect(key.length).toBeLessThanOrEqual(64);
  });

  it('lê o que vem do nativo e descarta lixo', () => {
    expect(
      parseWorkoutAction({ action: 'log-set', token: '{"exerciseId":7,"setNumber":2}' }),
    ).toEqual({ id: 'log-set', token: { exerciseId: 7, setNumber: 2 } });
    expect(parseWorkoutAction({ action: 'rest-plus', token: '' })).toEqual({
      id: 'rest-plus',
      token: null,
    });
    expect(parseWorkoutAction({ action: 'log-set', token: '{quebrado' })).toEqual({
      id: 'log-set',
      token: null,
    });
    expect(parseWorkoutAction(null)).toBeNull();
    expect(parseWorkoutAction({ token: 'x' })).toBeNull();
  });
});
