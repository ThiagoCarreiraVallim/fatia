import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import { panelBreadcrumb, panelNav } from '../panel-shell';
import { panelHref } from '../community-panel';
import {
  checkinLine,
  filterReview,
  reactionEmoji,
  reviewAction,
  reviewApi,
  reviewFiltersFor,
  reviewKindLabel,
  reviewLine,
  reviewWhatsappText,
  riskKindLabel,
  riskLine,
  riskWhatsappText,
  SESSION_REACTIONS,
  sessionFeedbackByline,
  sharesLine,
  splitReview,
  whatsappTextHref,
  type AtRiskRow,
  type PanelReviewItem,
} from '../review-queue';

const item = (over: Partial<PanelReviewItem> = {}): PanelReviewItem => ({
  kind: 'WORKOUT',
  refId: 's1',
  membershipId: 'm1',
  name: 'Ana Dias',
  at: '2026-11-18T21:54:00.000Z',
  title: 'Inferior v2',
  durationMinutes: 52,
  sets: 19,
  answer: null,
  shares: ['WORKOUT', 'NUTRITION', 'GOALS'],
  whatsapp: '5565998123456',
  seenAt: null,
  myFeedback: false,
  ...over,
});

const risco = (over: Partial<AtRiskRow> = {}): AtRiskRow => ({
  membershipId: 'm2',
  name: 'Júlia Reis',
  signal: 'inactive',
  level: 'attention',
  days: 9,
  lastAt: '2026-11-10T12:00:00.000Z',
  shares: ['WORKOUT', 'HABITS'],
  whatsapp: '5565998123456',
  ...over,
});

describe('fila "Para revisar" (#399, Pn-02)', () => {
  it('o tipo e o que aconteceu, por item', () => {
    expect(reviewKindLabel(item())).toBe('treino');
    expect(reviewLine(item())).toBe('Inferior v2 · 52 min · 19 séries');
    expect(reviewLine(item({ title: null, sets: 1, durationMinutes: null }))).toBe(
      'Treino livre · 1 série',
    );
    const meta = item({ kind: 'GOAL', title: 'Treinar 4× por semana', sets: null });
    expect(reviewKindLabel(meta)).toBe('meta');
    expect(reviewLine(meta)).toBe('Concluiu a meta “Treinar 4× por semana”');
    const recusa = item({ kind: 'PLAN_RESPONSE', title: 'Cutting 1.800', answer: 'DECLINED' });
    expect(reviewKindLabel(recusa)).toBe('plano');
    expect(reviewLine(recusa)).toBe('Recusou “Cutting 1.800”');
    expect(reviewLine({ ...recusa, answer: 'ACCEPTED' })).toBe('Aceitou “Cutting 1.800”');
  });

  it('"Compartilha" em minúsculas, na ordem das categorias', () => {
    expect(sharesLine(['GOALS', 'WORKOUT', 'NUTRITION'])).toBe('treino, alimentação, metas');
    expect(sharesLine(['HABITS', 'BODY', 'MEAL_PHOTOS'])).toBe('corpo, hábitos, fotos');
    expect(sharesLine([])).toBe('nada');
  });

  it('abas: o que falta revisar e o que já foi visto', () => {
    const lista = [item(), item({ refId: 's2', seenAt: '2026-11-18T22:00:00.000Z' })];
    const { open, seen } = splitReview(lista);
    expect(open.map((i) => i.refId)).toEqual(['s1']);
    expect(seen.map((i) => i.refId)).toEqual(['s2']);
  });

  it('filtros: só os tipos que existem hoje, e "Treinos" junta treino e meta', () => {
    const lista = [
      item(),
      item({ refId: 'g1', kind: 'GOAL' }),
      item({ refId: 'p1', kind: 'PLAN_RESPONSE', answer: 'ACCEPTED' }),
    ];
    expect(reviewFiltersFor().map((f) => f.label)).toEqual([
      'Tudo',
      'Treinos',
      'Respostas e planos',
    ]);
    expect(filterReview(lista, 'all')).toHaveLength(3);
    expect(filterReview(lista, 'workouts').map((i) => i.refId)).toEqual(['s1', 'g1']);
    expect(filterReview(lista, 'plans').map((i) => i.refId)).toEqual(['p1']);
  });

  it('abrir a linha: o treino abre a sessão; meta e plano, a ficha', () => {
    expect(reviewAction('g', item())).toEqual({
      label: 'Ver sessão',
      href: '/org/g/review/sessions/s1',
    });
    expect(reviewAction('g', item({ kind: 'GOAL' }))).toEqual({
      label: 'Abrir ficha',
      href: '/org/g/members/m1',
    });
  });

  it('WhatsApp com texto pronto, só com número válido', () => {
    expect(whatsappTextHref('5565998123456', 'Oi, Ana!')).toBe(
      'https://wa.me/5565998123456?text=Oi%2C%20Ana!',
    );
    expect(whatsappTextHref('(65) 99812-3456', 'x')).toBe('https://wa.me/5565998123456?text=x');
    expect(whatsappTextHref('123', 'x')).toBeNull();
    expect(reviewWhatsappText(item())).toBe('Oi, Ana! Vi seu treino no Fatia. ');
    expect(reviewWhatsappText(item({ kind: 'GOAL', title: 'Correr 5 km' }))).toBe(
      'Oi, Ana! Parabéns por concluir a meta “Correr 5 km”! ',
    );
    expect(
      reviewWhatsappText(item({ kind: 'PLAN_RESPONSE', title: 'Cutting', answer: 'DECLINED' })),
    ).toBe('Oi, Ana! Vi que você recusou “Cutting”. Quer conversar sobre o plano? ');
  });
});

describe('"Em risco" (#399)', () => {
  it('o tipo e o sinal, sem número além dos dias da própria pessoa', () => {
    expect(riskKindLabel(risco())).toBe('parado');
    expect(riskKindLabel(risco({ level: 'gone', days: 20 }))).toBe('sumiu');
    expect(riskKindLabel(risco({ signal: 'no_workout' }))).toBe('sem treino');
    expect(riskKindLabel(risco({ signal: 'never' }))).toBe('não começou');
    expect(riskLine(risco())).toBe('Último registro há 9 dias');
    expect(riskLine(risco({ signal: 'no_workout', days: 20 }))).toBe(
      'Sem treinar há 20 dias · segue registrando outras coisas',
    );
    expect(riskLine(risco({ signal: 'never', days: 10, lastAt: null }))).toBe(
      'Nada registrado desde que entrou, há 10 dias',
    );
    expect(riskWhatsappText(risco())).toBe(
      'Oi, Júlia! Tudo bem? Senti sua falta por aqui. Posso te ajudar a voltar ao ritmo? ',
    );
  });
});

describe('sessão feita (#399, Pn-35)', () => {
  it('as reações da prancha e a linha "Como foi"', () => {
    expect(SESSION_REACTIONS.map((r) => r.emoji)).toEqual(['💪', '🔥', '👏', '❤️']);
    expect(reactionEmoji('FIRE')).toBe('🔥');
    expect(checkinLine({ skipped: false, fatigue: 3, pain: false, painLocation: null })).toBe(
      'cansaço 3 de 5 · sem dor',
    );
    expect(checkinLine({ skipped: false, fatigue: null, pain: true, painLocation: 'joelho' })).toBe(
      'dor no joelho',
    );
    expect(checkinLine({ skipped: true, fatigue: null, pain: null, painLocation: null })).toBe(
      'pulou as perguntas',
    );
    expect(checkinLine(null)).toBeNull();
  });
});

describe('o comentário no treino do aluno (#399)', () => {
  it('quem mandou e de qual comunidade; sem nome, "Equipe"', () => {
    expect(sessionFeedbackByline({ authorName: 'Helena Prado', groupName: 'Academia Demo' })).toBe(
      'Helena Prado · Academia Demo',
    );
    expect(sessionFeedbackByline({ authorName: null, groupName: 'Academia Demo' })).toBe(
      'Equipe · Academia Demo',
    );
  });
});

describe('menu do painel com "Para revisar" (#399)', () => {
  it('fica em Acompanhar, logo depois da Visão geral, para dono e profissional', () => {
    for (const role of ['OWNER', 'PROFESSIONAL'] as const) {
      const acompanhar = panelNav(role).find((g) => g.key === 'track')!;
      expect(acompanhar.items.map((i) => i.label)).toEqual(['Visão geral', 'Para revisar']);
    }
    expect(panelHref('g', 'review')).toBe('/org/g/review');
    expect(panelBreadcrumb('/org/g/review/sessions/s1')).toEqual({
      group: 'Acompanhar',
      label: 'Para revisar',
    });
  });
});

describe('chamadas', () => {
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

  it('fila, visto, sessão, comentário e em risco pela comunidade da URL', async () => {
    await reviewApi.queue('g');
    await reviewApi.markSeen('g', 'PLAN_RESPONSE', 'v1');
    await reviewApi.session('g', 's1');
    await reviewApi.sendFeedback('g', 's1', { reaction: 'CLAP', body: 'Boa!' });
    await reviewApi.atRisk('g');
    await reviewApi.setRiskDays('g', 14);
    await reviewApi.setDigest('g', true);
    expect(call(0).url).toBe('/api/groups/g/review');
    expect(call(1)).toMatchObject({
      url: '/api/groups/g/review/plan/v1/seen',
      init: { method: 'POST' },
    });
    expect(call(2).url).toBe('/api/groups/g/review/sessions/s1');
    expect(call(3).url).toBe('/api/groups/g/review/sessions/s1/feedback');
    expect(JSON.parse(String(call(3).init.body))).toEqual({ reaction: 'CLAP', body: 'Boa!' });
    expect(call(4).url).toBe('/api/groups/g/at-risk');
    expect(call(5)).toMatchObject({
      url: '/api/groups/g/at-risk/settings',
      init: { method: 'PATCH' },
    });
    expect(JSON.parse(String(call(5).init.body))).toEqual({ riskDays: 14 });
    expect(call(6)).toMatchObject({ url: '/api/groups/g/at-risk/digest', init: { method: 'PUT' } });
  });
});
