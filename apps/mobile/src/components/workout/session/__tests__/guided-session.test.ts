import { describe, expect, it } from 'vitest';
import type { ExerciseGroup, SessionSet } from '@fatia/api-client';
import {
  AUTO_ADVANCE_DEFAULT,
  copyLastSet,
  endExerciseLabel,
  guidedState,
  nextOpenIndex,
  parseAutoAdvance,
  serializeAutoAdvance,
  setChipLabel,
  loadStep,
  setHeadline,
  setProgress,
  STEPS,
  stepValue,
  isSessionDone,
} from '../guided-session';
import { isExerciseComplete } from '../format';

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

function group(id: number, done: number, target = 3, isCardio = false): ExerciseGroup {
  return {
    exerciseId: id,
    exerciseName: `Ex ${id}`,
    isCardio,
    targetSets: target,
    targetReps: '8–10',
    isPlanned: true,
    sets: Array.from({ length: done }, (_, i) => set({ id: `${id}-${i}`, exerciseId: id })),
  };
}

describe('passo do −/+ (prancha Al-T3)', () => {
  it('2,5 kg e 1 rep na força; 0,1 km e 1 min no cardio', () => {
    expect(STEPS).toEqual({ load: 2.5, reps: 1, distance: 0.1, minutes: 1 });
  });

  it('arredonda a décima e não deixa passar de zero', () => {
    expect(stepValue(52.5, STEPS.load)).toBe(55);
    expect(stepValue(1, -STEPS.load)).toBe(0);
    expect(stepValue(3.2, STEPS.distance)).toBe(3.3);
    expect(stepValue(0.1, -STEPS.distance)).toBe(0);
  });
});

describe('estado da sessão guiada', () => {
  it('descansando ganha de tudo; exercício completo vira escolha do próximo', () => {
    expect(guidedState({ resting: true, complete: false })).toBe('resting');
    expect(guidedState({ resting: true, complete: true })).toBe('resting');
    expect(guidedState({ resting: false, complete: true })).toBe('picking');
    expect(guidedState({ resting: false, complete: false })).toBe('working');
  });

  it('o próximo exercício aberto dá a volta na lista', () => {
    const groups = [group(1, 3), group(2, 0), group(3, 3), group(4, 1)];
    expect(nextOpenIndex(groups, 0)).toBe(1);
    expect(nextOpenIndex(groups, 1)).toBe(3);
    expect(nextOpenIndex(groups, 3)).toBe(1);
    expect(nextOpenIndex([group(1, 3), group(2, 3)], 0)).toBeNull();
  });
});

describe('exercício encerrado sem todas as séries (#473)', () => {
  const ended = (g: ExerciseGroup): ExerciseGroup => ({ ...g, ended: true });

  it('conta como completo, mesmo com séries faltando', () => {
    expect(isExerciseComplete(ended(group(1, 1)))).toBe(true);
    expect(isExerciseComplete(ended(group(1, 0)))).toBe(true);
  });

  it('o próximo aberto pula o encerrado', () => {
    const groups = [group(1, 1), ended(group(2, 0)), group(3, 0)];
    expect(nextOpenIndex(groups, 0)).toBe(2);
  });

  it('encerrar o último que faltava fecha a sessão', () => {
    expect(isSessionDone([group(1, 3), ended(group(2, 1))])).toBe(true);
    expect(isSessionDone([group(1, 3), group(2, 1)])).toBe(false);
  });
});

describe('textos da série', () => {
  it('só "Série N de M": a meta e a última vez não entram na linha (pedido do dono)', () => {
    // Quem chamava com a meta do plano e a última vez continua só com a contagem:
    // a meta está embaixo das reps, e a linha longa repetia o que já está na tela.
    const old = { targetReps: '8–10', lastTime: '52,5 kg × 9' } as object;
    expect(setHeadline({ done: 1, target: 4, ...old })).toBe('Série 2 de 4');
    // Completo não passa do total.
    expect(setHeadline({ done: 4, target: 4 })).toBe('Série 4 de 4');
  });

  it('chip da série: carga × reps e o emoji da sensação', () => {
    expect(setChipLabel(set({ weightKg: 52.5, reps: 9, rpe: 7 }), false)).toBe('52,5×9 🙂');
    expect(setChipLabel(set({ reps: 15 }), false)).toBe('15');
    expect(setChipLabel(set({ distanceMeters: 3200, durationSeconds: 1200 }), true)).toBe(
      '3,2km 20′',
    );
  });

  it('chip em libras: a carga na unidade da pessoa', () => {
    expect(setChipLabel(set({ weightKg: 100, reps: 5 }), false, 'LB')).toBe('220,5×5');
    expect(setChipLabel(set({ weightKg: 100, reps: 5 }), false, 'KG')).toBe('100×5');
  });

  it('o passo do −/+ da carga: 2,5 kg ou 5 lb, como no PWA', () => {
    expect(loadStep('KG')).toBe(2.5);
    expect(loadStep('LB')).toBe(5);
  });
});

describe('progresso da barra do treino em andamento', () => {
  it('séries feitas sobre a meta de séries planejadas', () => {
    expect(setProgress([group(1, 3, 4), group(2, 1, 4)])).toEqual({
      done: 4,
      target: 8,
      ratio: 0.5,
    });
    // Feito além da meta não estoura a linha.
    expect(setProgress([group(1, 5, 3)]).ratio).toBe(1);
    expect(setProgress([]).ratio).toBe(0);
  });

  it('#473: o encerrado sai da meta com as séries que ficaram de fora', () => {
    const ended = { ...group(1, 2, 4), ended: true };
    // Tudo feito, um deles encerrado: a linha enche.
    expect(setProgress([ended, group(2, 3, 3)])).toEqual({ done: 5, target: 5, ratio: 1 });
    // Pulado sem nenhuma série: não pesa na meta.
    expect(setProgress([{ ...group(1, 0, 4), ended: true }, group(2, 1, 2)]).ratio).toBe(0.5);
  });
});

describe('rótulo de encerrar o exercício (#473)', () => {
  it('sem série feita, ou no cardio, é pular', () => {
    expect(endExerciseLabel(group(1, 0, 4))).toBe('Pular exercício');
    expect(endExerciseLabel(group(1, 0, 1, true))).toBe('Pular exercício');
  });

  it('no plano, conta as séries que ficam de fora', () => {
    expect(endExerciseLabel(group(1, 3, 4))).toBe('Encerrar exercício (1 série fica de fora)');
    expect(endExerciseLabel(group(1, 1, 4))).toBe('Encerrar exercício (3 séries ficam de fora)');
  });

  it('fora do plano não há meta, então nenhuma série fica de fora', () => {
    const free: ExerciseGroup = { ...group(5, 3), targetSets: undefined, isPlanned: false };
    expect(endExerciseLabel(free)).toBe('Encerrar exercício');
  });
});

describe('+ Série no Treino atual', () => {
  it('copia os valores da última série com uma chave nova', () => {
    const body = copyLastSet(
      group(7, 0).exerciseId,
      set({ weightKg: 40, reps: 10, rpe: 8, distanceMeters: null }),
      'k1',
    );
    expect(body).toEqual({ exerciseId: 7, weightKg: 40, reps: 10, rpe: 8, clientKey: 'k1' });
  });

  it('sem série para copiar não grava nada: uma série vazia contaria no progresso', () => {
    expect(copyLastSet(7, undefined, 'k1')).toBeNull();
  });
});

describe('preferência de passar sozinho', () => {
  it('ligada por padrão, e só "0" desliga', () => {
    expect(AUTO_ADVANCE_DEFAULT).toBe(true);
    expect(parseAutoAdvance(null)).toBe(true);
    expect(parseAutoAdvance('0')).toBe(false);
    expect(parseAutoAdvance('1')).toBe(true);
    expect(serializeAutoAdvance(false)).toBe('0');
  });
});

describe('tudo feito: o resumo do treino no lugar do aviso vazio', () => {
  it('todos os exercícios completos', () => {
    expect(isSessionDone([group(1, 3), group(2, 3), group(3, 1, 3, true)])).toBe(true);
  });

  it('falta série em algum, ou a lista está vazia: ainda não', () => {
    expect(isSessionDone([group(1, 3), group(2, 2)])).toBe(false);
    expect(isSessionDone([group(1, 3), group(2, 0, 3, true)])).toBe(false);
    expect(isSessionDone([])).toBe(false);
  });
});
