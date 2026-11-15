import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import {
  agendaApi,
  agendaDayLabel,
  agendaItemCopy,
  agendaPlanLabel,
  agendaRangeLabel,
  agendaWeek,
  blockWeekRows,
  diffSummary,
  endedText,
  exerciseChangeText,
  exerciseSetsText,
  monthGrid,
  offerAnswerCopy,
  offerSentLine,
  offerTitle,
  offerWhen,
  planOffersApi,
  rescheduleDays,
  templatesSubtitle,
  type AgendaItem,
  type OfferVersion,
} from '../plan-offers';

const version = (over: Partial<OfferVersion> = {}): OfferVersion => ({
  id: 'v1',
  version: 1,
  status: 'PENDING',
  title: 'Inferior',
  schedule: 'CALENDAR',
  startDate: '2025-11-10',
  endDate: '2025-12-07',
  weeks: 4,
  weekdays: [1, 4],
  note: null,
  sentAt: '2025-11-10T12:12:00.000Z',
  respondedAt: null,
  summary: { exercises: 4, sets: 14, minutes: 40 },
  exercises: [],
  removed: [],
  ...over,
});

describe('plano recebido (Al-T2, Al-T2b)', () => {
  it('o título leva a versão a partir da segunda', () => {
    expect(offerTitle(version())).toBe('Inferior');
    expect(offerTitle(version({ version: 2 }))).toBe('Inferior v2');
  });

  it('calendário: semanas e datas; flexível: sem datas', () => {
    expect(offerWhen(version())).toEqual({
      label: '4 semanas · 10 nov – 07 dez',
      sub: 'as sessões entram na sua agenda',
      tone: 'calendar',
    });
    expect(
      offerWhen(version({ schedule: 'FLEXIBLE', startDate: null, endDate: null, weeks: null })),
    ).toEqual({ label: 'Flexível', sub: 'sem datas · siga no seu ritmo', tone: 'flexible' });
    expect(offerWhen(version({ weeks: 1, endDate: '2025-11-16' })).label).toBe(
      '1 semana · 10 nov – 16 nov',
    );
  });

  it('remetente: comunidade e hora, "hoje" quando é hoje', () => {
    const agora = new Date('2025-11-10T18:00:00.000Z');
    const tz = 'America/Sao_Paulo';
    expect(offerSentLine('Academia Demo', '2025-11-10T12:12:00.000Z', agora, tz)).toBe(
      'Academia Demo · hoje 09:12',
    );
    expect(offerSentLine(null, '2025-11-08T12:12:00.000Z', agora, tz)).toBe('08 nov 09:12');
  });

  it('séries × repetições, com o traço de faixa', () => {
    expect(exerciseSetsText({ targetSets: 3, targetReps: '10-12' })).toBe('3 × 10–12');
    expect(exerciseSetsText({ targetSets: 4, targetReps: '' })).toBe('4 séries');
  });

  it('o que mudou em cada exercício, em uma linha', () => {
    expect(
      exerciseChangeText([
        { field: 'sets', before: '4', after: '5' },
        { field: 'rest', before: '60', after: null },
      ]),
    ).toBe('séries 4 → 5 · descanso 60 s → padrão');
    expect(exerciseChangeText([])).toBeNull();
  });

  it('resumo do diff da atualização', () => {
    expect(
      diffSummary({ added: ['a'], removed: ['b', 'c'], changed: [{ key: 'd', fields: [] }] }),
    ).toBe('1 novo · 1 alterado · 2 removidos');
    expect(diffSummary({ added: [], removed: [], changed: [] })).toBe('Sem mudança nos exercícios');
  });

  it('textos do aceito e do recusado, sem gênero', () => {
    expect(offerAnswerCopy('accepted', 'Helena Personal', 'new')).toEqual({
      title: 'Plano aceito',
      body: 'Avisamos Helena. Ele entrou nos seus planos.',
    });
    expect(offerAnswerCopy('accepted', 'Helena Personal', 'update').title).toBe('Troca aceita');
    expect(offerAnswerCopy('declined', null, 'new')).toEqual({
      title: 'Recusado',
      body: 'Avisamos a equipe.',
    });
    expect(offerAnswerCopy('declined', 'Helena', 'update')).toEqual({
      title: 'Você manteve a versão atual',
      body: 'Avisamos Helena.',
    });
  });
});

describe('agenda (Al-T24)', () => {
  it('a semana da data: segunda a domingo', () => {
    expect(agendaWeek('2025-11-13')).toEqual({ from: '2025-11-10', to: '2025-11-16' });
    expect(agendaWeek('2025-11-16')).toEqual({ from: '2025-11-10', to: '2025-11-16' });
  });

  it('rótulos do intervalo e do dia', () => {
    expect(agendaRangeLabel('2025-11-10', '2025-11-16')).toBe('10 – 16 nov');
    expect(agendaRangeLabel('2025-11-24', '2025-11-30')).toBe('24 – 30 nov');
    expect(agendaRangeLabel('2025-12-29', '2026-01-04')).toBe('29 dez – 04 jan');
    expect(agendaDayLabel('2025-11-13')).toEqual({ weekday: 'qui', day: 13, long: 'qui, 13 nov' });
  });

  it('o rótulo do plano: semana corrente, vazio ou terminado', () => {
    expect(
      agendaPlanLabel({
        calendarPlan: { planName: 'Hipertrofia A/B', weekNumber: 3, weeksTotal: 4 },
        ended: null,
        empty: false,
      }),
    ).toBe('Hipertrofia A/B · semana 3 de 4');
    expect(agendaPlanLabel({ calendarPlan: null, ended: null, empty: true })).toBe(
      'sem plano com datas',
    );
    expect(agendaPlanLabel({ calendarPlan: null, ended: { planName: 'X' }, empty: false })).toBe(
      'plano terminou',
    );
  });

  it('cada sessão diz o estado, e só a não feita oferece remarcar', () => {
    const item = (over: Partial<AgendaItem>): AgendaItem => ({
      id: 's1',
      kind: 'planned',
      planId: 'p1',
      planName: 'Inferior',
      order: 3,
      state: 'planned',
      rescheduledFrom: null,
      canReschedule: true,
      endDate: '2025-12-07',
      ...over,
    });
    expect(agendaItemCopy(item({ state: 'done' }))).toMatchObject({
      title: 'Inferior',
      subtitle: 'feito',
      tone: 'done',
      open: false,
      reschedule: false,
    });
    expect(agendaItemCopy(item({ state: 'missed' }))).toMatchObject({
      subtitle: 'não feito',
      tone: 'missed',
      reschedule: true,
    });
    expect(agendaItemCopy(item({ state: 'today' }))).toMatchObject({
      subtitle: 'hoje · sessão 3',
      open: true,
    });
    expect(agendaItemCopy(item({ rescheduledFrom: '2025-11-11' })).subtitle).toBe(
      'planejado · remarcado de 11 nov',
    );
    expect(
      agendaItemCopy(item({ kind: 'next', order: null, state: 'today', canReschedule: false })),
    ).toMatchObject({ subtitle: 'próxima sessão · no seu ritmo', open: true, reschedule: false });
  });

  it('remarcar: de hoje ao fim do plano, nunca depois', () => {
    expect(rescheduleDays('2025-11-13', '2025-11-16')).toEqual([
      '2025-11-13',
      '2025-11-14',
      '2025-11-15',
      '2025-11-16',
    ]);
    expect(rescheduleDays('2025-11-17', '2025-11-16')).toEqual([]);
  });

  it('grade do mês: começa na segunda e cobre semanas inteiras', () => {
    const g = monthGrid('2025-11-13');
    expect(g.from).toBe('2025-10-27');
    expect(g.to).toBe('2025-11-30');
    expect(g.label).toBe('novembro de 2025');
  });

  it('plano que terminou', () => {
    expect(
      endedText({
        planName: 'Hipertrofia A/B',
        done: 15,
        total: 16,
        weeks: 4,
        authorName: 'Helena P',
      }),
    ).toEqual({
      title: 'Hipertrofia A/B terminou',
      body: '15 de 16 sessões em 4 semanas. Helena pode mandar o próximo plano.',
    });
  });
});

describe('bloco de semanas (Al-T12)', () => {
  it('linhas com foco, intensidade, volume e as barras do gráfico', () => {
    const rows = blockWeekRows([
      { weekNumber: 1, label: 'Acúmulo', intensityFactor: 1, volumeFactor: 1, sessionsTarget: 4 },
      {
        weekNumber: 2,
        label: 'Deload',
        intensityFactor: 0.85,
        volumeFactor: 0.5,
        sessionsTarget: 4,
      },
    ]);
    expect(rows[0]).toMatchObject({
      n: 1,
      label: 'Acúmulo',
      intensity: '100%',
      volume: '100%',
      sessions: '4 sessões',
      deload: false,
    });
    expect(rows[1]).toMatchObject({ intensity: '85%', volume: '50%', deload: true });
    // Barras proporcionais ao maior fator, para o gráfico caber.
    expect(rows[0]!.volumeBar).toBeGreaterThan(rows[1]!.volumeBar);
    expect(Math.max(...rows.map((r) => r.intensityBar))).toBeLessThanOrEqual(1);
  });
});

describe('modelos (Al-T23)', () => {
  it('nível e autor na mesma linha', () => {
    expect(
      templatesSubtitle({ level: 'beginner', authorName: 'Bruno', exerciseCount: 5, setCount: 15 }),
    ).toEqual({ level: 'Iniciante', rest: '5 exercícios · 15 séries · por Bruno' });
    expect(
      templatesSubtitle({ level: null, authorName: 'Ana', exerciseCount: 1, setCount: 3 }),
    ).toEqual({ level: null, rest: '1 exercício · 3 séries · por Ana' });
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

  it('aceitar, recusar e desfazer mandam a versão vista', async () => {
    await planOffersApi.accept('o1', 'v1');
    await planOffersApi.decline('o1', 'v1');
    await planOffersApi.undoDecline('o1', 'v1');
    const urls = fetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith('/plan-offers/o1/accept'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/plan-offers/o1/decline'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/plan-offers/o1/undo-decline'))).toBe(true);
    for (const call of fetch.mock.calls) {
      expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ versionId: 'v1' });
    }
  });

  it('agenda por intervalo e remarcar', async () => {
    await agendaApi.range('2025-11-10', '2025-11-16');
    await agendaApi.reschedule('s1', '2025-11-15');
    const [range, patch] = fetch.mock.calls;
    expect(String(range![0])).toContain('/workout/agenda?from=2025-11-10&to=2025-11-16');
    expect((patch![1] as RequestInit).method).toBe('PATCH');
  });
});
