import { describe, expect, it } from 'vitest';
import type { ExerciseGroup, SessionSet } from '@fatia/api-client';
import {
  AUTO_ADVANCE_DEFAULT,
  copyLastSet,
  guidedState,
  nextOpenIndex,
  parseAutoAdvance,
  serializeAutoAdvance,
  setChipLabel,
  setHeadline,
  setProgress,
  STEPS,
  stepValue,
} from '../guided-session';

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

describe('textos da série', () => {
  it('"Série 2 de 4 · meta 8–10 · última vez 52,5 kg × 9"', () => {
    expect(setHeadline({ done: 1, target: 4, targetReps: '8–10', lastTime: '52,5 kg × 9' })).toBe(
      'Série 2 de 4 · meta 8–10 · última vez 52,5 kg × 9',
    );
    // Sem meta nem histórico, só a contagem; completo não passa do total.
    expect(setHeadline({ done: 4, target: 4 })).toBe('Série 4 de 4');
  });

  it('chip da série: carga × reps e o emoji da sensação', () => {
    expect(setChipLabel(set({ weightKg: 52.5, reps: 9, rpe: 7 }), false)).toBe('52,5×9 🙂');
    expect(setChipLabel(set({ reps: 15 }), false)).toBe('15');
    expect(setChipLabel(set({ distanceMeters: 3200, durationSeconds: 1200 }), true)).toBe(
      '3,2km 20′',
    );
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
