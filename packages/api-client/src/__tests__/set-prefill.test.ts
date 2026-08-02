import { describe, expect, it } from 'vitest';
import { prefillForNextSet } from '../workout/set-prefill';
import type { SessionSet } from '../workout';

function makeSet(partial: Partial<SessionSet> = {}): SessionSet {
  return {
    id: 'set-1',
    sessionId: 'sessao-de-hoje',
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
    exercise: {
      id: 1,
      name: 'Supino reto',
      muscleGroup: 'peito',
      source: 'SEED',
      createdByUserId: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: null,
      level: null,
      mechanic: null,
      instructions: [],
      youtubeVideoId: null,
      youtubeVideoIdPt: null,
    },
    ...partial,
  };
}

describe('prefillForNextSet', () => {
  const previousSessionSet = makeSet({
    id: 'set-anterior',
    sessionId: 'sessao-anterior',
    weightKg: 62.5,
    reps: 10,
  });

  it('não propõe nada na primeira série sem sessão anterior', () => {
    // O recorde nem é parâmetro: sem série de sessão anterior, o certo é não
    // sugerir carga nenhuma — era isso que ancorava a série fria no teto (#190).
    expect(prefillForNextSet({ touched: false })).toEqual({ weightKg: null, reps: null });
  });

  it('parte da última série do exercício na sessão anterior', () => {
    expect(prefillForNextSet({ touched: false, previousSessionSet })).toEqual({
      weightKg: 62.5,
      reps: 10,
    });
  });

  it('herda a série anterior da própria sessão nas séries seguintes', () => {
    const sessionLastSet = makeSet({ id: 'set-2', weightKg: 70, reps: 8 });
    expect(prefillForNextSet({ touched: false, sessionLastSet, previousSessionSet })).toEqual({
      weightKg: 70,
      reps: 8,
    });
  });

  it('não sobrescreve o que a pessoa digitou antes da primeira série', () => {
    expect(prefillForNextSet({ touched: true, previousSessionSet })).toEqual({
      weightKg: null,
      reps: null,
    });
  });

  it('deixa a série registrada valer mesmo depois de a pessoa mexer nos campos', () => {
    const sessionLastSet = makeSet({ id: 'set-2', weightKg: 70, reps: 8 });
    expect(prefillForNextSet({ touched: true, sessionLastSet })).toEqual({
      weightKg: 70,
      reps: 8,
    });
  });

  it('trata carga 0 como carga, e não como campo vazio', () => {
    // Exercício de peso corporal: `0` é a resposta certa e precisa sobreviver a
    // qualquer `||` no caminho.
    const bodyweight = makeSet({ sessionId: 'sessao-anterior', weightKg: 0, reps: 12 });
    expect(prefillForNextSet({ touched: false, previousSessionSet: bodyweight })).toEqual({
      weightKg: 0,
      reps: 12,
    });
  });

  it('preenche só o campo que a referência tem', () => {
    const semCarga = makeSet({ sessionId: 'sessao-anterior', weightKg: null, reps: 12 });
    expect(prefillForNextSet({ touched: false, previousSessionSet: semCarga })).toEqual({
      weightKg: null,
      reps: 12,
    });
  });
});
