import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import {
  CHALLENGE_KINDS,
  CREATABLE_CHALLENGE_KINDS,
  CREATABLE_POINT_ITEMS,
  challengeKindProblem,
  challengeProblem,
  challengeUsesSteps,
  STEPS_CLOSED_TEXT,
  STEPS_SYNC_AVAILABLE,
  challengeScoreLabel,
  challengeSections,
  CHECKIN_BLOCK_TAG,
  CHECKIN_BLOCK_TEXT,
  challengesApi,
  KIND_INFO,
  POINT_ITEMS,
  POINT_ITEM_INFO,
  maxPointsOf,
  type Challenge,
} from '../community-challenges';

const c = (over: Partial<Challenge>): Challenge =>
  ({
    id: 'x',
    title: 'T',
    description: null,
    kind: 'PHOTO',
    metric: 'WORKOUT_SESSIONS',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    totalDays: 30,
    status: 'running',
    endedEarly: false,
    resultPending: false,
    participants: 3,
    rules: {
      waterGoalMl: null,
      stepsGoal: null,
      dailyCap: null,
      allowedStepSources: [],
      pointsTable: null,
      maxPointsPerDay: null,
      checkin: { minWorkoutMinutes: 20, windowHours: 2 },
    },
    needsPhotoConsent: true,
    watching: false,
    canManage: false,
    canReview: false,
    me: null,
    ...over,
  }) as Challenge;

describe('desafios do redesign (#395): tipos e textos', () => {
  it('todo tipo tem rótulo e explicação; nenhum fala de peso ou medida como métrica', () => {
    for (const k of CHALLENGE_KINDS) {
      expect(KIND_INFO[k].label).toBeTruthy();
      expect(KIND_INFO[k].explain).not.toMatch(/perder peso|medida/i);
    }
    expect(POINT_ITEMS.map((i) => POINT_ITEM_INFO[i].label)).toEqual([
      'Treino com check-in',
      'Água na meta',
      'Passos na meta',
      'Proteína na meta',
      'Dia na faixa de calorias',
    ]);
  });

  it('a pontuação dos tipos novos é em dias ou pontos, nunca ml ou passos', () => {
    expect(challengeScoreLabel(c({ kind: 'WATER', metric: 'WATER_ML' }), 8)).toBe('8 dias');
    expect(challengeScoreLabel(c({ kind: 'STEPS', metric: 'STEPS' }), 1)).toBe('1 dia');
    expect(challengeScoreLabel(c({ kind: 'POINTS', metric: 'ACTIVE_DAYS' }), 86)).toBe('86 pts');
    expect(challengeScoreLabel(c({ kind: 'METRIC', metric: 'WORKOUT_SESSIONS' }), 2)).toBe(
      '2 treinos',
    );
  });

  it('as seções da lista (Cm-08): participa, para olhar, próximo e encerrados', () => {
    const lista = [
      c({
        id: 'a',
        me: { displayName: 'Ana', score: 1, rank: 1, medal: null, streak: 1, pendingReview: 0 },
      }),
      c({ id: 'b' }),
      c({ id: 'c', status: 'upcoming' }),
      c({
        id: 'd',
        status: 'upcoming',
        me: { displayName: 'Ana', score: 0, rank: null, medal: null, streak: 0, pendingReview: 0 },
      }),
      c({ id: 'e', status: 'ended' }),
    ];
    const s = challengeSections(lista);
    expect(s.mine.map((x) => x.id)).toEqual(['a', 'd']);
    expect(s.browse.map((x) => x.id)).toEqual(['b']);
    expect(s.upcoming.map((x) => x.id)).toEqual(['c']);
    expect(s.ended.map((x) => x.id)).toEqual(['e']);
  });

  it('confere as regras do tipo antes de mandar', () => {
    const base = { title: 'Verão', startDate: '2026-12-01', endDate: '2026-12-31' };
    expect(challengeKindProblem({ ...base, kind: 'POINTS', pointsTable: {} })).toMatch(
      /pelo menos um/,
    );
    expect(
      challengeKindProblem({ ...base, kind: 'STEPS', allowedStepSources: ['MANUAL'] }),
    ).toMatch(/à mão/);
    expect(
      challengeKindProblem({ ...base, kind: 'WATER', waterGoalMl: 3000, dailyCap: 2000 }),
    ).toMatch(/teto/);
    expect(challengeKindProblem({ ...base, kind: 'PHOTO' })).toBeNull();
    expect(maxPointsOf({ workout: 3, water: 1, steps: 1, protein: 1 })).toBe(6);
  });

  it('cada bloqueio do check-in tem a frase da prancha', () => {
    expect(CHECKIN_BLOCK_TEXT.too_short).toMatch(/20 min/);
    expect(CHECKIN_BLOCK_TEXT.already_today).toMatch(/Um check-in por dia/);
    expect(CHECKIN_BLOCK_TEXT.no_workout).toMatch(/2 h/);
  });

  it('o treino já usado no desafio tem frase e selo (#395 B2)', () => {
    expect(CHECKIN_BLOCK_TEXT.workout_used).toMatch(/já valeu um check-in/);
    expect(CHECKIN_BLOCK_TAG.workout_used).toBe('já valeu');
  });
});

describe('fila de revisão paginada (#395 M5)', () => {
  const fetch = vi.fn();
  beforeEach(() => {
    fetch.mockReset();
    fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [], open: 0, limit: 50, nextCursor: null }), {
          status: 200,
        }),
    );
    configureApiClient({
      resolveUrl: (path) => path,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
  });
  afterEach(() => resetApiClient());

  it('manda o desafio e o cursor da próxima página', async () => {
    await challengesApi.reviewQueue('g1', undefined, 'c-50');
    await challengesApi.reviewQueue('g1', 'd1', 'c-50');
    const urls = fetch.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toMatch(/\/review\?cursor=c-50$/);
    expect(urls[1]).toMatch(/\/review\?challengeId=d1&cursor=c-50$/);
  });
});

describe('passos fechados até a sync de saúde (#395)', () => {
  const base = { title: 'Passos', startDate: '2026-11-19', endDate: '2026-11-25' };

  it('não se escolhe tipo de passos nem item de passos nos pontos', () => {
    expect(STEPS_SYNC_AVAILABLE).toBe(false);
    expect(CREATABLE_CHALLENGE_KINDS).not.toContain('STEPS');
    expect(CREATABLE_CHALLENGE_KINDS).toContain('WATER');
    expect(CREATABLE_POINT_ITEMS).not.toContain('steps');
    expect(CREATABLE_POINT_ITEMS).toContain('water');
  });

  it('o formulário barra passos com o porquê, menos em quem já contava passos', () => {
    expect(STEPS_CLOSED_TEXT).toMatch(/Apple Saúde|Health Connect/);
    const passos = { ...base, kind: 'STEPS' as const };
    const misto = { ...base, kind: 'POINTS' as const, pointsTable: { workout: 2, steps: 1 } };
    expect(challengeProblem(passos, '2026-11-18')).toBe(STEPS_CLOSED_TEXT);
    expect(challengeProblem(misto, '2026-11-18')).toBe(STEPS_CLOSED_TEXT);
    expect(challengeProblem(passos, '2026-11-18', { keepsSteps: true })).toBeNull();
    expect(
      challengeProblem({ ...misto, pointsTable: { workout: 2, steps: 0 } }, '2026-11-18'),
    ).toBeNull();
  });

  it('reconhece o desafio que conta passos', () => {
    expect(challengeUsesSteps(c({ kind: 'STEPS', metric: 'STEPS' }))).toBe(true);
    expect(challengeUsesSteps(c({ kind: 'METRIC', metric: 'STEPS' }))).toBe(true);
    expect(
      challengeUsesSteps(
        c({ kind: 'POINTS', rules: { ...c({}).rules, pointsTable: { steps: 1 } } }),
      ),
    ).toBe(true);
    expect(challengeUsesSteps(c({ kind: 'WATER', metric: 'WATER_ML' }))).toBe(false);
  });
});
