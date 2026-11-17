import { describe, expect, it } from 'vitest';
import {
  HISTORY_FILTERS,
  addToFreeWorkout,
  cardioOnly,
  cardioRecordLine,
  freeStartLabel,
  freeSuggestions,
  historyDay,
  historyLine,
  historyTitle,
  historyTotals,
  repeatPlanOf,
  sessionDetailTitle,
  sessionDetailBody,
  sessionPlanAction,
  sessionHero,
  sessionKindLabel,
  setLine,
} from '../workout/history-copy';
import type { WorkoutHistoryItem, WorkoutSessionSummary } from '../workout';

const KM = { loadUnit: 'KG', distanceUnit: 'KM' } as const;

const item = (over: Partial<WorkoutHistoryItem> = {}): WorkoutHistoryItem => ({
  id: 's1',
  startedAt: '2026-11-02T21:00:00.000Z',
  completedAt: '2026-11-02T21:52:00.000Z',
  kind: 'plan',
  title: 'Push',
  feeling: 2,
  notes: null,
  durationMinutes: 52,
  strengthExercises: 6,
  strengthSets: 19,
  volumeKg: 6200,
  cardioExercises: 0,
  cardio: null,
  ...over,
});

const treadmill = {
  exerciseName: 'Esteira',
  distanceMeters: 5100,
  durationSeconds: 1920,
  avgHeartRate: 146,
};

describe('histórico (Al-T10)', () => {
  it('filtros: Tudo, Planos, Circuitos e Livres (#380)', () => {
    expect(HISTORY_FILTERS.map((f) => f.label)).toEqual(['Tudo', 'Planos', 'Circuitos', 'Livres']);
    expect(HISTORY_FILTERS.map((f) => f.kind)).toEqual([undefined, 'plan', 'circuit', 'free']);
  });

  it('circuito: rounds (+ exercícios do round incompleto) ou intervalos, e os exercícios', () => {
    const circuit = (over: Partial<NonNullable<WorkoutHistoryItem['circuit']>>) =>
      item({
        kind: 'circuit',
        title: 'AMRAP 12',
        circuit: {
          format: 'AMRAP',
          roundsCompleted: 4,
          partialExercises: 2,
          intervalsCompleted: null,
          exercises: 4,
          ...over,
        },
      });
    expect(historyLine(circuit({}), KM)).toBe('4 rounds + 2 · 4 exercícios');
    expect(
      historyLine(circuit({ format: 'FOR_TIME', roundsCompleted: 1, partialExercises: 0 }), KM),
    ).toBe('1 round · 4 exercícios');
    expect(
      historyLine(circuit({ format: 'TABATA', intervalsCompleted: 8, exercises: 2 }), KM),
    ).toBe('8 intervalos · 2 exercícios');
  });

  it('o selo de tipo', () => {
    expect(sessionKindLabel('plan')).toBe('plano');
    expect(sessionKindLabel('circuit')).toBe('circuito');
    expect(sessionKindLabel('free')).toBe('livre');
  });

  it('o título é o do plano, ou "Treino livre"', () => {
    expect(historyTitle(item())).toBe('Push');
    expect(historyTitle(item({ title: null, kind: 'free' }))).toBe('Treino livre');
  });

  it('força: exercícios, séries e volume', () => {
    expect(historyLine(item(), KM)).toBe('6 exercícios · 19 séries · 6,2 t');
    expect(historyLine(item({ strengthExercises: 1, strengthSets: 1, volumeKg: 0 }), KM)).toBe(
      '1 exercício · 1 série',
    );
  });

  it('só cardio: o exercício, a distância e a FC', () => {
    const line = historyLine(
      item({
        strengthExercises: 0,
        strengthSets: 0,
        volumeKg: 0,
        cardioExercises: 1,
        cardio: treadmill,
      }),
      KM,
    );
    expect(line).toBe('Esteira · 5,1 km · 146 bpm');
  });

  it('só cardio sem distância: o tempo', () => {
    const line = historyLine(
      item({
        strengthExercises: 0,
        strengthSets: 0,
        cardioExercises: 1,
        cardio: { ...treadmill, distanceMeters: null, avgHeartRate: null },
      }),
      KM,
    );
    expect(line).toBe('Esteira · 32 min');
  });

  it('força com cardio: "+ esteira 10 min"', () => {
    const line = historyLine(
      item({
        strengthExercises: 5,
        cardioExercises: 1,
        cardio: { ...treadmill, durationSeconds: 600, distanceMeters: null },
      }),
      KM,
    );
    expect(line).toBe('5 exercícios + esteira 10 min');
  });

  it('distância na unidade da pessoa', () => {
    const line = historyLine(
      item({ strengthExercises: 0, strengthSets: 0, cardioExercises: 1, cardio: treadmill }),
      { loadUnit: 'KG', distanceUnit: 'MI' },
    );
    expect(line).toBe('Esteira · 3,2 milhas · 146 bpm');
  });

  it('o dia da linha, no fuso do aparelho', () => {
    const d = historyDay('2026-11-03T15:00:00.000Z');
    expect(d).toEqual({ weekday: 'ter', day: '3' });
  });

  it('os totais do topo', () => {
    expect(historyTotals({ sessions: 14, avgDurationMinutes: 58, volumeKg: 62000 }, 'KG')).toEqual([
      { value: '14', label: 'sessões' },
      { value: '58′', label: 'média' },
      { value: '62 t', label: 'volume' },
    ]);
    expect(historyTotals({ sessions: 1, avgDurationMinutes: null, volumeKg: 0 }, 'KG')).toEqual([
      { value: '1', label: 'sessão' },
      { value: '—', label: 'média' },
      { value: '0 kg', label: 'volume' },
    ]);
  });
});

const summary = (over: Partial<WorkoutSessionSummary> = {}): WorkoutSessionSummary =>
  ({
    sessionId: 's1',
    kind: 'plan',
    planId: 'p1',
    planName: 'Push',
    startedAt: '2026-11-02T15:00:00.000Z',
    completedAt: '2026-11-02T15:52:00.000Z',
    durationMinutes: 52,
    sets: 18,
    volumeKg: 6200,
    feeling: 2,
    notes: 'Joelho ok',
    overallFeeling: 2,
    comparison: null,
    records: [],
    muscles: { groups: [], primary: [], secondary: [] },
    exercises: [
      {
        exerciseId: 1,
        exerciseName: 'Supino',
        muscleGroup: 'peito',
        isCardio: false,
        sets: 4,
        best: null,
        feeling: 3,
        isRecord: true,
      },
    ],
    checkin: null,
    questions: null,
    ...over,
  }) as WorkoutSessionSummary;

const runSummary = () =>
  summary({
    kind: 'free',
    planId: null,
    planName: null,
    durationMinutes: 32,
    volumeKg: 0,
    exercises: [
      {
        exerciseId: 9,
        exerciseName: 'Esteira',
        muscleGroup: 'cardio',
        isCardio: true,
        sets: 1,
        best: {
          weightKg: null,
          reps: null,
          distanceMeters: 5100,
          durationSeconds: 1920,
          avgHeartRate: 146,
          kcalBurned: 340,
        },
        feeling: null,
        isRecord: true,
      },
    ],
  });

describe('detalhe da sessão (Al-T11, Al-T11b)', () => {
  it('o título é o dia: "Seg, 2 nov"', () => {
    expect(sessionDetailTitle('2026-11-02T15:00:00.000Z')).toBe('Seg, 2 nov');
  });

  it('sessão de força: o cartão verde com duração, volume e séries', () => {
    expect(cardioOnly(summary())).toBe(false);
    expect(sessionHero(summary(), KM)).toEqual({
      tone: 'strength',
      label: 'CONCLUÍDO · PUSH',
      facts: [
        { value: '52′', label: 'duração' },
        { value: '6,2 t', label: 'volume' },
        { value: '18', label: 'séries' },
      ],
    });
  });

  it('só cardio: o cartão de cardio com distância, duração e FC média', () => {
    expect(cardioOnly(runSummary())).toBe(true);
    expect(sessionHero(runSummary(), KM)).toEqual({
      tone: 'cardio',
      label: 'CONCLUÍDO · TREINO LIVRE',
      facts: [
        { value: '5,1 km', label: 'distância' },
        { value: '32′', label: 'duração' },
        { value: '146', label: 'FC média' },
      ],
    });
  });

  it('a série: carga × reps, peso do corpo, tempo ou cardio', () => {
    const base = {
      setNumber: 1,
      weightKg: null,
      reps: null,
      durationSeconds: null,
      distanceMeters: null,
      feeling: null,
    };
    expect(setLine({ ...base, weightKg: 52.5, reps: 10 }, KM)).toBe('52,5 kg × 10');
    expect(setLine({ ...base, weightKg: 52.5, reps: 10 }, { ...KM, loadUnit: 'LB' })).toBe(
      '115,7 lb × 10',
    );
    expect(setLine({ ...base, reps: 12 }, KM)).toBe('12 reps');
    expect(setLine({ ...base, durationSeconds: 45 }, KM)).toBe('45 s');
    expect(setLine({ ...base, distanceMeters: 2400, durationSeconds: 900 }, KM)).toBe(
      '2,4 km · 15 min',
    );
  });

  it('o recorde de distância diz o de antes', () => {
    expect(
      cardioRecordLine(
        {
          exerciseId: 9,
          exerciseName: 'Esteira',
          weightKg: null,
          reps: null,
          distanceMeters: 5100,
          durationSeconds: 1920,
          previous: { weightKg: null, reps: null, distanceMeters: 4600 },
        },
        KM,
      ),
    ).toEqual({ title: 'Maior distância na esteira', before: 'antes 4,6 km' });
  });

  it('o corpo do detalhe: circuito (Al-T11c), só cardio (Al-T11b) ou força (Al-T11)', () => {
    const circuit = { format: 'AMRAP' } as unknown as NonNullable<WorkoutSessionSummary['circuit']>;
    expect(sessionDetailBody({ ...summary(), kind: 'circuit', circuit })).toEqual({
      kind: 'circuit',
      circuit,
      repeatPlanId: summary().planId,
    });
    // Circuito apagado: o resultado fica, o "Repetir circuito" some.
    expect(sessionDetailBody({ ...summary(), planId: null, circuit })).toMatchObject({
      kind: 'circuit',
      repeatPlanId: null,
    });
    expect(sessionDetailBody(runSummary())).toEqual({ kind: 'cardio' });
    expect(sessionDetailBody(summary())).toEqual({ kind: 'strength' });
  });

  it('circuito não vira plano, nem com o resumo sem `kind` (#380)', () => {
    const circuit = { format: 'AMRAP' } as unknown as NonNullable<WorkoutSessionSummary['circuit']>;
    expect(sessionPlanAction({ ...runSummary(), kind: undefined, circuit })).toBeNull();
    expect(sessionPlanAction({ ...runSummary(), kind: 'circuit', circuit })).toBeNull();
  });

  it('livre oferece salvar como plano; já salvo, ver o plano', () => {
    expect(sessionPlanAction(runSummary())).toEqual({ kind: 'save' });
    expect(sessionPlanAction({ ...runSummary(), savedPlanId: 'p9' })).toEqual({
      kind: 'view',
      planId: 'p9',
    });
  });

  it('sessão de plano não vira plano, nem depois de o plano ser apagado', () => {
    expect(sessionPlanAction(summary())).toBeNull();
    expect(sessionPlanAction({ ...summary(), planId: null, kind: 'plan' })).toBeNull();
  });

  it('repetir: com plano, o plano; livre, os mesmos exercícios', () => {
    expect(repeatPlanOf(summary())).toEqual({ planId: 'p1', pending: [] });
    expect(repeatPlanOf(runSummary())).toEqual({
      planId: null,
      pending: [{ id: 9, name: 'Esteira', muscleGroup: 'cardio' }],
    });
  });
});

describe('treino livre (Al-T17b)', () => {
  it('o botão diz quantos exercícios', () => {
    expect(freeStartLabel(0)).toBe('Iniciar treino');
    expect(freeStartLabel(1)).toBe('Iniciar treino · 1 exercício');
    expect(freeStartLabel(3)).toBe('Iniciar treino · 3 exercícios');
  });
});

describe('montar o treino livre (Al-T17b)', () => {
  const supino = { id: 1, name: 'Supino', muscleGroup: 'peito' };
  const remada = { id: 2, name: 'Remada', muscleGroup: 'costas' };
  const esteira = { id: 3, name: 'Esteira', muscleGroup: 'cardio' };

  it('soma na ordem, sem repetir, e diz o que entrou', () => {
    expect(addToFreeWorkout([], [supino])).toEqual({
      picked: [supino],
      message: 'Supino adicionado',
    });
    expect(addToFreeWorkout([supino], [supino, remada, esteira])).toEqual({
      picked: [supino, remada, esteira],
      message: '2 adicionados',
    });
    expect(addToFreeWorkout([supino], [supino])).toEqual({ picked: [supino], message: null });
  });

  it('sugeridos: a busca sem termo, sem os já escolhidos, até o limite', () => {
    const results = [supino, remada, esteira];
    expect(freeSuggestions(results, [remada], 8)).toEqual([supino, esteira]);
    expect(freeSuggestions(results, [], 2)).toEqual([supino, remada]);
    expect(freeSuggestions(undefined, [], 8)).toEqual([]);
  });

  it('sugeridos: favoritos, depois os dos planos (um de cada plano por vez), depois a busca', () => {
    const fav = { id: 9, name: 'Prancha', muscleGroup: 'core', favorite: true };
    const abd = { id: 10, name: 'Abdominais', muscleGroup: 'core' };
    const agach = { id: 11, name: 'Agachamento', muscleGroup: 'pernas' };
    const puxada = { id: 12, name: 'Puxada', muscleGroup: 'costas' };
    const plans = [
      { exercises: [{ exercise: supino }, { exercise: fav }] },
      { exercises: [{ exercise: agach }] },
      { exercises: [{ exercise: puxada }, { exercise: remada }] },
    ];
    expect(freeSuggestions([fav, abd, esteira], [], 8, plans)).toEqual([
      fav,
      supino,
      agach,
      puxada,
      remada,
      abd,
      esteira,
    ]);
    // Os já escolhidos saem também da parte dos planos; o limite vale para tudo.
    expect(freeSuggestions([fav, abd], [agach], 3, plans)).toEqual([fav, supino, puxada]);
  });
});
