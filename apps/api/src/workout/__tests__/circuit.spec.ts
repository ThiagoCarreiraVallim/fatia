import { BadRequestException } from '@nestjs/common';
import {
  MAX_CIRCUIT_SETS,
  checkCircuitResultBounds,
  circuitDefinitionFromPlan,
  circuitSetRows,
  circuitSummaryView,
  compareCircuitResults,
  normalizeCircuitConfig,
  parseCircuitJson,
  type CircuitDefinitionV1,
} from '../helpers/circuit';

const amrap: CircuitDefinitionV1 = {
  format: 'AMRAP',
  name: 'AMRAP 12',
  config: { durationSeconds: 720 },
  exercises: [
    { exerciseId: 1, name: 'Swing', muscleGroup: 'pernas', unit: 'REPS', target: 15 },
    { exerciseId: 2, name: 'Burpee', muscleGroup: 'cardio', unit: 'REPS', target: 10 },
    { exerciseId: 3, name: 'Prancha', muscleGroup: 'core', unit: 'SECONDS', target: 30 },
  ],
};

describe('normalizeCircuitConfig', () => {
  it('guarda só os campos do formato', () => {
    expect(
      normalizeCircuitConfig('AMRAP', { durationSeconds: 720, rounds: 5, workSeconds: 20 }),
    ).toEqual({
      durationSeconds: 720,
      workSeconds: null,
      restSeconds: null,
      intervals: null,
      rounds: null,
      restBetweenRoundsSeconds: null,
    });
    expect(normalizeCircuitConfig('FOR_TIME', { rounds: 5 })).toMatchObject({
      rounds: 5,
      restBetweenRoundsSeconds: 0,
    });
    expect(
      normalizeCircuitConfig('TABATA', { workSeconds: 20, restSeconds: 10, intervals: 8 }),
    ).toMatchObject({ workSeconds: 20, restSeconds: 10, intervals: 8, durationSeconds: null });
  });

  it('recusa o campo que falta ou sai da faixa, com 400', () => {
    expect(() => normalizeCircuitConfig('AMRAP', {})).toThrow(BadRequestException);
    expect(() => normalizeCircuitConfig('EMOM', { durationSeconds: 30 })).toThrow(
      BadRequestException,
    );
    expect(() => normalizeCircuitConfig('TABATA', { workSeconds: 20, intervals: 8 })).toThrow(
      BadRequestException,
    );
    expect(() => normalizeCircuitConfig('FOR_TIME', { rounds: 0 })).toThrow(BadRequestException);
    expect(() => normalizeCircuitConfig('EMOM', { durationSeconds: 90 })).toThrow(
      /minutos inteiros/,
    );
  });
});

describe('circuitDefinitionFromPlan', () => {
  it('congela formato, configuração e exercícios na ordem, com reps ou segundos', () => {
    const def = circuitDefinitionFromPlan({
      name: 'AMRAP 12',
      circuit: {
        format: 'AMRAP',
        durationSeconds: 720,
        workSeconds: null,
        restSeconds: null,
        intervals: null,
        rounds: null,
        restBetweenRoundsSeconds: null,
      },
      exercises: [
        {
          exerciseId: 3,
          targetReps: '30',
          repUnit: 'SECONDS',
          order: 2,
          exercise: { name: 'Prancha', muscleGroup: 'core' },
        },
        {
          exerciseId: 1,
          targetReps: '8-12',
          repUnit: 'REPS',
          order: 1,
          exercise: { name: 'Swing', muscleGroup: 'pernas' },
        },
      ],
    });
    expect(def).toEqual({
      format: 'AMRAP',
      name: 'AMRAP 12',
      config: { durationSeconds: 720 },
      exercises: [
        { exerciseId: 1, name: 'Swing', muscleGroup: 'pernas', unit: 'REPS', target: 12 },
        { exerciseId: 3, name: 'Prancha', muscleGroup: 'core', unit: 'SECONDS', target: 30 },
      ],
    });
  });
});

describe('circuitSetRows', () => {
  it('AMRAP: uma série por exercício por round, mais o round parcial', () => {
    const rows = circuitSetRows(amrap, {
      roundsCompleted: 2,
      partialExercises: 1,
      intervalsCompleted: null,
    });
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.exerciseId === 1).map((r) => r.setNumber)).toEqual([1, 2, 3]);
    expect(rows.find((r) => r.exerciseId === 3)).toMatchObject({
      reps: null,
      durationSeconds: 30,
    });
    expect(new Set(rows.map((r) => r.clientKey)).size).toBe(7);
  });

  it('Tabata: a série é o tempo de trabalho, em rodízio', () => {
    const tabata: CircuitDefinitionV1 = {
      ...amrap,
      format: 'TABATA',
      config: { workSeconds: 20, restSeconds: 10, intervals: 4 },
    };
    const rows = circuitSetRows(tabata, {
      roundsCompleted: 0,
      partialExercises: 0,
      intervalsCompleted: 4,
    });
    expect(rows.map((r) => [r.exerciseId, r.durationSeconds, r.reps])).toEqual([
      [1, 20, null],
      [2, 20, null],
      [3, 20, null],
      [1, 20, null],
    ]);
  });
});

describe('compareCircuitResults', () => {
  const base = {
    roundsCompleted: 4,
    partialExercises: 2,
    finalTimeSeconds: null,
    intervalsCompleted: null,
    totalReps: 120,
    completed: true,
  };

  it('AMRAP: mais rounds (e exercícios do parcial) é melhor', () => {
    expect(compareCircuitResults('AMRAP', 3, base, { ...base, roundsCompleted: 3 })).toMatchObject({
      verdict: 'better',
      roundsDelta: 1,
    });
    expect(compareCircuitResults('AMRAP', 3, base, base)?.verdict).toBe('same');
    expect(compareCircuitResults('AMRAP', 3, base, { ...base, partialExercises: 3 })?.verdict).toBe(
      'worse',
    );
  });

  it('For Time: menos tempo é melhor; terminar vence não terminar', () => {
    const done = { ...base, roundsCompleted: 5, partialExercises: 0, finalTimeSeconds: 840 };
    expect(
      compareCircuitResults('FOR_TIME', 3, done, { ...done, finalTimeSeconds: 902 }),
    ).toMatchObject({ verdict: 'better', finalTimeDeltaSeconds: -62 });
    expect(
      compareCircuitResults('FOR_TIME', 3, done, {
        ...base,
        completed: false,
        finalTimeSeconds: null,
      })?.verdict,
    ).toBe('better');
  });

  it('sem treino anterior não há comparação', () => {
    expect(compareCircuitResults('EMOM', 2, base, null)).toBeNull();
  });
});

describe('parseCircuitJson', () => {
  it('lê o JSON v1 e recusa o que não é', () => {
    const json = {
      version: 1,
      definition: amrap,
      startedAt: '2026-11-16T18:00:00.000Z',
      events: [{ type: 'mark', at: 1 }],
      result: null,
    };
    expect(parseCircuitJson(json)?.definition.name).toBe('AMRAP 12');
    expect(parseCircuitJson({ version: 2 })).toBeNull();
    expect(parseCircuitJson(null)).toBeNull();
  });
});

describe('circuitSummaryView', () => {
  const result = {
    roundsCompleted: 4,
    partialExercises: 2,
    roundSeconds: [138, 144, 151, 160],
    partialRoundSeconds: 127,
    elapsedSeconds: 720,
    finalTimeSeconds: null,
    intervalsCompleted: null,
    completed: true,
    totalReps: 148,
    exercises: [
      { exerciseId: 1, sets: 5, reps: 75, seconds: 0 },
      { exerciseId: 2, sets: 5, reps: 50, seconds: 0 },
      { exerciseId: 3, sets: 4, reps: 0, seconds: 120 },
    ],
  };
  const json = {
    version: 1 as const,
    definition: amrap,
    startedAt: '2026-11-16T18:00:00.000Z',
    events: [],
    result,
  };

  it('monta o resumo do Al-T11c: rounds + parcial, média, onde parou, por exercício', () => {
    const view = circuitSummaryView(json, {
      sessionId: 's0',
      startedAt: new Date('2026-11-10T18:00:00Z'),
      json: { ...json, result: { ...result, roundsCompleted: 3 } },
    });
    expect(view).toMatchObject({
      format: 'AMRAP',
      name: 'AMRAP 12',
      roundsCompleted: 4,
      partialExercises: 2,
      stoppedAt: { exerciseId: 3, name: 'Prancha' },
      averageRoundSeconds: 148,
      intervalsTotal: null,
      previous: { sessionId: 's0', roundsCompleted: 3 },
      comparison: { verdict: 'better', roundsDelta: 1 },
    });
    expect(view?.exercises[2]).toEqual({
      exerciseId: 3,
      name: 'Prancha',
      muscleGroup: 'core',
      unit: 'SECONDS',
      target: 30,
      sets: 4,
      reps: 0,
      seconds: 120,
    });
  });

  it('circuito ainda sem resultado (sessão aberta) não tem resumo', () => {
    expect(circuitSummaryView({ ...json, result: null }, null)).toBeNull();
  });
});

/**
 * Revisão da #380: o resultado sem toques (registro pelo MCP) é conferido por
 * faixas; antes um AMRAP de 20 exercícios com 10.000 rounds gravava 200 mil
 * séries.
 */
describe('checkCircuitResultBounds', () => {
  const counts = (over: Partial<Parameters<typeof checkCircuitResultBounds>[1]> = {}) => ({
    roundsCompleted: 3,
    partialExercises: 0,
    roundSeconds: [200, 220, 240],
    elapsedSeconds: 720,
    finalTimeSeconds: null,
    intervalsCompleted: null,
    ...over,
  });
  const forTime: CircuitDefinitionV1 = {
    ...amrap,
    format: 'FOR_TIME',
    config: { rounds: 3, restBetweenRoundsSeconds: 0 },
  };
  const twenty: CircuitDefinitionV1 = {
    ...amrap,
    exercises: Array.from({ length: 20 }, (_, i) => ({
      exerciseId: i + 1,
      name: `E${i}`,
      muscleGroup: 'pernas',
      unit: 'REPS' as const,
      target: 10,
    })),
  };

  it('aceita o resultado plausível', () => {
    expect(() => checkCircuitResultBounds(amrap, counts())).not.toThrow();
  });

  it('AMRAP: rounds cabem no tempo (o repro de 10.000 rounds é 400)', () => {
    expect(() =>
      checkCircuitResultBounds(twenty, counts({ roundsCompleted: 10_000, roundSeconds: [] }), {
        roundTimesOptional: true,
      }),
    ).toThrow(BadRequestException);
    // 3 s por exercício de reps e o tempo dos de segundos: 720 / (3 + 3 + 30) = 20.
    expect(() =>
      checkCircuitResultBounds(amrap, counts({ roundsCompleted: 21, roundSeconds: [] }), {
        roundTimesOptional: true,
      }),
    ).toThrow(/rounds/);
    expect(() =>
      checkCircuitResultBounds(amrap, counts({ roundsCompleted: 20, roundSeconds: [] }), {
        roundTimesOptional: true,
      }),
    ).not.toThrow();
  });

  it('tempo além do circuito é 400', () => {
    expect(() => checkCircuitResultBounds(amrap, counts({ elapsedSeconds: 900 }))).toThrow(
      BadRequestException,
    );
  });

  it('um tempo por round: nem a mais, nem a menos (sem toques, pode faltar todos)', () => {
    expect(() => checkCircuitResultBounds(amrap, counts({ roundSeconds: [200] }))).toThrow(
      /tempo de round/,
    );
    expect(() =>
      checkCircuitResultBounds(amrap, counts({ roundSeconds: [200], roundsCompleted: 0 })),
    ).toThrow(/tempo de round/);
    expect(() => checkCircuitResultBounds(amrap, counts({ roundSeconds: [] }))).toThrow(
      /tempo de round/,
    );
    expect(() =>
      checkCircuitResultBounds(amrap, counts({ roundSeconds: [] }), { roundTimesOptional: true }),
    ).not.toThrow();
  });

  it('For Time: tempo final só com todos os rounds, maior que zero e não menor que a soma', () => {
    const done = counts({ finalTimeSeconds: 700, elapsedSeconds: 700 });
    expect(() => checkCircuitResultBounds(forTime, done)).not.toThrow();
    expect(() =>
      checkCircuitResultBounds(forTime, { ...done, roundsCompleted: 2, roundSeconds: [200, 220] }),
    ).toThrow(/tempo final/);
    expect(() => checkCircuitResultBounds(forTime, { ...done, partialExercises: 1 })).toThrow(
      /tempo final/,
    );
    expect(() => checkCircuitResultBounds(forTime, { ...done, finalTimeSeconds: 0 })).toThrow(
      /tempo final/,
    );
    expect(() => checkCircuitResultBounds(forTime, { ...done, finalTimeSeconds: 300 })).toThrow(
      /tempo final/,
    );
  });

  it('o total de séries de um fim tem teto', () => {
    const big: CircuitDefinitionV1 = { ...twenty, config: { durationSeconds: 1_000_000 } };
    const rounds = Math.ceil(MAX_CIRCUIT_SETS / 20) + 1;
    expect(() =>
      checkCircuitResultBounds(
        big,
        counts({ roundsCompleted: rounds, roundSeconds: [], elapsedSeconds: 1000 }),
        { roundTimesOptional: true },
      ),
    ).toThrow(/séries/);
  });
});
