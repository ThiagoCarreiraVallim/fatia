import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_FORMAT_OPTIONS,
  circuitBadge,
  circuitBarSnapshot,
  circuitComparisonLabel,
  circuitDoneLine,
  circuitDraftErrors,
  circuitDraftSummary,
  circuitDraftToInput,
  circuitHeader,
  circuitLiveComparison,
  circuitItemValue,
  circuitNowLabel,
  circuitPlanSummary,
  circuitResultFacts,
  defaultCircuitName,
  draftFromCircuitPlan,
  newCircuitDraft,
  type CircuitDraft,
} from '../workout/circuit-copy';
import { circuitState, type CircuitDefinition } from '../workout/circuit-timer';
import type { WorkoutPlan, CircuitSummary } from '../workout';

const draft = (over: Partial<CircuitDraft> = {}): CircuitDraft => ({
  ...newCircuitDraft(),
  exercises: [
    { exerciseId: 1, name: 'Kettlebell swing', muscleGroup: 'pernas', unit: 'REPS', target: 15 },
    { exerciseId: 2, name: 'Burpee', muscleGroup: 'cardio', unit: 'REPS', target: 10 },
    { exerciseId: 3, name: 'Box jump', muscleGroup: 'pernas', unit: 'REPS', target: 8 },
    { exerciseId: 4, name: 'Prancha', muscleGroup: 'core', unit: 'SECONDS', target: 30 },
  ],
  ...over,
});

describe('Novo circuito (Al-T22)', () => {
  it('quatro formatos, com o texto da prancha', () => {
    expect(CIRCUIT_FORMAT_OPTIONS.map((o) => [o.format, o.title, o.subtitle])).toEqual([
      ['AMRAP', 'AMRAP', 'máximo de rounds no tempo'],
      ['EMOM', 'EMOM', 'uma tarefa a cada minuto'],
      ['TABATA', 'Tabata', 'trabalho e descanso em intervalos'],
      ['FOR_TIME', 'Rounds', 'N rounds, conta o tempo'],
    ]);
  });

  it('o padrão é o AMRAP 12 da prancha, e o nome acompanha o formato', () => {
    const d = newCircuitDraft();
    expect(d).toMatchObject({ name: 'AMRAP 12', format: 'AMRAP', minutes: 12, workSeconds: 20 });
    expect(defaultCircuitName({ ...d, format: 'EMOM' })).toBe('EMOM 12');
    expect(defaultCircuitName({ ...d, format: 'TABATA' })).toBe('Tabata');
    expect(defaultCircuitName({ ...d, format: 'FOR_TIME', rounds: 5 })).toBe('5 rounds');
  });

  it('o resumo de cada formato, como na prancha', () => {
    expect(circuitDraftSummary(draft())).toBe('12 min · 4 exercícios');
    expect(circuitDraftSummary(draft({ format: 'EMOM', minutes: 10 }))).toBe(
      '10 min · 4 exercícios · um por minuto, em rodízio',
    );
    expect(circuitDraftSummary(draft({ format: 'TABATA' }))).toBe(
      '8 × 20 s / 10 s · 4 min no total',
    );
    expect(circuitDraftSummary(draft({ format: 'TABATA', intervals: 5 }))).toBe(
      '5 × 20 s / 10 s · 2,5 min no total',
    );
    expect(
      circuitDraftSummary(draft({ format: 'FOR_TIME', rounds: 5, restBetweenRounds: 60 })),
    ).toBe('5 rounds · 4 exercícios · descanso de 60 s entre rounds');
  });

  it('vira o corpo da API só com os campos do formato', () => {
    expect(circuitDraftToInput(draft({ format: 'TABATA' }))).toEqual({
      name: 'AMRAP 12',
      format: 'TABATA',
      workSeconds: 20,
      restSeconds: 10,
      intervals: 8,
      exercises: [
        { exerciseId: 1, unit: 'REPS', target: 15 },
        { exerciseId: 2, unit: 'REPS', target: 10 },
        { exerciseId: 3, unit: 'REPS', target: 8 },
        { exerciseId: 4, unit: 'SECONDS', target: 30 },
      ],
    });
    expect(circuitDraftToInput(draft())).toMatchObject({ format: 'AMRAP', durationSeconds: 720 });
  });

  it('aponta o que falta antes de salvar', () => {
    expect(circuitDraftErrors(draft())).toEqual([]);
    expect(circuitDraftErrors(draft({ name: '  ', exercises: [] }))).toEqual([
      'Dê um nome ao circuito.',
      'Adicione pelo menos um exercício.',
    ]);
  });

  it('volta de um plano salvo para a edição', () => {
    const plan = {
      id: 'c1',
      name: 'For Time 5',
      kind: 'CIRCUIT',
      circuit: {
        format: 'FOR_TIME',
        durationSeconds: null,
        workSeconds: null,
        restSeconds: null,
        intervals: null,
        rounds: 5,
        restBetweenRoundsSeconds: 30,
      },
      exercises: [
        {
          id: 'pe1',
          exerciseId: 9,
          order: 1,
          targetSets: 1,
          targetReps: '12',
          repUnit: 'REPS',
          exercise: { id: 9, name: 'Passada', muscleGroup: 'pernas' },
        },
      ],
    } as unknown as WorkoutPlan;
    expect(draftFromCircuitPlan(plan)).toMatchObject({
      name: 'For Time 5',
      format: 'FOR_TIME',
      rounds: 5,
      restBetweenRounds: 30,
      exercises: [{ exerciseId: 9, name: 'Passada', unit: 'REPS', target: 12 }],
    });
  });
});

const amrap: CircuitDefinition = {
  format: 'AMRAP',
  name: 'AMRAP 12',
  config: { durationSeconds: 720 },
  exercises: [
    { exerciseId: 1, name: 'Burpee', muscleGroup: 'cardio', unit: 'REPS', target: 10 },
    { exerciseId: 2, name: 'Prancha', muscleGroup: 'core', unit: 'SECONDS', target: 30 },
  ],
};

describe('telas do circuito (Al-T4, T4b, T4c, T4d)', () => {
  it('o selo do topo e a cor de cada formato', () => {
    expect(circuitHeader(amrap)).toBe('AMRAP 12');
    expect(circuitHeader({ ...amrap, format: 'FOR_TIME', config: { rounds: 5 } })).toBe(
      'For Time · 5 rounds',
    );
    expect(circuitHeader({ ...amrap, format: 'EMOM', config: { durationSeconds: 600 } })).toBe(
      'EMOM 10',
    );
    expect(circuitBadge('AMRAP').tone).toBe('pro');
    expect(circuitBadge('TABATA').tone).toBe('trial');
    expect(circuitBadge('EMOM').tone).toBe('com');
  });

  it('o valor de cada exercício e o "agora"', () => {
    expect(circuitItemValue(amrap.exercises[0])).toBe('10');
    expect(circuitItemValue(amrap.exercises[1])).toBe('30 s');
    expect(circuitNowLabel(amrap.exercises[0])).toBe('Burpee × 10');
    expect(circuitNowLabel(amrap.exercises[1])).toBe('Prancha × 30 s');
  });

  it('a linha do concluído', () => {
    const tabata: CircuitDefinition = {
      ...amrap,
      format: 'TABATA',
      config: { workSeconds: 20, restSeconds: 10, intervals: 8 },
    };
    expect(
      circuitDoneLine(tabata, {
        intervalsCompleted: 8,
        elapsedSeconds: 240,
        roundsCompleted: 0,
        totals: [],
      }),
    ).toBe('8 intervalos · 4 min');
    const emom: CircuitDefinition = { ...amrap, format: 'EMOM', config: { durationSeconds: 600 } };
    expect(
      circuitDoneLine(emom, {
        intervalsCompleted: 10,
        elapsedSeconds: 600,
        roundsCompleted: 0,
        totals: [
          { exerciseId: 1, sets: 5, reps: 50, seconds: 0 },
          { exerciseId: 2, sets: 5, reps: 0, seconds: 150 },
        ],
      }),
    ).toBe('10 minutos · 50 burpee e 2:30 de prancha');
    expect(
      circuitDoneLine(
        { ...amrap, format: 'FOR_TIME', config: { rounds: 5 } },
        {
          intervalsCompleted: null,
          elapsedSeconds: 876,
          roundsCompleted: 5,
          totals: [],
        },
      ),
    ).toBe('5 rounds · burpee e prancha');
  });

  it('a barra do treino em andamento', () => {
    const s = circuitState(amrap, { startedAt: 0, events: [] }, 198_000);
    expect(circuitBarSnapshot(amrap, s)).toEqual({
      kind: 'amrap',
      name: 'AMRAP 12',
      rounds: 0,
      remainingSeconds: 522,
    });
  });
});

describe('Treino feito do circuito', () => {
  const summary: CircuitSummary = {
    format: 'AMRAP',
    name: 'AMRAP 12',
    config: { durationSeconds: 720 },
    roundsCompleted: 4,
    partialExercises: 2,
    stoppedAt: { exerciseId: 3, name: 'Box jump' },
    roundSeconds: [138, 144, 151, 160],
    partialRoundSeconds: 127,
    averageRoundSeconds: 148,
    elapsedSeconds: 720,
    finalTimeSeconds: null,
    intervalsCompleted: null,
    intervalsTotal: null,
    completed: true,
    totalReps: 148,
    exercises: [],
    previous: null,
    comparison: {
      verdict: 'better',
      roundsDelta: 1,
      finalTimeDeltaSeconds: null,
      intervalsDelta: null,
      repsDelta: 12,
      previousFinalTimeSeconds: null,
    },
  };

  it('os números do topo (Al-T11c)', () => {
    expect(circuitResultFacts(summary)).toEqual([
      { value: '4 + 2', label: 'rounds + exerc.' },
      { value: '12′', label: 'duração' },
      { value: '2:28', label: 'média/round' },
    ]);
    expect(
      circuitResultFacts({
        ...summary,
        format: 'FOR_TIME',
        finalTimeSeconds: 874,
        partialExercises: 0,
        roundsCompleted: 5,
      }),
    ).toEqual([
      { value: '14:34', label: 'tempo final' },
      { value: '5', label: 'rounds' },
      { value: '2:28', label: 'média/round' },
    ]);
  });

  it('o selo da comparação', () => {
    expect(circuitComparisonLabel(summary)).toEqual({
      text: '+1 round vs. a última vez',
      tone: 'ok',
    });
    expect(
      circuitComparisonLabel({
        ...summary,
        format: 'FOR_TIME',
        comparison: {
          ...summary.comparison!,
          verdict: 'better',
          finalTimeDeltaSeconds: -62,
          previousFinalTimeSeconds: 936,
        },
      }),
    ).toEqual({ text: 'melhor que a última vez · 15:36', tone: 'ok' });
    expect(circuitComparisonLabel({ ...summary, comparison: null })).toBeNull();
  });

  it('o resumo da lista de planos (Al-T6)', () => {
    const plan = {
      circuit: { format: 'TABATA', workSeconds: 20, restSeconds: 10, intervals: 8 },
      exercises: [{}, {}],
    } as unknown as WorkoutPlan;
    expect(circuitPlanSummary(plan)).toBe('8 × 20 s / 10 s · 2 exercícios');
    expect(
      circuitPlanSummary({
        circuit: { format: 'AMRAP', durationSeconds: 720 },
        exercises: [{}, {}, {}, {}],
      } as unknown as WorkoutPlan),
    ).toBe('máximo de rounds em 12 min · 4 exercícios');
    expect(
      circuitPlanSummary({
        circuit: { format: 'EMOM', durationSeconds: 600 },
        exercises: [{}, {}],
      } as unknown as WorkoutPlan),
    ).toBe('a cada minuto, 10 min · 2 exercícios');
  });
});

describe('a comparação na tela do relógio, antes de salvar (Al-T4e)', () => {
  const previous = {
    sessionId: 's0',
    startedAt: '2026-11-01T10:00:00.000Z',
    roundsCompleted: 5,
    partialExercises: 0,
    finalTimeSeconds: 902,
    intervalsCompleted: null,
    totalReps: 100,
    elapsedSeconds: 902,
  };

  it('For Time: tempo final contra o da última vez', () => {
    expect(
      circuitLiveComparison(
        'FOR_TIME',
        { roundsCompleted: 5, partialExercises: 0, finalTimeSeconds: 876 },
        previous,
      ),
    ).toEqual({ text: 'melhor que a última vez · 15:02', tone: 'ok' });
    expect(
      circuitLiveComparison(
        'FOR_TIME',
        { roundsCompleted: 5, partialExercises: 0, finalTimeSeconds: 950 },
        previous,
      ),
    ).toEqual({ text: 'a última vez · 15:02', tone: 'neutral' });
  });

  it('AMRAP: rounds a mais; sem última vez, nada', () => {
    expect(
      circuitLiveComparison(
        'AMRAP',
        { roundsCompleted: 6, partialExercises: 1, finalTimeSeconds: null },
        { ...previous, finalTimeSeconds: null },
      ),
    ).toEqual({ text: '+1 round vs. a última vez', tone: 'ok' });
    expect(
      circuitLiveComparison(
        'AMRAP',
        { roundsCompleted: 6, partialExercises: 1, finalTimeSeconds: null },
        null,
      ),
    ).toBeNull();
  });
});
