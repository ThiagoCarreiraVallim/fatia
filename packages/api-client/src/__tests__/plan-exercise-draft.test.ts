import { describe, expect, it } from 'vitest';
import type { WorkoutPlanExercise } from '../workout';
import {
  draftFromPlanExercise,
  planDraftToInput,
  stepDecimal,
  validateDraft,
} from '../workout/plan-exercise-draft';

const base = (over: Partial<WorkoutPlanExercise> = {}, muscleGroup = 'ombro') =>
  ({
    id: 'pe',
    planId: 'p',
    exerciseId: 1,
    order: 1,
    targetSets: 3,
    targetReps: '12-15',
    repUnit: 'REPS',
    loadMode: 'WEIGHT',
    startLoadKg: 8.5,
    restSeconds: 60,
    technique: 'NORMAL',
    biSetWithNext: false,
    notes: null,
    cardioTarget: null,
    cardioDurationSeconds: null,
    cardioDistanceMeters: null,
    cardioIntensity: null,
    sets: [],
    exercise: { id: 1, name: 'Elevação lateral', muscleGroup },
    ...over,
  }) as WorkoutPlanExercise;

describe('rascunho do Configurar exercício (Al-T21)', () => {
  it('abre com o que está gravado, carga com vírgula na unidade da pessoa', () => {
    const d = draftFromPlanExercise(base(), 'KG');
    expect(d).toMatchObject({
      sets: '3',
      repsMin: '12',
      repsMax: '15',
      startLoad: '8,5',
      rest: '60',
      technique: 'NORMAL',
      perSet: false,
    });
    expect(draftFromPlanExercise(base(), 'LB').startLoad).toBe('18,7');
    expect(draftFromPlanExercise(base({ biSetWithNext: true }), 'KG').technique).toBe('BI_SET');
  });

  it('valida no ato: mínimo acima do máximo, séries fora do limite, carga com letra', () => {
    const d = draftFromPlanExercise(base(), 'KG');
    expect(validateDraft({ ...d, repsMin: '15', repsMax: '8' })).toEqual({
      reps: 'O mínimo passa do máximo.',
    });
    expect(validateDraft({ ...d, sets: '0' }).sets).toBe('De 1 a 50 séries.');
    expect(validateDraft({ ...d, startLoad: '8,x' }).startLoad).toBe('Use só números, ex.: 12,5.');
    expect(validateDraft({ ...d, rest: '1000' }).rest).toBe('Até 900 s.');
    expect(validateDraft(d)).toEqual({});
  });

  it('grava em kg, com bi-set como marcação e a técnica normal', () => {
    const d = {
      ...draftFromPlanExercise(base(), 'LB'),
      startLoad: '20',
      technique: 'BI_SET' as const,
    };
    expect(planDraftToInput(d, 'LB')).toMatchObject({
      targetSets: 3,
      targetReps: '12-15',
      startLoadKg: 9.07,
      restSeconds: 60,
      technique: 'NORMAL',
      biSetWithNext: true,
      sets: [],
      notes: null,
    });
  });

  it('série por série manda a tabela e deixa a API recalcular séries e faixa', () => {
    const d = draftFromPlanExercise(
      base({
        sets: [
          { order: 1, kind: 'WARMUP', reps: 15, loadKg: 6 },
          { order: 2, kind: 'NORMAL', reps: 10, loadKg: 10 },
        ],
      }),
      'KG',
    );
    expect(d.perSet).toBe(true);
    expect(d.rows).toEqual([
      { kind: 'WARMUP', reps: '15', load: '6' },
      { kind: 'NORMAL', reps: '10', load: '10' },
    ]);
    const input = planDraftToInput(
      { ...d, rows: [...d.rows, { kind: 'DROP', reps: '8', load: '' }] },
      'KG',
    );
    expect(input.sets).toEqual([
      { kind: 'WARMUP', reps: 15, loadKg: 6 },
      { kind: 'NORMAL', reps: 10, loadKg: 10 },
      { kind: 'DROP', reps: 8, loadKg: null },
    ]);
    expect(input).not.toHaveProperty('targetSets');
    expect(validateDraft({ ...d, rows: [{ kind: 'NORMAL', reps: '0', load: '' }] })).toEqual({
      rows: 'Série 1: repetições a partir de 1.',
    });
  });

  it('cardio (Al-T21d): meta por distância em km com vírgula, só os campos de cardio', () => {
    const d = draftFromPlanExercise(base({ targetReps: '', restSeconds: null }, 'cardio'), 'KG');
    expect(d.cardio).toBe(true);
    const input = planDraftToInput(
      { ...d, cardioTarget: 'DISTANCE', cardioKm: '3,5', cardioIntensity: 'MODERATE' },
      'KG',
    );
    expect(input).toEqual({
      cardioTarget: 'DISTANCE',
      cardioDistanceMeters: 3500,
      cardioDurationSeconds: null,
      cardioIntensity: 'MODERATE',
    });
    expect(validateDraft({ ...d, cardioTarget: 'TIME', cardioMinutes: '' })).toEqual({
      cardio: 'Informe a duração.',
    });
  });

  it('−/+ andam pelo passo e respeitam os limites, com vírgula', () => {
    expect(stepDecimal('8,5', 1, { step: 2.5, min: 0, max: 1000 })).toBe('11');
    expect(stepDecimal('', 1, { step: 1, min: 1, max: 50 })).toBe('1');
    expect(stepDecimal('1', -1, { step: 1, min: 1, max: 50 })).toBe('1');
    expect(stepDecimal('3', -1, { step: 0.5, min: 0.5, max: 1000 })).toBe('2,5');
  });
});
