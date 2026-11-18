import { describe, expect, it } from 'vitest';
import type {
  ActivityItem,
  ChallengeDetail,
  CheckinEligibility,
  ChallengeToday,
} from '@fatia/api-client';
import {
  activityText,
  challengeCta,
  challengeInputFromForm,
  challengeRules,
  checkinReducer,
  checkinStamp,
  checkinTag,
  clampStep,
  defaultChallengeForm,
  doneSummary,
  heroSubtitle,
  heroTitle,
  participantSummary,
  podiumOrder,
  privacyLine,
  reviewReasonProblem,
  todayRows,
  usesCheckin,
  whenLabel,
  workoutMeta,
  workoutTitle,
} from '../challenge-view';

function detail(over: Partial<ChallengeDetail> = {}): ChallengeDetail {
  return {
    id: 'c1',
    title: '30 dias de treino',
    description: null,
    kind: 'PHOTO',
    metric: 'ACTIVE_DAYS',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    totalDays: 30,
    status: 'running',
    endedEarly: false,
    resultPending: false,
    participants: 46,
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
    me: { displayName: 'Ana', score: 12, rank: 5, medal: null, streak: 4, pendingReview: 0 },
    leaderboard: [],
    suggestedDisplayName: 'Ana',
    today: null,
    activity: [],
    ...over,
  };
}

function today(over: Partial<ChallengeToday> = {}): ChallengeToday {
  return {
    date: '2026-11-18',
    points: 0,
    maxPoints: 1,
    items: [],
    checkedInAt: null,
    ...over,
  };
}

const pontos = (over: Partial<ChallengeDetail> = {}) =>
  detail({
    kind: 'POINTS',
    title: 'Verão em pontos',
    me: { displayName: 'Ana', score: 86, rank: 2, medal: null, streak: 4, pendingReview: 0 },
    rules: {
      ...detail().rules,
      pointsTable: { workout: 3, water: 1, steps: 1, protein: 1 },
      maxPointsPerDay: 6,
    },
    ...over,
  });

describe('resumo do participante (Cm-08 e herói do Cm-17)', () => {
  it('desafio de dias mostra "X de N dias", a barra e a sequência', () => {
    expect(participantSummary(detail())).toEqual({
      progress: '12 de 30 dias',
      pct: 0.4,
      streak: '4 seguidos',
      rank: '5º',
    });
  });

  it('pontos mostram o total, sem barra', () => {
    const s = participantSummary(pontos());
    expect(s?.progress).toBe('86 pts');
    expect(s?.pct).toBeNull();
  });

  it('quem não participa não tem resumo', () => {
    expect(participantSummary(detail({ me: null }))).toBeNull();
  });

  it('sem posição e sem sequência, nada de "0 seguidos"', () => {
    const s = participantSummary(
      detail({
        me: { displayName: 'Ana', score: 0, rank: null, medal: null, streak: 0, pendingReview: 0 },
      }),
    );
    expect(s?.rank).toBeNull();
    expect(s?.streak).toBeNull();
  });

  it('o título do herói junta progresso e posição', () => {
    expect(heroTitle(detail())).toBe('12 de 30 dias · 5º');
    expect(heroTitle(pontos())).toBe('86 pontos · 2º');
  });
});

describe('subtítulo do herói: o valor de hoje é só da própria pessoa', () => {
  it('foto: sequência e se já fez hoje', () => {
    expect(heroSubtitle(detail({ today: today() }))).toBe('4 dias seguidos · hoje ainda não');
    expect(heroSubtitle(detail({ today: today({ checkedInAt: '2026-11-18T10:00:00Z' }) }))).toBe(
      '4 dias seguidos · check-in de hoje feito',
    );
  });

  it('água em litros, passos com milhar', () => {
    const agua = detail({
      kind: 'WATER',
      today: today({
        items: [{ item: 'water', points: 1, done: false, value: 1800, goal: 2500 }],
      }),
    });
    expect(heroSubtitle(agua)).toBe('Hoje: 1,8 de 2,5 L');
    const passos = detail({
      kind: 'STEPS',
      today: today({
        items: [{ item: 'steps', points: 1, done: false, value: 6240, goal: 10000 }],
      }),
    });
    expect(heroSubtitle(passos)).toBe('Hoje: 6.240 de 10.000 passos');
  });

  it('pontos: hoje e o que falta', () => {
    const c = pontos({
      today: today({
        points: 2,
        maxPoints: 6,
        items: [
          { item: 'workout', points: 3, done: false, value: null, goal: null },
          { item: 'water', points: 1, done: true, value: 2600, goal: 2500 },
          { item: 'steps', points: 1, done: true, value: 10480, goal: 10000 },
          { item: 'protein', points: 1, done: false, value: null, goal: null },
        ],
      }),
    });
    expect(heroSubtitle(c)).toBe('Hoje: 2 de 6 · faltam treino e proteína');
  });

  it('encerrado: só a sequência', () => {
    expect(heroSubtitle(detail({ status: 'ended' }))).toBe('4 dias seguidos');
  });
});

describe('privacidade por tipo', () => {
  it('foto deixa claro que só a pessoa e a equipe veem', () => {
    expect(privacyLine(detail())).toMatch(/só você e a equipe que revisa/);
  });
  it('água e passos nunca mostram o valor', () => {
    expect(privacyLine(detail({ kind: 'WATER' }))).toMatch(/ml/);
    expect(
      privacyLine(detail({ kind: 'STEPS', rules: { ...detail().rules, stepsGoal: 8000 } })),
    ).toMatch(/8\.000/);
  });
  it('o tipo de antes não tem linha', () => {
    expect(privacyLine(detail({ kind: 'METRIC' }))).toBeNull();
  });
});

describe('botão principal por tipo', () => {
  it('foto sem check-in hoje leva à câmera', () => {
    expect(challengeCta(detail({ today: today() }))).toEqual({
      label: 'Fazer check-in de hoje',
      action: 'checkin',
      icon: 'camera',
    });
  });
  it('foto com check-in feito não tem botão', () => {
    expect(challengeCta(detail({ today: today({ checkedInAt: '2026-11-18T10:00:00Z' }) }))).toBe(
      null,
    );
  });
  it('pontos com treino na tabela mostram quanto vale', () => {
    expect(challengeCta(pontos({ today: today() }))?.label).toBe('Fazer check-in (+3 pts)');
  });
  it('água e nutrição levam ao registro; passos não têm botão', () => {
    expect(challengeCta(detail({ kind: 'WATER', today: today() }))?.action).toBe('water');
    expect(challengeCta(detail({ kind: 'NUTRITION', today: today() }))?.action).toBe('meal');
    expect(challengeCta(detail({ kind: 'STEPS', today: today() }))).toBeNull();
  });
  it('visitante, encerrado ou próximo: nenhum', () => {
    expect(challengeCta(detail({ me: null }))).toBeNull();
    expect(challengeCta(detail({ status: 'ended' }))).toBeNull();
    expect(challengeCta(detail({ status: 'upcoming' }))).toBeNull();
  });
  it('quem usa check-in', () => {
    expect(usesCheckin(detail())).toBe(true);
    expect(usesCheckin(pontos())).toBe(true);
    expect(usesCheckin(pontos({ rules: { ...pontos().rules, pointsTable: { water: 1 } } }))).toBe(
      false,
    );
    expect(usesCheckin(detail({ kind: 'WATER' }))).toBe(false);
  });
});

describe('seus pontos de hoje (Cm-17c)', () => {
  it('uma linha por item, com valor da própria pessoa', () => {
    const rows = todayRows(
      today({
        points: 2,
        maxPoints: 6,
        items: [
          { item: 'workout', points: 3, done: false, value: null, goal: null },
          { item: 'water', points: 1, done: true, value: 2600, goal: 2500 },
          { item: 'steps', points: 1, done: true, value: 10480, goal: 10000 },
        ],
      }),
    );
    expect(rows.map((r) => [r.item, r.detail, r.points, r.done])).toEqual([
      ['workout', 'faça o check-in depois do treino', '+3', false],
      ['water', '2,6 de 2,5 L', '+1', true],
      ['steps', '10.480 de 10.000', '+1', true],
    ]);
    expect(rows[0]!.action).toBe('checkin');
    expect(rows[1]!.action).toBe('water');
  });
});

describe('regras com os números do desafio', () => {
  it('foto usa os minutos e a janela', () => {
    const r = challengeRules(detail());
    expect(r[0]!.title).toBe('Foto tirada na hora, pelo app');
    expect(r.some((x) => x.text.includes('20 min'))).toBe(true);
    expect(r.some((x) => x.title === 'Até 2 h depois do treino')).toBe(true);
  });
  it('pontos listam a tabela e o máximo', () => {
    const r = challengeRules(pontos());
    expect(r.map((x) => x.title)).toContain('Treino com check-in: 3 pts');
    expect(r.map((x) => x.title)).toContain('Máximo de 6 pts por dia');
  });
  it('água fala da meta e do teto', () => {
    const r = challengeRules(
      detail({ kind: 'WATER', rules: { ...detail().rules, waterGoalMl: 2500, dailyCap: 4000 } }),
    );
    expect(r[0]!.text).toMatch(/2,5 L/);
    expect(r.some((x) => x.title === 'Até 4 L por dia')).toBe(true);
  });
});

describe('atividade', () => {
  const item = (over: Partial<ActivityItem>): ActivityItem => ({
    id: 'a',
    type: 'day',
    displayName: 'Gabi',
    isMe: false,
    date: '2026-11-18',
    at: null,
    points: 1,
    parts: [],
    status: 'valid',
    reason: null,
    photoUrl: null,
    canFlag: false,
    flaggedByMe: false,
    ...over,
  });

  it('dia de água e de passos', () => {
    expect(activityText(item({ parts: ['water'] }), detail({ kind: 'WATER' })).title).toBe(
      'Bateu a meta de água',
    );
    expect(
      activityText(
        item({ parts: ['steps'] }),
        detail({ kind: 'STEPS', rules: { ...detail().rules, stepsGoal: 10000 } }),
      ).title,
    ).toBe('Chegou a 10.000 passos');
  });

  it('pontos: dia completo e parcial', () => {
    expect(
      activityText(item({ points: 6, parts: ['workout', 'water', 'steps', 'protein'] }), pontos()),
    ).toEqual({ title: 'Dia completo: 6 pts', detail: 'treino, água, passos e proteína' });
    expect(activityText(item({ points: 2, parts: ['water', 'steps'] }), pontos()).title).toBe(
      '2 pts no dia',
    );
  });

  it('check-in', () => {
    expect(activityText(item({ type: 'checkin', parts: ['workout'] }), detail()).title).toBe(
      'Check-in do treino',
    );
  });

  it('quando', () => {
    const at = new Date(2026, 10, 18, 18, 54).toISOString();
    expect(whenLabel('2026-11-18', at, '2026-11-18')).toBe('hoje 18:54');
    expect(whenLabel('2026-11-17', null, '2026-11-18')).toBe('ontem');
    expect(whenLabel('2026-11-03', null, '2026-11-18')).toBe('3 nov');
  });
});

describe('pódio (Cm-11)', () => {
  it('prata, ouro e bronze nessa ordem; menos de 3, só quem tem', () => {
    const e = (n: string, rank: number) => ({
      displayName: n,
      score: 10 - rank,
      rank,
      isMe: false,
      medal: null,
      streak: 0,
    });
    expect(
      podiumOrder([e('A', 1), e('B', 2), e('C', 3), e('D', 4)]).map((x) => x.displayName),
    ).toEqual(['B', 'A', 'C']);
    expect(podiumOrder([e('A', 1)]).map((x) => x.displayName)).toEqual(['A']);
  });
});

describe('check-in (Cm-18)', () => {
  const w = {
    id: 'w1',
    name: 'Push',
    startedAt: new Date(2026, 10, 18, 18, 2).toISOString(),
    endedAt: new Date(2026, 10, 18, 18, 54).toISOString(),
    minutes: 52,
    sets: 19,
    deadline: new Date(2026, 10, 18, 20, 54).toISOString(),
  };
  const elig = (over: Partial<CheckinEligibility>): CheckinEligibility => ({
    eligible: true,
    reason: null,
    workout: w,
    checkedInAt: null,
    rules: { minWorkoutMinutes: 20, windowHours: 2 },
    ...over,
  });

  it('treino que conta', () => {
    expect(workoutTitle(elig({}))).toBe('Push · terminou 18:54');
    expect(workoutMeta(elig({}))).toBe('52 min · 19 séries · registrado no app');
    expect(checkinTag(elig({}))).toEqual({ label: 'conta', tone: 'ok' });
  });

  it('sem treino, curto e já feito explicam o motivo', () => {
    const sem = elig({ eligible: false, reason: 'no_workout', workout: null });
    expect(workoutTitle(sem)).toBe('Nenhum treino nas últimas 2 h');
    expect(workoutMeta(sem)).toBe('Registre o treino no app para liberar o check-in');
    expect(checkinTag(sem)).toEqual({ label: 'sem treino', tone: 'bad' });
    expect(checkinTag(elig({ eligible: false, reason: 'too_short' }))).toEqual({
      label: 'curto demais',
      tone: 'warn',
    });
    const ja = elig({
      eligible: false,
      reason: 'already_today',
      checkedInAt: new Date(2026, 10, 18, 7, 12).toISOString(),
    });
    expect(workoutMeta(ja)).toBe('52 min · você já fez check-in hoje às 07:12');
  });

  it('o carimbo da foto', () => {
    expect(checkinStamp(new Date(2026, 10, 18, 18, 57), w)).toBe('HOJE 18:57 · PUSH 52 MIN');
  });

  it('feito: dias e sequência', () => {
    expect(
      doneSummary(
        detail({
          me: { displayName: 'Ana', score: 13, rank: 5, medal: null, streak: 5, pendingReview: 0 },
        }),
      ),
    ).toBe('13 de 30 dias · 5 dias seguidos');
    expect(doneSummary(pontos())).toBe('86 pts · 4 dias seguidos');
  });

  it('os passos: foto → revisão → envio → feito; erro volta à revisão', () => {
    let s = checkinReducer({ step: 'camera' }, { type: 'shot', photo: { uri: 'f.jpg' } });
    expect(s).toEqual({ step: 'review', photo: { uri: 'f.jpg' }, error: null });
    expect(checkinReducer(s, { type: 'retake' })).toEqual({ step: 'camera' });
    s = checkinReducer(s, { type: 'send' });
    expect(s.step).toBe('sending');
    // Durante o envio não dá para tirar outra nem enviar de novo.
    expect(checkinReducer(s, { type: 'retake' })).toBe(s);
    expect(checkinReducer(s, { type: 'send' })).toBe(s);
    const falhou = checkinReducer(s, { type: 'failed', message: 'Esta foto já foi usada.' });
    expect(falhou).toEqual({
      step: 'review',
      photo: { uri: 'f.jpg' },
      error: 'Esta foto já foi usada.',
    });
    const feito = checkinReducer(s, { type: 'succeeded', detail: detail() });
    expect(feito.step).toBe('done');
    // Foto na câmera só na etapa da câmera.
    expect(checkinReducer(feito, { type: 'shot', photo: { uri: 'x' } })).toBe(feito);
  });
});

describe('formulário da equipe (Pn-13)', () => {
  const hoje = '2026-11-18';

  it('foto manda só tipo, título e datas', () => {
    const f = { ...defaultChallengeForm(), title: ' 30 dias de treino ', kind: 'PHOTO' as const };
    expect(challengeInputFromForm(f, hoje)).toEqual({
      title: '30 dias de treino',
      description: null,
      kind: 'PHOTO',
      startDate: '2026-11-19',
      endDate: '2026-11-25',
    });
  });

  it('pontos mandam a tabela sem zeros e o máximo', () => {
    const f = { ...defaultChallengeForm(), title: 'Verão', kind: 'POINTS' as const };
    expect(challengeInputFromForm(f, hoje)).toMatchObject({
      kind: 'POINTS',
      pointsTable: { workout: 3, water: 1, steps: 1, protein: 1 },
      maxPointsPerDay: 6,
    });
  });

  it('o máximo por dia nunca passa da soma da tabela', () => {
    const f = {
      ...defaultChallengeForm(),
      title: 'Verão',
      kind: 'POINTS' as const,
      points: { workout: 1, water: 0, steps: 0, protein: 0, kcal: 0 },
      maxPointsPerDay: 6,
    };
    expect(challengeInputFromForm(f, hoje).maxPointsPerDay).toBe(1);
  });

  it('água manda meta e teto; passos mandam meta e fontes sem a manual', () => {
    const agua = { ...defaultChallengeForm(), title: 'Água', kind: 'WATER' as const };
    expect(challengeInputFromForm(agua, hoje)).toMatchObject({
      kind: 'WATER',
      waterGoalMl: 2500,
      dailyCap: 4000,
    });
    const passos = {
      ...defaultChallengeForm(),
      title: 'Passos',
      kind: 'STEPS' as const,
      stepSources: ['GARMIN', 'MANUAL'] as const,
    };
    const input = challengeInputFromForm({ ...passos, stepSources: [...passos.stepSources] }, hoje);
    expect(input).toMatchObject({
      kind: 'STEPS',
      stepsGoal: 10000,
      allowedStepSources: ['GARMIN'],
    });
    expect(input.waterGoalMl).toBeUndefined();
  });

  it('nutrição e o tipo de antes mandam a métrica', () => {
    expect(
      challengeInputFromForm(
        {
          ...defaultChallengeForm(),
          title: 'Prot',
          kind: 'NUTRITION',
          nutritionMetric: 'KCAL_IN_RANGE_DAYS',
        },
        hoje,
      ),
    ).toMatchObject({ kind: 'NUTRITION', metric: 'KCAL_IN_RANGE_DAYS' });
    expect(
      challengeInputFromForm(
        { ...defaultChallengeForm(), title: 'Seq', kind: 'METRIC', metric: 'STREAK_DAYS' },
        hoje,
      ),
    ).toMatchObject({ kind: 'METRIC', metric: 'STREAK_DAYS' });
  });

  it('degraus com limite', () => {
    expect(clampStep(5, 1, 0, 5)).toBe(5);
    expect(clampStep(0, -1, 0, 5)).toBe(0);
    expect(clampStep(2500, 250, 500, 6000)).toBe(2750);
  });

  it('motivo da revisão: 3 a 280 caracteres', () => {
    expect(reviewReasonProblem('  ')).toBe('Escreva o motivo: a pessoa recebe esse texto.');
    expect(reviewReasonProblem('ok')).toBe('Escreva o motivo: a pessoa recebe esse texto.');
    expect(reviewReasonProblem('Foto de outro dia')).toBeNull();
    expect(reviewReasonProblem('x'.repeat(281))).toBe('O motivo tem até 280 caracteres.');
  });
});
