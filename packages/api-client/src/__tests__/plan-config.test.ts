import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import { workoutApi, type WorkoutPlanExercise } from '../workout';
import {
  addSelectionLabel,
  cardioTargetSummary,
  estimatePlanMinutes,
  formatRest,
  heartRateZones,
  planExerciseSummary,
  planMuscleShare,
  repRangeError,
  splitRepRange,
  joinRepRange,
  muscleGroupName,
  muscleGroupTone,
  muscleShareLabel,
  planSummaryLine,
  planHistoryLine,
  planCountsLine,
  planDraftSummary,
  planExerciseChips,
} from '../workout/plan-config';
import { ageFromBirthDate } from '../onboarding';

const pe = (over: Partial<WorkoutPlanExercise> & { muscleGroup?: string } = {}) => {
  const { muscleGroup = 'peito', ...rest } = over;
  return {
    id: 'pe',
    planId: 'p',
    exerciseId: 1,
    order: 1,
    targetSets: 3,
    targetReps: '8-12',
    repUnit: 'REPS',
    loadMode: 'WEIGHT',
    startLoadKg: null,
    restSeconds: null,
    technique: 'NORMAL',
    biSetWithNext: false,
    notes: null,
    cardioTarget: null,
    cardioDurationSeconds: null,
    cardioDistanceMeters: null,
    cardioIntensity: null,
    sets: [],
    exercise: { id: 1, name: 'X', muscleGroup } as WorkoutPlanExercise['exercise'],
    ...rest,
  } as WorkoutPlanExercise;
};

describe('faixa de repetições', () => {
  it('separa e junta a faixa, com traço comum ou meia-risca', () => {
    expect(splitRepRange('8-12')).toEqual({ min: '8', max: '12' });
    expect(splitRepRange('8–12')).toEqual({ min: '8', max: '12' });
    expect(splitRepRange('10')).toEqual({ min: '10', max: '10' });
    expect(splitRepRange('AMRAP')).toEqual({ min: '', max: '' });
    expect(joinRepRange('8', '12')).toBe('8-12');
    expect(joinRepRange('10', '10')).toBe('10');
  });

  it('mínimo acima do máximo é erro de digitação, com mensagem para a tela', () => {
    expect(repRangeError('15', '8')).toBe('O mínimo passa do máximo.');
    expect(repRangeError('8', '12')).toBeNull();
    expect(repRangeError('', '12')).toBe('Informe as repetições.');
    expect(repRangeError('0', '12')).toBe('Use números a partir de 1.');
  });
});

describe('descanso', () => {
  it('escreve como a prancha: segundos, minutos e minuto e meio', () => {
    expect(formatRest(45)).toBe('45 s');
    expect(formatRest(60)).toBe('1 min');
    expect(formatRest(90)).toBe('1:30');
    expect(formatRest(120)).toBe('2 min');
  });
});

describe('resumo do plano (Al-T7)', () => {
  it('estima minutos com o descanso de cada exercício e a meta do cardio', () => {
    // 3 séries × (40 s de trabalho + 60 s de descanso) = 5 min; esteira de 20 min.
    expect(
      estimatePlanMinutes([
        pe({ restSeconds: 60 }),
        pe({
          muscleGroup: 'cardio',
          targetSets: 1,
          cardioTarget: 'TIME',
          cardioDurationSeconds: 1200,
        }),
      ]),
    ).toBe(25);
  });

  it('divide as séries por grupo, em %, maior primeiro', () => {
    expect(
      planMuscleShare([
        pe({ targetSets: 6 }),
        pe({ targetSets: 3, muscleGroup: 'ombro' }),
        pe({ targetSets: 3, muscleGroup: 'peito' }),
      ]),
    ).toEqual([
      { group: 'peito', sets: 9, percent: 75 },
      { group: 'ombro', sets: 3, percent: 25 },
    ]);
  });

  it('resume cada linha: séries × faixa, ou a meta do cardio', () => {
    expect(planExerciseSummary(pe({ targetSets: 4, targetReps: '8-10' }))).toBe('4 × 8–10');
    expect(planExerciseSummary(pe({ repUnit: 'SECONDS', targetReps: '30-45' }))).toBe(
      '3 × 30–45 s',
    );
    expect(
      planExerciseSummary(
        pe({ muscleGroup: 'cardio', cardioTarget: 'DISTANCE', cardioDistanceMeters: 3000 }),
      ),
    ).toBe('3 km');
    expect(
      cardioTargetSummary({ cardioTarget: 'TIME', cardioDurationSeconds: 1200 } as never),
    ).toBe('20 min');
  });
});

describe('barra muscular e linha do card (Al-T6)', () => {
  it('nomeia, colore e descreve os grupos; resume o plano numa linha', () => {
    expect(muscleGroupName('ombro')).toBe('Ombro');
    expect(muscleGroupName('glúteo')).toBe('Glúteo');
    expect(muscleGroupTone('costas')).toBe('water');
    expect(muscleGroupTone('outro')).toBe('muted');
    expect(
      muscleShareLabel([
        { group: 'peito', sets: 4, percent: 57 },
        { group: 'ombro', sets: 3, percent: 43 },
      ]),
    ).toBe('Peito 57%, Ombro 43%');
    expect(planSummaryLine([pe({ targetSets: 1, restSeconds: 20 })])).toBe(
      '1 exercício · 1 série · ~1 min',
    );
  });
});

describe('chips e contagens do plano (Al-T6, Al-T7, Al-T19)', () => {
  const named = (name: string, order: number) => ({ order, exercise: { name } });

  it('os três primeiros em ordem, com as duas primeiras palavras, e o "+ N mais"', () => {
    expect(
      planExerciseChips([
        named('Crucifixo no cabo', 3),
        named('Supino reto com barra', 1),
        named('Desenvolvimento militar', 2),
        named('Tríceps corda', 4),
        named('Abdominal infra', 5),
      ]),
    ).toEqual([
      { label: '1', name: 'Supino reto' },
      { label: '2', name: 'Desenvolvimento militar' },
      { label: '3', name: 'Crucifixo no' },
      { label: '+', name: '2 mais' },
    ]);
  });

  it('sem "+ mais" com até três, e nada com o plano vazio', () => {
    expect(planExerciseChips([named('Stiff', 1)])).toEqual([{ label: '1', name: 'Stiff' }]);
    expect(planExerciseChips([])).toEqual([]);
  });

  it('a contagem sem os minutos, que ficam à direita no Al-T7', () => {
    expect(planCountsLine([pe({ targetSets: 4 }), pe({ targetSets: 3 })])).toBe(
      '2 exercícios · 7 séries',
    );
    expect(planCountsLine([pe({ targetSets: 1 })])).toBe('1 exercício · 1 série');
  });

  it('o resumo curto do Novo plano: "3 · 10 séries · ~26 min", vazio sem exercício', () => {
    expect(planDraftSummary([pe({ targetSets: 1, restSeconds: 20 })])).toBe('1 · 1 série · ~1 min');
    expect(planDraftSummary([])).toBe('');
  });
});

describe('histórico do plano (Al-T7)', () => {
  it('diz quantas vezes e há quanto tempo, em dias de calendário', () => {
    const now = new Date('2026-11-15T10:00:00');
    expect(planHistoryLine(12, '2026-11-11T20:00:00', now)).toBe(
      'feito 12 vezes · último há 4 dias',
    );
    expect(planHistoryLine(1, '2026-11-15T07:00:00', now)).toBe('feito 1 vez · último hoje');
    expect(planHistoryLine(2, '2026-11-14T23:00:00', now)).toBe('feito 2 vezes · último ontem');
    expect(planHistoryLine(0, null, now)).toBe('ainda não feito');
  });
});

describe('frequência cardíaca pela idade (Al-T21d)', () => {
  it('usa a idade e calcula as três zonas sobre 220 − idade', () => {
    expect(ageFromBirthDate('1996-05-10', '2026-05-09')).toBe(29);
    expect(ageFromBirthDate('1996-05-10', '2026-05-10')).toBe(30);
    // `usersApi.me` devolve data e hora (ISO); no mês do aniversário, o dia conta.
    expect(ageFromBirthDate('1990-11-20T00:00:00.000Z', '2026-11-25')).toBe(36);
    expect(ageFromBirthDate('1990-11-20T00:00:00.000Z', '2026-11-19')).toBe(35);
    expect(heartRateZones(30)).toEqual({
      LIGHT: [114, 133],
      MODERATE: [133, 152],
      VIGOROUS: [152, 171],
    });
    expect(heartRateZones(null)).toBeNull();
  });
});

describe('seleção múltipla (Al-T8)', () => {
  it('diz quantos vão entrar', () => {
    expect(addSelectionLabel(0)).toBe('Selecione os exercícios');
    expect(addSelectionLabel(1)).toBe('Adicionar 1 exercício');
    expect(addSelectionLabel(3)).toBe('Adicionar 3 exercícios');
  });
});

describe('workoutApi: favoritos e lote', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    configureApiClient({ resolveUrl: (p) => p, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  });
  afterEach(() => resetApiClient());

  it('favorita com PUT e desfaz com DELETE', async () => {
    await workoutApi.setExerciseFavorite(42, true);
    await workoutApi.setExerciseFavorite(42, false);
    expect(fetchMock.mock.calls.map(([u, i]) => [u, (i as RequestInit).method])).toEqual([
      ['/api/workout/exercises/42/favorite', 'PUT'],
      ['/api/workout/exercises/42/favorite', 'DELETE'],
    ]);
  });

  it('adiciona vários numa requisição, envolvidos em `exercises`', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'p', exercises: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await workoutApi.addPlanExercises('p', [3, 3, 9]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/workout/plans/p/exercises/batch');
    expect(JSON.parse(init.body as string)).toEqual({
      exercises: [{ exerciseId: 3 }, { exerciseId: 3 }, { exerciseId: 9 }],
    });
  });

  it('busca só favoritos com favoritesOnly', async () => {
    fetchMock.mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await workoutApi.searchExercises(undefined, undefined, { favoritesOnly: true });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/workout/exercises?favoritesOnly=true');
  });
});
