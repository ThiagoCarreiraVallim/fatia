import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import {
  activeMembersLine,
  challengeFinishedLabel,
  challengeKindShort,
  challengeLiftLine,
  challengeReviewedLabel,
  decimalBR,
  deltaPctLabel,
  deltaPtsLabel,
  originKindLabel,
  originRowName,
  plansLine,
  reportApi,
  reportMonthOption,
  reportTitle,
  reviewsLine,
  sessionsLine,
  weeksSummary,
  type MonthReport,
} from '../month-report';

const base = (over: Partial<MonthReport> = {}): MonthReport => ({
  month: '2026-10',
  months: ['2026-10', '2026-09'],
  groupName: 'Academia Demo',
  optIn: 97,
  riskDays: 7,
  weeklySessionsGoal: 300,
  activeMembers: { value: 76, percent: 78, deltaPts: 4, delta: 12 },
  sessions: { total: 1284, perActive: 16.9, deltaPct: 9 },
  trainingDays: { perActive: 10.3, deltaPct: -2 },
  returned: 14,
  atRisk: 9,
  plans: { sent: 36, acceptedPercent: 81, declined: 5, noResponse: 0 },
  reviews: { reviewed: 120, withinDayPercent: 94, medianHours: 3 },
  weeks: [],
  weeksAverage: 321,
  weeksOnGoal: { hit: 3, of: 4 },
  activeByDay: [],
  challenges: [],
  challengeLift: 2.1,
  ...over,
});

describe('relatório do mês (#400, Pn-03)', () => {
  it('título e meses: o ano só aparece fora do ano corrente', () => {
    expect(reportTitle('2026-10', '2026-11')).toBe('Relatório de outubro');
    expect(reportTitle('2025-12', '2026-11')).toBe('Relatório de dezembro de 2025');
    // Só mês fechado: nada de "(até ontem)".
    expect(reportMonthOption('2026-10', '2026-10')).toBe('outubro');
    expect(reportMonthOption('2025-12', '2026-10')).toBe('dezembro de 2025');
  });

  it('variação: pontos e %, com sinal; sem comparação, nada', () => {
    expect(deltaPtsLabel(4)).toBe('+4 pts');
    expect(deltaPtsLabel(-3)).toBe('−3 pts');
    expect(deltaPtsLabel(0)).toBe('0 pts');
    expect(deltaPctLabel(9)).toBe('+9%');
    expect(deltaPctLabel(-12)).toBe('−12%');
    expect(deltaPctLabel(null)).toBeNull();
    expect(decimalBR(10.3)).toBe('10,3');
    expect(decimalBR(4)).toBe('4');
  });

  it('as linhas dos cartões, com a base de quem aceitou entrar nas estatísticas', () => {
    expect(activeMembersLine(base())).toBe('76 de 97 que aceitaram entrar nas estatísticas');
    expect(activeMembersLine(base({ optIn: null }))).toBe(
      'menos de 5 aceitaram entrar nas estatísticas',
    );
    expect(sessionsLine(base())).toBe('16,9 por membro ativo');
    expect(plansLine(base().plans)).toBe('81% aceitos · 5 recusados · 0 sem resposta');
    expect(plansLine({ sent: 12, acceptedPercent: null, declined: null, noResponse: null })).toBe(
      'aceites: amostra pequena demais para mostrar',
    );
    expect(plansLine({ sent: 12, acceptedPercent: 60, declined: null, noResponse: null })).toBe(
      '60% aceitos',
    );
    expect(reviewsLine(base().reviews)).toBe('em até 1 dia · mediana de 3 h');
    expect(reviewsLine({ reviewed: 0, withinDayPercent: null, medianHours: null })).toBe(
      'nenhum treino revisado no mês',
    );
    expect(weeksSummary(base())).toBe('3 de 4 semanas na meta da equipe');
    expect(weeksSummary(base({ weeklySessionsGoal: null, weeksOnGoal: null }))).toBeNull();
  });

  it('desafios: tipo curto, terminaram, revisados e a comparação', () => {
    expect(challengeKindShort('PHOTO')).toBe('check-in com foto');
    expect(challengeKindShort('WATER')).toBe('água');
    const linha = {
      id: 'c1',
      title: 'Maratona',
      kind: 'METRIC' as const,
      participants: 31,
      finished: 'running' as const,
      reviewed: 23,
      voided: 5,
    };
    expect(challengeFinishedLabel(linha)).toBe('em andamento');
    expect(challengeFinishedLabel({ ...linha, finished: 12 })).toBe('12');
    expect(challengeFinishedLabel({ ...linha, finished: null })).toBe('menos de 5');
    expect(challengeReviewedLabel(linha)).toBe('23 · 5 anulados');
    expect(challengeReviewedLabel({ ...linha, voided: null })).toBe('23');
    // Nada anulado não vira "0 anulados" ao lado do número.
    expect(challengeReviewedLabel({ ...linha, voided: 0 })).toBe('23');
    expect(challengeReviewedLabel({ ...linha, reviewed: 0, voided: 0 })).toBe('0');
    expect(challengeReviewedLabel({ ...linha, reviewed: null, voided: null })).toBe('menos de 5');
    expect(challengeLiftLine(2.1)).toBe(
      'Quem participa de algum desafio registra 2,1× mais dias no mês do que quem não participa.',
    );
    expect(challengeLiftLine(null)).toBeNull();
  });

  it('origens: nome da linha e tipo', () => {
    expect(
      originRowName({
        key: 'k',
        origin: 'QR',
        label: 'recepção',
        kind: 'qr',
        joined: 19,
        activated: 15,
        percent: 79,
      }),
    ).toBe('QR · recepção');
    expect(
      originRowName({
        key: 'k',
        origin: 'INSTAGRAM',
        label: null,
        kind: 'link',
        joined: 14,
        activated: 8,
        percent: 57,
      }),
    ).toBe('Instagram');
    expect(
      originRowName({
        key: 'k',
        origin: null,
        label: 'Feira',
        kind: 'link',
        joined: 5,
        activated: null,
        percent: null,
      }),
    ).toBe('Feira');
    expect(
      originRowName({
        key: 'other',
        origin: null,
        label: null,
        kind: 'other',
        joined: 7,
        activated: null,
        percent: null,
      }),
    ).toBe('Outras origens');
    expect(originKindLabel('other')).toBe('vários');
    expect(originKindLabel('list')).toBe('lista');
    expect(originKindLabel('qr')).toBe('QR');
  });
});

describe('chamadas do relatório', () => {
  const fetch = vi.fn();
  beforeEach(() => {
    fetch.mockReset();
    fetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    configureApiClient({
      resolveUrl: (path) => path,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
  });
  afterEach(() => resetApiClient());

  const call = (i: number) => ({
    url: String(fetch.mock.calls[i]![0]),
    init: fetch.mock.calls[i]![1] as RequestInit,
  });

  it('relatório, origens, configurações e destinatários pela comunidade da URL', async () => {
    await reportApi.report('g', '2026-10');
    await reportApi.report('g');
    await reportApi.origins('g', 7);
    await reportApi.settings('g');
    await reportApi.updateSettings('g', { weeklySessionsGoal: 300 });
    await reportApi.setRecipient('g', 'm1', true);
    expect(call(0).url).toBe('/api/groups/g/report?month=2026-10');
    expect(call(1).url).toBe('/api/groups/g/report');
    expect(call(2).url).toBe('/api/groups/g/invites/origins?days=7');
    expect(call(3).url).toBe('/api/groups/g/report/settings');
    expect(call(4)).toMatchObject({
      url: '/api/groups/g/report/settings',
      init: { method: 'PATCH' },
    });
    expect(JSON.parse(String(call(4).init.body))).toEqual({ weeklySessionsGoal: 300 });
    expect(call(5)).toMatchObject({
      url: '/api/groups/g/report/recipients/m1',
      init: { method: 'PUT' },
    });
    expect(JSON.parse(String(call(5).init.body))).toEqual({ enabled: true });
  });
});
