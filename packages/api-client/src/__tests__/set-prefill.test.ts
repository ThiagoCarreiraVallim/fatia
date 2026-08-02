import { describe, expect, it } from 'vitest';
import { prefillForNextSet } from '../workout/set-prefill';
import type { PrescribedSet, SessionSet } from '../workout';

const prescription: PrescribedSet = {
  status: 'ok',
  weightKg: 65,
  reps: 8,
  restSeconds: 90,
  basis: 'rpe',
  action: 'increase_load',
  capped: false,
};

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

  it('prefere a prescrição à cópia da série anterior', () => {
    // A prescrição parte da mesma sessão anterior, mas com o passo que o
    // histórico justifica — copiar a série anterior é o palpite que nunca sobe.
    expect(prefillForNextSet({ touched: false, previousSessionSet, prescription })).toEqual({
      weightKg: 65,
      reps: 8,
    });
  });

  it('volta para a série anterior quando não há prescrição', () => {
    // Menos de duas sessões: a API responde `insufficient_history` e a tela não
    // passa prescrição nenhuma.
    expect(prefillForNextSet({ touched: false, previousSessionSet, prescription: null })).toEqual({
      weightKg: 62.5,
      reps: 10,
    });
  });

  it('não deixa a prescrição sobrescrever o que a pessoa digitou', () => {
    expect(prefillForNextSet({ touched: true, previousSessionSet, prescription })).toEqual({
      weightKg: null,
      reps: null,
    });
  });

  it('não deixa a prescrição sobrescrever série já feita nesta sessão', () => {
    // Acabou de levantar 70 kg: o número mais recente ganha do prescrito de
    // manhã, senão o campo andaria para trás no meio do exercício.
    const sessionLastSet = makeSet({ id: 'set-2', weightKg: 70, reps: 8 });
    expect(prefillForNextSet({ touched: false, sessionLastSet, prescription })).toEqual({
      weightKg: 70,
      reps: 8,
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
