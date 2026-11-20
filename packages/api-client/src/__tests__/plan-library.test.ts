import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import type { PlanTemplate } from '../community-content';
import {
  canSendTemplate,
  communityToggleLabel,
  filterLibrary,
  libraryAuthors,
  libraryCounts,
  libraryFormat,
  recipientFilters,
  sendButtonLabel,
  SEND_KINDS,
  sendPreview,
  sendSuccessToast,
  sendsApi,
  sentLine,
  sentProgressLine,
  sentStatus,
  validateSendForm,
  withWhomLabel,
  type SendRecipient,
  type SentItem,
} from '../plan-library';

const tpl = (over: Partial<PlanTemplate> = {}): PlanTemplate => ({
  id: 't1',
  kind: 'WORKOUT',
  title: 'Inferior v2',
  description: null,
  level: 'intermediate',
  cover: null,
  authorName: 'Helena Prado',
  authorRole: 'PROFESSIONAL',
  publishedAt: null,
  updatedAt: '2026-11-20T10:00:00Z',
  exercises: [
    {
      exerciseId: 1,
      hasGuide: false,
      name: 'Agachamento',
      muscleGroup: 'legs',
      targetSets: 4,
      targetReps: '8',
    },
  ],
  goals: null,
  meals: [],
  adoptedPlanId: null,
  draft: false,
  withWhom: { band: 'none', count: null },
  ...over,
});

const sent = (over: Partial<SentItem> = {}): SentItem => ({
  id: 'o1',
  kind: 'WORKOUT',
  title: 'Inferior v1',
  version: 1,
  changeNote: null,
  name: 'Ana Dias',
  membershipId: 'm1',
  sentAt: '2026-09-30T12:00:00Z',
  status: 'ACCEPTED',
  schedule: 'FLEXIBLE',
  startDate: null,
  endDate: null,
  progress: null,
  noProgress: false,
  canRevoke: false,
  ...over,
});

describe('biblioteca (#405, Pn-08)', () => {
  it('"Com quem" só mostra o número a partir de 5 pessoas', () => {
    expect(withWhomLabel({ band: 'many', count: 11 })).toBe('11 pessoas');
    expect(withWhomLabel({ band: 'few', count: null })).toBe('menos de 5');
    expect(withWhomLabel({ band: 'none', count: null })).toBe('ninguém ainda');
    expect(withWhomLabel(undefined)).toBe('—');
  });

  it('"Na comunidade": rascunho, publicado ou só da equipe', () => {
    expect(communityToggleLabel(tpl({ draft: true }))).toEqual({
      label: 'termine antes',
      hint: 'rascunho',
      disabled: true,
    });
    expect(communityToggleLabel(tpl({ publishedAt: '2026-11-01T00:00:00Z' }))).toEqual({
      label: 'publicado',
      hint: 'membros podem adotar',
      disabled: false,
    });
    expect(communityToggleLabel(tpl())).toEqual({
      label: 'não',
      hint: 'só a equipe envia',
      disabled: false,
    });
  });

  it('filtra por tipo, situação, autor e busca, sem acento', () => {
    const lista = [
      tpl({ id: 'a', title: 'Glúteos e posterior', publishedAt: '2026-11-01T00:00:00Z' }),
      tpl({ id: 'b', title: 'Braços', draft: true }),
      tpl({ id: 'c', title: 'Full Body', authorName: 'Bruno Lima' }),
      tpl({ id: 'd', kind: 'NUTRITION', title: 'Cutting' }),
    ];
    const ids = (f: Parameters<typeof filterLibrary>[1]) =>
      filterLibrary(lista, f).map((t) => t.id);
    expect(ids({ kind: 'WORKOUT', filter: 'all' })).toEqual(['a', 'b', 'c']);
    expect(ids({ kind: 'WORKOUT', filter: 'community' })).toEqual(['a']);
    expect(ids({ kind: 'WORKOUT', filter: 'team' })).toEqual(['c']);
    expect(ids({ kind: 'WORKOUT', filter: 'drafts' })).toEqual(['b']);
    expect(ids({ kind: 'WORKOUT', filter: 'all', query: 'gluteos' })).toEqual(['a']);
    expect(ids({ kind: 'WORKOUT', filter: 'all', author: 'Bruno Lima' })).toEqual(['c']);
    expect(ids({ kind: 'NUTRITION', filter: 'all' })).toEqual(['d']);
    expect(libraryCounts(lista)).toEqual({ WORKOUT: 3, NUTRITION: 1 });
    expect(libraryAuthors(lista)).toEqual(['Bruno Lima', 'Helena Prado']);
  });

  it('o formato resume o plano', () => {
    expect(libraryFormat(tpl())).toBe('1 exercício · intermediário');
    expect(
      libraryFormat(
        tpl({
          kind: 'NUTRITION',
          exercises: [],
          level: null,
          goals: {
            kcalMin: 1700,
            kcalMax: 1900,
            proteinMinG: 1,
            proteinMaxG: 2,
            carbsMinG: 1,
            carbsMaxG: 2,
            fatMinG: 1,
            fatMaxG: 2,
          },
          meals: [
            { name: 'Café', mealType: 'BREAKFAST', kcal: 300, items: [] },
            { name: 'Almoço', mealType: 'LUNCH', kcal: 600, items: [] },
          ],
        }),
      ),
    ).toBe('2 refeições · 1700–1900 kcal');
  });

  it('rascunho não se envia', () => {
    expect(canSendTemplate(tpl({ draft: true }))).toBe(false);
    expect(canSendTemplate(tpl())).toBe(true);
  });
});

describe('enviar para alunos (#405, Pn-18 e Pn-08b)', () => {
  it('hábito, questionário e recomendação ainda não se enviam, e dizem por quê', () => {
    expect(SEND_KINDS.map((k) => [k.key, k.enabled])).toEqual([
      ['WORKOUT', true],
      ['NUTRITION', true],
      ['HABIT', false],
      ['QUESTIONNAIRE', false],
      ['RECOMMENDATION', false],
    ]);
    expect(SEND_KINDS.find((k) => k.key === 'HABIT')!.soon).toMatch(/hábitos/i);
  });

  it('o botão diz para quem', () => {
    expect(sendButtonLabel([])).toBe('Escolha para quem');
    expect(sendButtonLabel(['Ana Dias'])).toBe('Enviar para Ana');
    expect(sendButtonLabel(['Ana Dias', 'Carla Souza'])).toBe('Enviar para 2 pessoas');
  });

  it('filtros de quem recebe: todos, quem eu acompanho e sem plano', () => {
    const r = (name: string, over: Partial<SendRecipient> = {}): SendRecipient => ({
      membershipId: name,
      name,
      accompaniedByMe: false,
      hasPlan: true,
      alreadyHas: false,
      openEnded: false,
      ...over,
    });
    const lista = [r('Ana', { accompaniedByMe: true }), r('Diego', { hasPlan: false }), r('Hugo')];
    expect(recipientFilters(lista).map((f) => [f.key, f.count])).toEqual([
      ['all', 3],
      ['mine', 1],
      ['noPlan', 1],
    ]);
    expect(recipientFilters(lista)[2]!.ids).toEqual(['Diego']);
  });

  it('valida o formulário antes de mandar', () => {
    const base = {
      kind: 'WORKOUT' as const,
      templateId: 't1',
      membershipIds: ['m1'],
      schedule: 'CALENDAR' as const,
      start: 'TODAY' as const,
      weeks: 4,
      weekdays: [1, 3, 5],
    };
    expect(validateSendForm(base)).toBeNull();
    expect(validateSendForm({ ...base, membershipIds: [] })).toBe('Escolha para quem enviar.');
    expect(validateSendForm({ ...base, templateId: null })).toBe('Escolha o plano.');
    expect(validateSendForm({ ...base, weekdays: [] })).toBe('Escolha os dias da semana.');
    expect(validateSendForm({ ...base, start: 'DATE' })).toBe('Escolha o dia de começar.');
    expect(validateSendForm({ ...base, schedule: 'FLEXIBLE', weekdays: [] })).toBeNull();
  });

  it('"Como chega" muda com o tipo e com a versão nova', () => {
    expect(sendPreview({ kind: 'WORKOUT', title: 'Full Body', changeNote: null })).toEqual({
      eyebrow: 'PLANO NOVO',
      title: 'Full Body',
      body: 'Toque para ver os exercícios e aceitar.',
      button: 'Ver plano',
    });
    expect(
      sendPreview({ kind: 'WORKOUT', title: 'Inferior v2', changeNote: 'Trocou 2 exercícios.' }),
    ).toMatchObject({ body: 'Trocou 2 exercícios.', button: 'Ver o que mudou' });
    expect(sendPreview({ kind: 'NUTRITION', title: 'Cutting', changeNote: null })).toMatchObject({
      eyebrow: 'PLANO ALIMENTAR',
      button: 'Ver plano',
    });
  });

  it('toast de sucesso diz quantos receberam a versão nova', () => {
    expect(
      sendSuccessToast({ results: [{ membershipId: 'a', id: 'x', version: 1, kind: 'new' }] }),
    ).toBe('Enviado · cada pessoa aceita no app');
    expect(
      sendSuccessToast({
        results: [
          { membershipId: 'a', id: 'x', version: 1, kind: 'new' },
          { membershipId: 'b', id: 'y', version: 2, kind: 'update' },
        ],
      }),
    ).toBe('Enviado · 1 recebeu a versão nova');
  });
});

describe('enviados recentemente (#405)', () => {
  it('estado com tom', () => {
    expect(sentStatus('SENT')).toEqual({ label: 'enviado', tone: 'info' });
    expect(sentStatus('ACCEPTED')).toEqual({ label: 'aceito', tone: 'ok' });
    expect(sentStatus('DECLINED')).toEqual({ label: 'recusado', tone: 'warn' });
    expect(sentStatus('REVOKED')).toEqual({ label: 'cancelado', tone: 'muted' });
  });

  it('a linha de baixo: pessoa, dia, versão e como segue', () => {
    expect(sentLine(sent())).toBe('Ana Dias · 30 set · flexível');
    expect(
      sentLine(
        sent({ version: 2, schedule: 'CALENDAR', startDate: '2026-11-10', endDate: '2026-12-07' }),
      ),
    ).toBe('Ana Dias · 30 set · v2 · 10 nov – 07 dez');
    expect(sentLine(sent({ kind: 'NUTRITION', schedule: null }))).toBe('Ana Dias · 30 set');
  });

  it('progresso só com Treino liberado; sem ele, "sem progresso" e nada mais', () => {
    expect(sentProgressLine(sent({ progress: { done: 5, planned: 12, percent: 42 } }))).toBe(
      '42% · sessão 5 de 12',
    );
    expect(sentProgressLine(sent({ progress: { done: 3, planned: null, percent: null } }))).toBe(
      '3 treinos feitos',
    );
    expect(sentProgressLine(sent({ noProgress: true }))).toBe('sem progresso');
    expect(sentProgressLine(sent())).toBeNull();
  });
});

describe('sendsApi', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    configureApiClient({
      resolveUrl: (path) => `http://x${path}`,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
  });
  afterEach(() => {
    resetApiClient();
    fetchMock.mockReset();
  });

  it('usa groups/:id/sends', async () => {
    await sendsApi.recipients('g', 't');
    await sendsApi.list('g');
    await sendsApi.send('g', { templateId: 't', membershipIds: ['m'] });
    await sendsApi.revoke('g', 'o');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([
      'http://x/api/groups/g/sends/recipients?templateId=t',
      'http://x/api/groups/g/sends',
      'http://x/api/groups/g/sends',
      'http://x/api/groups/g/sends/o/revoke',
    ]);
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');
  });
});
