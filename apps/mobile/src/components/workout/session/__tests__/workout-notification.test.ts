import { describe, expect, it } from 'vitest';
import type { ExerciseGroup, PrescribedSet, SessionSet, SetDraft } from '@fatia/api-client';
import {
  currentGroup,
  nativePayload,
  notificationSetClientKey,
  parseWorkoutAction,
  predictedSet,
  resolveWorkoutAction,
  sessionAfterLog,
  workoutNotification,
  type WorkoutActionToken,
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

const NOW = 1_800_000_000_000;

function offer(over: Partial<WorkoutActionToken> = {}): WorkoutActionToken {
  return {
    sessionId: 'S',
    exerciseId: 7,
    setNumber: 2,
    after: 'x',
    weightKg: 62.5,
    reps: 10,
    ...over,
  };
}

describe('workoutNotification — o que aparece', () => {
  it('na série: exercício, série, meta e o botão de registrar com a oferta', () => {
    const n = workoutNotification({
      sessionId: 'S',
      group: group(7, [set()]),
      predicted: { weightKg: 62.5, reps: 10 },
      restDeadline: null,
      now: NOW,
    });
    expect(n.title).toBe('Remada 7 · série 2 de 4');
    expect(n.body).toBe('Meta: 10 reps × 62,5 kg');
    expect(n.actions).toEqual([{ id: 'log-set', label: 'Registrar 10 × 62,5 kg' }]);
    expect(n.token).toEqual(offer());
    expect(n.restDeadline).toBeNull();
    expect(n.next).toBeNull();
  });

  it('descansando: o cronômetro, os botões do descanso e o estado de depois para o nativo trocar no prazo', () => {
    const n = workoutNotification({
      sessionId: 'S',
      group: group(7, [set()]),
      predicted: { weightKg: 62.5, reps: 10 },
      restDeadline: NOW + 60_000,
      now: NOW,
    });
    expect(n.restDeadline).toBe(NOW + 60_000);
    expect(n.body).toBe('Descanso · próxima: 10 reps × 62,5 kg');
    expect(n.actions.map((a) => a.id)).toEqual(['rest-minus', 'rest-plus', 'rest-skip']);
    expect(n.token).toBeNull();
    // Com o app em segundo plano o tique do JS não roda: o "Registrar" já vai junto.
    expect(n.next?.actions).toEqual([{ id: 'log-set', label: 'Registrar 10 × 62,5 kg' }]);
    expect(n.next?.token).toEqual(offer());
  });

  it('prazo vencido (o tique do JS não rodou): já é o estado de registrar', () => {
    const n = workoutNotification({
      sessionId: 'S',
      group: group(7, [set()]),
      predicted: { weightKg: 62.5, reps: 10 },
      restDeadline: NOW - 30_000,
      now: NOW,
    });
    expect(n.restDeadline).toBeNull();
    expect(n.actions.map((a) => a.id)).toEqual(['log-set']);
  });

  it('sem carga, só as reps', () => {
    const n = workoutNotification({
      sessionId: 'S',
      group: group(7),
      predicted: { weightKg: 0, reps: 12 },
      restDeadline: null,
    });
    expect(n.body).toBe('Meta: 12 reps');
    expect(n.actions[0]?.label).toBe('Registrar 12 reps');
  });

  it('em libras, a carga na unidade da pessoa', () => {
    const n = workoutNotification({
      sessionId: 'S',
      group: group(7),
      predicted: { weightKg: 45.359237, reps: 10 },
      restDeadline: null,
      units: { loadUnit: 'LB', distanceUnit: 'KM' },
    });
    expect(n.body).toBe('Meta: 10 reps × 100 lb');
  });

  it('cardio não tem previsão para registrar', () => {
    const n = workoutNotification({
      sessionId: 'S',
      group: group(7, [], { isCardio: true }),
      predicted: { weightKg: 0, reps: 0 },
      restDeadline: null,
    });
    expect(n.actions).toEqual([]);
    expect(n.token).toBeNull();
  });

  it('tudo feito: só o descanso, se houver', () => {
    const n = workoutNotification({
      sessionId: 'S',
      group: undefined,
      predicted: null,
      restDeadline: null,
    });
    expect(n.title).toBe('Treino em andamento');
    expect(n.actions).toEqual([]);
  });

  it('o pacote do nativo leva o token como texto, também no estado de depois', () => {
    const n = workoutNotification({
      sessionId: 'S',
      group: group(7, [set()]),
      predicted: { weightKg: 62.5, reps: 10 },
      restDeadline: NOW + 60_000,
      now: NOW,
    });
    const payload = JSON.parse(nativePayload(n)) as {
      restDeadline: number;
      token: string;
      next: { token: string };
    };
    expect(payload.restDeadline).toBe(NOW + 60_000);
    expect(payload.token).toBe('');
    expect(JSON.parse(payload.next.token)).toEqual(offer());
  });
});

describe('resolveWorkoutAction — o toque, com o app aberto ou não', () => {
  const groups = [group(7, [set()])];

  it('descanso: ±15 s e pular', () => {
    expect(resolveWorkoutAction({ id: 'rest-minus', token: null }, groups, 'S')).toEqual({
      type: 'rest',
      delta: -15,
    });
    expect(resolveWorkoutAction({ id: 'rest-plus', token: null }, groups, 'S')).toEqual({
      type: 'rest',
      delta: 15,
    });
    expect(resolveWorkoutAction({ id: 'rest-skip', token: null }, groups, 'S')).toEqual({
      type: 'skip-rest',
    });
  });

  it('registrar: a oferta da notificação, com os valores dela e a chave da oferta', () => {
    expect(resolveWorkoutAction({ id: 'log-set', token: offer() }, groups, 'S')).toEqual({
      type: 'log',
      exerciseId: 7,
      clientKey: 'ntf:7:2:x',
      weightKg: 62.5,
      reps: 10,
    });
  });

  it('a série já entrou (no app ou num toque anterior): ignora', () => {
    const after = [group(7, [set(), set({ id: 'y' })])];
    expect(resolveWorkoutAction({ id: 'log-set', token: offer() }, after, 'S')).toEqual({
      type: 'ignore',
    });
  });

  it('toque de outra sessão: ignora', () => {
    expect(resolveWorkoutAction({ id: 'log-set', token: offer() }, groups, 'OUTRA')).toEqual({
      type: 'ignore',
    });
  });

  it('a série anterior mudou (apagada e refeita): a oferta é velha', () => {
    const redone = [group(7, [set({ id: 'z' })])];
    expect(resolveWorkoutAction({ id: 'log-set', token: offer() }, redone, 'S')).toEqual({
      type: 'ignore',
    });
  });

  it('exercício encerrado, completo ou fora do treino: ignora', () => {
    expect(
      resolveWorkoutAction(
        { id: 'log-set', token: offer() },
        [group(7, [set()], { ended: true })],
        'S',
      ),
    ).toEqual({ type: 'ignore' });
    expect(resolveWorkoutAction({ id: 'log-set', token: offer() }, [group(8)], 'S')).toEqual({
      type: 'ignore',
    });
  });

  it('ação desconhecida: ignora', () => {
    expect(resolveWorkoutAction({ id: 'outra', token: null }, groups, 'S')).toEqual({
      type: 'ignore',
    });
  });
});

describe('a chave da oferta', () => {
  it('cabe no limite da API (64) com o uuid da série', () => {
    const key = notificationSetClientKey(
      offer({ exerciseId: 123456, setNumber: 12, after: '8c4f7e0a-1b2c-4d3e-9f80-0123456789ab' }),
    );
    expect(key.length).toBeLessThanOrEqual(64);
  });

  it('apagar uma série anterior gera outra oferta, com chave que não colide com a série que ficou', () => {
    // Série 1 (app) e série 2 (notificação); apagada a 1, sobra só a 2. A
    // notificação oferece a "série 2" de novo, e a chave não pode ser a da que
    // ficou — a API devolveria aquela e nada seria gravado.
    const first = group(7, [set({ id: 'set-1' })]);
    const keyOfSet2 = notificationSetClientKey(offer({ after: 'set-1' }));
    const remaining = group(7, [set({ id: 'set-2', setNumber: 2 })]);
    const n = workoutNotification({
      sessionId: 'S',
      group: remaining,
      predicted: { weightKg: 60, reps: 10 },
      restDeadline: null,
    });
    expect(first.sets).toHaveLength(1);
    expect(n.token && notificationSetClientKey(n.token)).not.toBe(keyOfSet2);
  });
});

describe('o pacote do toque e a sessão depois do registro', () => {
  it('lê o que vem do nativo e descarta lixo', () => {
    expect(
      parseWorkoutAction({ action: 'log-set', token: JSON.stringify(offer()), requestId: '3' }),
    ).toEqual({ id: 'log-set', token: offer(), requestId: '3' });
    expect(parseWorkoutAction({ action: 'rest-plus', token: '' })).toEqual({
      id: 'rest-plus',
      token: null,
      requestId: null,
    });
    // Token do formato antigo (sem sessão nem valores) não grava.
    expect(
      parseWorkoutAction({ action: 'log-set', token: '{"exerciseId":7,"setNumber":2}' })?.token,
    ).toBeNull();
    expect(parseWorkoutAction({ action: 'log-set', token: '{quebrado' })?.token).toBeNull();
    expect(parseWorkoutAction(null)).toBeNull();
    expect(parseWorkoutAction({ token: 'x' })).toBeNull();
  });

  it('sessionAfterLog acrescenta a série devolvida, sem dobrar a que já estava', () => {
    const s = { id: 'S', sets: [set({ id: 'a' })] } as unknown as Parameters<
      typeof sessionAfterLog
    >[0];
    expect(sessionAfterLog(s, set({ id: 'b' })).sets?.map((x) => x.id)).toEqual(['a', 'b']);
    expect(sessionAfterLog(s, set({ id: 'a' })).sets?.map((x) => x.id)).toEqual(['a']);
  });
});
