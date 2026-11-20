import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import type { SeatInvoice, SeatProgram, SeatsOverview } from '../community-admin';
import { seatProgramsApi } from '../community-admin';
import { panelHref, panelSections } from '../community-panel';
import { panelBreadcrumb, panelNav } from '../panel-shell';
import {
  dayRangeLabel,
  overdueSeatBanner,
  programPreviewCents,
  seatAdjustPreview,
  seatInvoiceRow,
  seatProgramRow,
  seatStatCards,
} from '../seats-panel';
import {
  filterPlanPrograms,
  planProgramDates,
  planProgramProgressLine,
  planProgramsApi,
  planProgramStatusLabel,
  planProgramTabs,
  type PlanProgramItem,
} from '../plan-programs';
import {
  duplicateOfferLabel,
  filterOffers,
  offerMeta,
  offerPriceLabel,
  offerReceives,
  offerRevenueSub,
  offersApi,
  offerStatusLabel,
  saleUrlLabel,
  type OfferView,
} from '../community-offers';
import { filterReview, reviewKindLabel, reviewLine, type PanelReviewItem } from '../review-queue';

const AGORA = new Date('2026-11-14T15:00:00Z');

const overview = (extra: Partial<SeatsOverview> = {}): SeatsOverview => ({
  groupId: 'g1',
  unitPriceCents: 1490,
  webCheckout: true,
  pool: {
    seats: 120,
    nextPeriodSeats: null,
    status: 'ACTIVE',
    manual: false,
    currentPeriodEnd: '2026-12-10T03:00:00.000Z',
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    paymentUrl: null,
    monthlyCents: 178_800,
    nextMonthlyCents: 178_800,
    graceDaysLeft: null,
  },
  nextInvoice: {
    seats: 120,
    unitPriceCents: 1490,
    amountCents: 178_800,
    dueAt: '2026-12-10T03:00:00.000Z',
  },
  overdueInvoice: null,
  programs: [],
  assigned: 118,
  assignments: [],
  pendingCharges: [],
  ...extra,
});

const fatura = (extra: Partial<SeatInvoice> = {}): SeatInvoice => ({
  id: 'i1',
  kind: 'SUBSCRIPTION',
  amountCents: 178_800,
  dueDate: '2026-12-10',
  status: 'PENDING',
  invoiceUrl: 'https://asaas/i1',
  seats: 120,
  proRataDays: null,
  paidAt: null,
  createdAt: '2026-11-10T12:00:00Z',
  ...extra,
});

describe('Assentos (Pn-07, Pn-07v, #403)', () => {
  it('os quatro cartões: em uso, preço, próxima fatura e pagamento', () => {
    const c = seatStatCards(overview());
    expect(c.inUse).toEqual({ value: '118/120', sub: '2 livres' });
    expect(c.price).toEqual({ value: 'R$ 14,90', sub: 'por mês' });
    expect(c.next).toEqual({ value: 'R$ 1.788,00', sub: '120 × R$ 14,90 · vence 10 dez' });
    expect(c.payment).toEqual({ value: 'Em dia', sub: 'pelo Asaas', tone: 'ok' });
  });

  it('vencida: cartão e faixa com os dias da carência, contados do graceEndsAt', () => {
    const o = overview({
      pool: { ...overview().pool!, status: 'PAST_DUE', graceDaysLeft: 3 },
      overdueInvoice: fatura({
        status: 'OVERDUE',
        dueDate: '2026-11-10',
        invoiceUrl: 'https://asaas/nov',
      }),
    });
    expect(seatStatCards(o).payment).toEqual({
      value: 'Vencida',
      sub: 'faltam 3 dias da carência',
      tone: 'warn',
    });
    expect(overdueSeatBanner(o)).toEqual({
      title: 'Fatura de novembro vencida · faltam 3 dias',
      text: 'Depois disso o PRO dos membros pausa. O registro deles continua; só a IA para.',
      payUrl: 'https://asaas/nov',
    });
    const ultimo = overview({
      pool: { ...overview().pool!, status: 'PAST_DUE', graceDaysLeft: 1 },
      overdueInvoice: fatura({ status: 'OVERDUE', dueDate: '2026-11-10' }),
    });
    expect(overdueSeatBanner(ultimo)?.title).toBe('Fatura de novembro vencida · falta 1 dia');
    expect(overdueSeatBanner(overview())).toBeNull();
  });

  it('carência acabou: a IA dos membros está pausada, nada some', () => {
    const o = overview({
      pool: { ...overview().pool!, status: 'PAST_DUE', graceDaysLeft: 0 },
      overdueInvoice: fatura({ status: 'OVERDUE', dueDate: '2026-11-10' }),
    });
    expect(overdueSeatBanner(o)).toMatchObject({
      title: 'Fatura de novembro vencida · a IA dos membros está pausada',
      text: 'O registro deles continua. Pague para a IA voltar.',
    });
  });

  it('linhas da fatura: mês, ajuste proporcional, programa e status da prancha', () => {
    expect(seatInvoiceRow(fatura())).toEqual({
      title: 'Dezembro',
      sub: '120 assentos',
      amount: 'R$ 1.788,00',
      amountSub: null,
      due: '10 dez',
      status: { label: 'aberta', tone: 'neutral' },
      muted: false,
    });
    expect(
      seatInvoiceRow(
        fatura({
          kind: 'ADJUSTMENT',
          amountCents: 7450,
          seats: 10,
          proRataDays: 15,
          dueDate: '2026-11-15',
        }),
      ),
    ).toMatchObject({
      title: 'Ajuste +10 assentos',
      sub: null,
      amountSub: 'proporcional a 15 dias',
      status: { label: 'pendente', tone: 'info' },
    });
    expect(seatInvoiceRow(fatura({ kind: 'PROGRAM', seats: 18 })).title).toBe('Programa');
    expect(seatInvoiceRow(fatura({ status: 'PAID' })).status).toEqual({
      label: 'paga',
      tone: 'ok',
    });
    expect(seatInvoiceRow(fatura({ status: 'OVERDUE' })).status).toEqual({
      label: 'vencida',
      tone: 'warn',
    });
    expect(seatInvoiceRow(fatura({ status: 'VOID' }))).toMatchObject({
      status: { label: 'anulada', tone: 'muted' },
      muted: true,
    });
  });

  it('programas: turma e desafio, período e status', () => {
    const turma: SeatProgram = {
      id: 'p1',
      name: 'Verão 21',
      note: 'turma das 6h · Helena',
      kind: 'CLASS',
      challengeId: null,
      challengeTitle: null,
      seats: 18,
      assigned: 18,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      amountCents: 26_820,
      chargeStatus: 'ACTIVE',
      status: 'ACTIVE',
    };
    expect(seatProgramRow(turma)).toEqual({
      name: 'Verão 21',
      sub: 'turma das 6h · Helena',
      seats: '18',
      period: '1 a 30 nov',
      amount: 'R$ 268,20',
      status: { label: 'em andamento', tone: 'ok' },
    });
    const desafio: SeatProgram = {
      ...turma,
      id: 'p2',
      name: 'Desafio de dezembro',
      note: null,
      kind: 'CHALLENGE',
      challengeId: 'c1',
      challengeTitle: '10 mil passos',
      seats: 30,
      assigned: 4,
      startDate: '2026-12-01',
      endDate: '2026-12-31',
      amountCents: 44_700,
      chargeStatus: 'PENDING',
      status: 'SCHEDULED',
    };
    expect(seatProgramRow(desafio)).toMatchObject({
      sub: 'quem entrar no 10 mil passos',
      seats: 'até 30',
      period: '1 a 31 dez',
      status: { label: 'aguardando pagamento', tone: 'info' },
    });
    expect(seatProgramRow({ ...desafio, chargeStatus: 'ACTIVE' }).status).toEqual({
      label: 'agendado',
      tone: 'info',
    });
    expect(seatProgramRow({ ...turma, status: 'ENDED' }).status).toEqual({
      label: 'terminou',
      tone: 'muted',
    });
  });

  it('períodos: mesmo mês e meses diferentes', () => {
    expect(dayRangeLabel('2026-11-01', '2026-11-30')).toBe('1 a 30 nov');
    expect(dayRangeLabel('2026-10-27', '2026-11-23')).toBe('27 out a 23 nov');
  });

  it('ajustar assentos: mínimo é o que está em uso; aumento mostra o proporcional', () => {
    const o = overview();
    expect(seatAdjustPreview(o, 118, AGORA)).toMatchObject({ min: 118, ok: true });
    expect(seatAdjustPreview(o, 117, AGORA)).toMatchObject({ ok: false });
    const mais = seatAdjustPreview(o, 130, AGORA);
    expect(mais.monthly).toBe('R$ 1.937,00');
    // 10 assentos × R$ 14,90 × 26 dias de 30 (10/nov a 10/dez).
    expect(mais.proRata).toBe('R$ 129,13');
    expect(seatAdjustPreview(o, 120, AGORA).proRata).toBeNull();
  });

  it('preço do programa: assentos × preço por mês começado de 31 dias', () => {
    expect(programPreviewCents(18, 1490, '2026-11-01', '2026-11-30')).toBe(26_820);
    expect(programPreviewCents(10, 1490, '2026-11-01', '2026-12-15')).toBe(29_800);
  });

  it('API dos programas de assentos', async () => {
    const fetchFn = vi.fn((_u: string, _i?: RequestInit) =>
      Promise.resolve(new Response('[]', { status: 200 })),
    );
    configureApiClient({ resolveUrl: (p) => p, fetch: fetchFn as unknown as typeof fetch });
    await seatProgramsApi.list('g1');
    await seatProgramsApi.create('g1', {
      name: 'Verão 21',
      kind: 'CLASS',
      seats: 2,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      membershipIds: ['m1', 'm2'],
    });
    expect(fetchFn.mock.calls.map((c) => [c[1]?.method ?? 'GET', c[0]])).toEqual([
      ['GET', '/api/groups/g1/programs'],
      ['POST', '/api/groups/g1/programs'],
    ]);
    resetApiClient();
  });
});

describe('menu: Programas e Ofertas (#403)', () => {
  it('Programas é da equipe que atende; Ofertas, só do dono', () => {
    const dono = panelSections('OWNER').map((s) => s.section);
    expect(dono).toEqual(expect.arrayContaining(['programs', 'offers']));
    expect(panelSections('PROFESSIONAL').map((s) => s.section)).toContain('programs');
    expect(panelSections('PROFESSIONAL').map((s) => s.section)).not.toContain('offers');
    for (const r of ['ADMIN', 'RECEPTION'] as const) {
      const s = panelSections(r).map((x) => x.section);
      expect(s).not.toContain('offers');
      expect(s).not.toContain('programs');
    }
    expect(panelHref('g1', 'programs')).toBe('/org/g1/programs');
    expect(panelHref('g1', 'offers')).toBe('/org/g1/offers');
  });

  it('Conteúdo › Programas e Comunidade › Ofertas', () => {
    const nav = panelNav('OWNER');
    expect(nav.find((g) => g.key === 'content')!.items.map((i) => i.section)).toContain('programs');
    expect(nav.find((g) => g.key === 'community')!.items.map((i) => i.section)).toContain('offers');
    expect(panelBreadcrumb('/org/g1/programs')).toEqual({ group: 'Conteúdo', label: 'Programas' });
    expect(panelBreadcrumb('/org/g1/offers')).toEqual({ group: 'Comunidade', label: 'Ofertas' });
  });
});

const plano = (extra: Partial<PlanProgramItem> = {}): PlanProgramItem => ({
  offerId: 'o1',
  membershipId: 'm1',
  name: 'Ana Dias',
  title: 'Hipertrofia A/B',
  authorName: 'Helena',
  schedule: 'CALENDAR',
  startDate: '2026-10-27',
  endDate: '2026-11-23',
  status: 'ACTIVE',
  startsInDays: null,
  sharesWorkout: true,
  progress: { done: 6, planned: 16, percent: 38, weekNumber: 2, weeks: 4 },
  phases: [],
  tags: ['intermediário'],
  ...extra,
});

describe('Programas por aluno (Pn-30, #403)', () => {
  it('abas com contagem, busca sem acento e status', () => {
    const itens = [
      plano(),
      plano({ offerId: 'o2', name: 'Júlia Reis', title: 'Corrida 5 km', status: 'SCHEDULED' }),
      plano({ offerId: 'o3', name: 'Hugo Matos', status: 'SENT', sharesWorkout: false }),
    ];
    expect(
      planProgramTabs({ all: 3, active: 1, ending: 0, scheduled: 1, ended: 0 }).map((t) => [
        t.key,
        t.label,
        t.count,
      ]),
    ).toEqual([
      ['all', 'Todos', 3],
      ['active', 'Em andamento', 1],
      ['ending', 'Terminando', 0],
      ['scheduled', 'Agendados', 1],
      ['ended', 'Terminaram', 0],
    ]);
    expect(filterPlanPrograms(itens, 'scheduled', '').map((i) => i.offerId)).toEqual(['o2']);
    expect(filterPlanPrograms(itens, 'all', 'julia').map((i) => i.offerId)).toEqual(['o2']);
    expect(filterPlanPrograms(itens, 'all', 'corrida').map((i) => i.offerId)).toEqual(['o2']);
    expect(planProgramStatusLabel('SENT')).toBe('enviado');
    expect(planProgramStatusLabel('ENDING')).toBe('terminando');
    expect(planProgramStatusLabel('ENDED')).toBe('terminou');
  });

  it('datas e a linha do progresso', () => {
    expect(planProgramDates(plano())).toBe('27 out – 23 nov');
    expect(planProgramDates(plano({ schedule: 'FLEXIBLE', startDate: null, endDate: null }))).toBe(
      'sem datas',
    );
    expect(planProgramProgressLine(plano())).toBe('semana 2 de 4 · 6 de 16');
    expect(
      planProgramProgressLine(plano({ status: 'SCHEDULED', startsInDays: 19, progress: null })),
    ).toBe('começa em 19 dias');
    expect(
      planProgramProgressLine(plano({ status: 'SENT', sharesWorkout: false, progress: null })),
    ).toBe('Ana não compartilha Treino');
    expect(
      planProgramProgressLine(
        plano({
          schedule: 'FLEXIBLE',
          progress: { done: 10, planned: null, percent: null, weekNumber: null, weeks: null },
        }),
      ),
    ).toBe('10 treinos feitos');
  });

  it('API', async () => {
    const fetchFn = vi.fn((_u: string, _i?: RequestInit) =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    configureApiClient({ resolveUrl: (p) => p, fetch: fetchFn as unknown as typeof fetch });
    await planProgramsApi.list('g1');
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/groups/g1/plan-programs');
    resetApiClient();
  });
});

const oferta = (extra: Partial<OfferView> = {}): OfferView => ({
  id: 'o1',
  slug: 'verao-21',
  title: 'Verão 21',
  description: '21 dias de treino e alimentação com a Helena.',
  priceCents: 14_900,
  spots: 30,
  startDate: '2026-12-01',
  endDate: '2026-12-21',
  grantsEntry: true,
  program: null,
  planTemplate: { id: 't1', title: 'Inferior v2' },
  extras: 'questionário de início',
  status: 'ACTIVE',
  publishedAt: '2026-11-10T12:00:00Z',
  closedAt: null,
  saleUrl: 'https://fat.ia.br/academia-demo/verao-21',
  stats: { sales: 18, spotsLeft: 12, revenueCents: 268_200, netCents: 241_380 },
  failed: [],
  ...extra,
});

describe('Ofertas (Pn-37, Pn-37b, #403)', () => {
  beforeEach(() => vi.useFakeTimers({ now: AGORA }));
  afterEach(() => vi.useRealTimers());

  it('preço, período, vagas, status e o link de venda', () => {
    expect(offerPriceLabel(14_900)).toBe('R$ 149');
    expect(offerPriceLabel(14_990)).toBe('R$ 149,90');
    expect(offerMeta(oferta())).toBe('1 a 21 dez · até 30 vagas');
    expect(offerMeta(oferta({ spots: null, startDate: null, endDate: null }))).toBe(
      'sem limite de vagas',
    );
    expect(offerStatusLabel(oferta())).toBe('ativa');
    expect(
      offerStatusLabel(
        oferta({
          failed: [
            { purchaseId: 'p1', name: 'Rafa', since: null, canResend: true },
            { purchaseId: 'p2', name: 'Lia', since: null, canResend: true },
          ],
        }),
      ),
    ).toBe('ativa · 2 pagamentos falharam');
    expect(offerStatusLabel(oferta({ status: 'DRAFT' }))).toBe('rascunho');
    expect(offerStatusLabel(oferta({ status: 'CLOSED' }))).toBe('encerrada');
    expect(saleUrlLabel(oferta().saleUrl)).toBe('fat.ia.br/academia-demo/verao-21');
  });

  it('o que a pessoa recebe e a receita depois da taxa', () => {
    expect(offerReceives(oferta())).toBe(
      'Plano Inferior v2 · questionário de início · entra na comunidade. No fim, nada do que registrou se perde.',
    );
    expect(
      offerReceives(oferta({ program: { id: 'p1', name: 'Verão 21' }, grantsEntry: true })),
    ).toContain('assento PRO do programa Verão 21');
    expect(offerRevenueSub(oferta(), 10)).toBe('R$ 2.413,80 depois da taxa de 10%');
    expect(offerRevenueSub(oferta(), 0)).toBe('sem taxa da plataforma');
  });

  it('duplicar sugere o mês seguinte; filtro por estado', () => {
    expect(duplicateOfferLabel(oferta())).toBe('Duplicar para janeiro');
    expect(duplicateOfferLabel(oferta({ startDate: null }))).toBe('Duplicar');
    const lista = [
      oferta(),
      oferta({ id: 'o2', status: 'DRAFT' }),
      oferta({ id: 'o3', status: 'CLOSED' }),
    ];
    expect(filterOffers(lista, 'ACTIVE').map((o) => o.id)).toEqual(['o1']);
    expect(filterOffers(lista, 'CLOSED').map((o) => o.id)).toEqual(['o3']);
  });

  it('API', async () => {
    const fetchFn = vi.fn((_u: string, _i?: RequestInit) =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    configureApiClient({ resolveUrl: (p) => p, fetch: fetchFn as unknown as typeof fetch });
    await offersApi.list('g1');
    await offersApi.create('g1', { title: 'X', priceCents: 1000 });
    await offersApi.update('g1', 'o1', { priceCents: 2000 });
    await offersApi.publish('g1', 'o1');
    await offersApi.close('g1', 'o1');
    await offersApi.duplicate('g1', 'o1');
    await offersApi.resendLink('g1', 'o1', 'p1');
    expect(fetchFn.mock.calls.map((c) => [c[1]?.method ?? 'GET', c[0]])).toEqual([
      ['GET', '/api/groups/g1/offers'],
      ['POST', '/api/groups/g1/offers'],
      ['PATCH', '/api/groups/g1/offers/o1'],
      ['POST', '/api/groups/g1/offers/o1/publish'],
      ['POST', '/api/groups/g1/offers/o1/close'],
      ['POST', '/api/groups/g1/offers/o1/duplicate'],
      ['POST', '/api/groups/g1/offers/o1/purchases/p1/resend'],
    ]);
    resetApiClient();
  });
});

describe('Para revisar: plano terminado (#403)', () => {
  const item: PanelReviewItem = {
    kind: 'PLAN_ENDED',
    refId: 'o1',
    membershipId: 'm1',
    name: 'Diego Lima',
    at: '2026-10-27T03:00:00Z',
    title: 'Hipertrofia A/B',
    durationMinutes: null,
    sets: null,
    answer: null,
    shares: [],
    whatsapp: null,
    seenAt: null,
    myFeedback: false,
  };
  it('tipo, linha e o filtro de planos', () => {
    expect(reviewKindLabel(item)).toBe('plano');
    expect(reviewLine(item)).toBe('Terminou “Hipertrofia A/B”');
    expect(filterReview([item], 'plans')).toHaveLength(1);
  });
});
