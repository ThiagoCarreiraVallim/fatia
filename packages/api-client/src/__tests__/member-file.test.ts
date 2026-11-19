import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import {
  fileAccessLine,
  fileFollowLine,
  fileTabs,
  lockedCopy,
  memberFileApi,
  memberPlanProgress,
  memberPlanStatus,
  memberPlanWhen,
  memberWeekCards,
  moveId,
  myNotesApi,
  planOrderApi,
  type MemberFile,
  type MemberWorkoutPlan,
} from '../member-file';

const plan = (over: Partial<MemberWorkoutPlan> = {}): MemberWorkoutPlan => ({
  offerId: 'o1',
  title: 'Inferior v2',
  status: 'ACTIVE',
  updatePending: false,
  version: 1,
  schedule: 'CALENDAR',
  startDate: '2026-11-10',
  endDate: '2026-12-07',
  weeks: 4,
  weekNumber: 2,
  sessionsDone: 6,
  sessionsPlanned: 16,
  authorName: 'Helena Prado',
  canRemove: true,
  sentAt: '2026-11-10T12:00:00.000Z',
  note: null,
  sourceTemplateId: null,
  position: 0,
  ...over,
});

describe('planos na ficha (Pn-05p)', () => {
  it('status com o rótulo da prancha', () => {
    expect(memberPlanStatus('ACTIVE')).toEqual({ label: 'ativo', tone: 'active' });
    expect(memberPlanStatus('PENDING')).toEqual({ label: 'aguardando aceite', tone: 'pending' });
    expect(memberPlanStatus('SCHEDULED')).toEqual({ label: 'agendado', tone: 'scheduled' });
    expect(memberPlanStatus('ENDED')).toEqual({ label: 'terminado', tone: 'ended' });
    expect(memberPlanStatus('DECLINED')).toEqual({ label: 'recusado', tone: 'ended' });
  });

  it('quando: datas do calendário, "começa" no agendado e "sem datas" no flexível', () => {
    expect(memberPlanWhen(plan())).toBe('10 nov – 7 dez');
    expect(memberPlanWhen(plan({ status: 'SCHEDULED', startDate: '2026-12-08' }))).toBe(
      'começa 8 dez',
    );
    expect(memberPlanWhen(plan({ schedule: 'FLEXIBLE', startDate: null, endDate: null }))).toBe(
      'sem datas',
    );
  });

  it('andamento: semana e sessões; sessões só com Treino liberado', () => {
    expect(memberPlanProgress(plan(), 'Ana')).toBe('semana 2 de 4 · 6 de 16 sessões');
    expect(memberPlanProgress(plan({ sessionsDone: null }), 'Ana')).toBe('semana 2 de 4');
    expect(memberPlanProgress(plan({ status: 'PENDING' }), 'Ana Dias')).toBe(
      'Ana ainda não aceitou',
    );
    expect(
      memberPlanProgress(
        plan({ schedule: 'FLEXIBLE', weekNumber: null, sessionsPlanned: null, sessionsDone: 3 }),
        'Ana',
      ),
    ).toBe('3 sessões feitas');
    expect(memberPlanProgress(plan({ updatePending: true }), 'Ana')).toBe(
      'semana 2 de 4 · 6 de 16 sessões · versão nova esperando aceite',
    );
  });

  it('subir e descer na ordem, sem sair das pontas', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c'], 'x', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('abas e cadeado (Pn-05)', () => {
  it('aba de categoria não liberada leva cadeado; Resumo, Planos e Agenda nunca', () => {
    const tabs = fileTabs(['WORKOUT', 'NUTRITION']);
    expect(tabs.map((t) => t.label)).toEqual([
      'Resumo',
      'Planos',
      'Treino',
      'Alimentação',
      'Fotos das refeições',
      'Corpo e avaliações',
      'Hábitos e metas',
      'Agenda',
    ]);
    expect(tabs.filter((t) => t.locked).map((t) => t.key)).toEqual(['photos', 'body', 'habits']);
  });

  it('Hábitos e metas abre com qualquer uma das duas', () => {
    expect(fileTabs(['GOALS']).find((t) => t.key === 'habits')?.locked).toBe(false);
  });

  it('o cadeado diz quem pode ligar e não mostra número', () => {
    expect(lockedCopy('Ana Dias', 'Corpo')).toEqual({
      title: 'Ana não compartilha Corpo',
      body: 'Só ela pode ligar, no app, em Comunidade → Sobre. Você não vê nem o resumo.',
    });
  });
});

describe('resumo (Pn-05)', () => {
  const week: MemberFile['week'] = {
    workouts: { done: 1, target: 4 },
    nutrition: {
      kcalAvg: 1840,
      daysLogged: 6,
      kcalMin: 1800,
      kcalMax: 2200,
      proteinMinG: 120,
      proteinDays: 5,
    },
    body: { currentWeightKg: 70.2, deltaKg: -2.5, sinceDays: 60 },
  };

  it('só aparece o cartão da categoria liberada', () => {
    expect(memberWeekCards(week).map((c) => [c.label, c.value])).toEqual([
      ['Treinos', '1 de 4'],
      ['Calorias · média 7 dias', '1.840 kcal'],
      ['Proteína acima de 120 g', '5 de 6 dias'],
      ['Peso', '70,2 kg'],
    ]);
    expect(memberWeekCards({ workouts: null, nutrition: null, body: null })).toEqual([]);
  });

  it('sem meta de proteína, o cartão some; sem refeição, a média é traço', () => {
    const cards = memberWeekCards({
      workouts: null,
      body: null,
      nutrition: {
        kcalAvg: null,
        daysLogged: 0,
        kcalMin: null,
        kcalMax: null,
        proteinMinG: null,
        proteinDays: null,
      },
    });
    expect(cards).toEqual([
      { key: 'kcal', label: 'Calorias · média 7 dias', value: '—', sub: 'nenhum dia registrado' },
    ]);
  });

  it('desde quando e quem acompanha', () => {
    expect(
      fileFollowLine({ joinedAt: '2026-09-03T12:00:00.000Z', followedBy: ['Helena Prado'] }),
    ).toBe('Membro desde set · acompanhada por Helena Prado');
    expect(fileFollowLine({ joinedAt: null, followedBy: [] })).toBe('Ninguém da equipe acompanha');
  });

  it('o histórico diz "Você" para quem olha e marca a negativa', () => {
    const now = new Date('2026-11-19T15:00:00.000Z');
    expect(
      fileAccessLine(
        {
          at: '2026-11-19T15:00:00.000Z',
          scope: 'WORKOUT',
          action: 'get_member_file',
          denied: false,
          professionalName: 'Helena Prado',
          isMe: true,
        },
        now,
        'America/Sao_Paulo',
      ),
    ).toMatch(/^Você abriu Treino · /);
    expect(
      fileAccessLine(
        {
          at: '2026-11-19T15:00:00.000Z',
          scope: 'NUTRITION',
          action: 'get_student_progress',
          denied: true,
          professionalName: 'Nina',
          isMe: false,
        },
        now,
        'America/Sao_Paulo',
      ),
    ).toMatch(/^Nina tentou ver Alimentação · negado/);
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

  it('a ficha e a agenda pela comunidade e pela associação', async () => {
    await memberFileApi.file('g1', 'm1');
    await memberFileApi.agenda('g1', 'm1', '2026-11-16', '2026-11-22');
    expect(call(0).url).toBe('/api/groups/g1/members/m1/file');
    expect(call(1).url).toBe('/api/groups/g1/members/m1/agenda?from=2026-11-16&to=2026-11-22');
  });

  it('apagar leva o aviso e o "terminar hoje" na query', async () => {
    await memberFileApi.removePlan('g1', 'm1', 'o1', { notify: true, endToday: false });
    expect(call(0).url).toBe('/api/groups/g1/members/m1/plans/o1?notify=true&endToday=false');
    expect(call(0).init.method).toBe('DELETE');
  });

  it('ordem, envio e anotação', async () => {
    await memberFileApi.reorderPlans('g1', 'm1', ['o2', 'o1']);
    await memberFileApi.sendPlan('g1', 'm1', { templateId: 't1', schedule: 'FLEXIBLE' });
    await memberFileApi.createNote('g1', 'm1', 'oi');
    await memberFileApi.updateNote('g1', 'm1', 'n1', 'olá');
    await memberFileApi.removeNote('g1', 'm1', 'n1');
    expect(call(0)).toMatchObject({ url: '/api/groups/g1/members/m1/plans/order' });
    expect(call(0).init.method).toBe('PUT');
    expect(JSON.parse(String(call(0).init.body))).toEqual({ offerIds: ['o2', 'o1'] });
    expect(call(1).url).toBe('/api/groups/g1/members/m1/plans');
    expect(call(2).url).toBe('/api/groups/g1/members/m1/notes');
    expect(call(3).url).toBe('/api/groups/g1/members/m1/notes/n1');
    expect(call(3).init.method).toBe('PATCH');
    expect(call(4).init.method).toBe('DELETE');
  });

  it('as notas da própria pessoa e a ordem dos planos dela', async () => {
    await myNotesApi.list('g1');
    await planOrderApi.get();
    await planOrderApi.set(['p2', 'p1']);
    expect(call(0).url).toBe('/api/groups/g1/my-notes');
    expect(call(1).url).toBe('/api/workout/plans/order');
    expect(call(2).init.method).toBe('PUT');
    expect(JSON.parse(String(call(2).init.body))).toEqual({ planIds: ['p2', 'p1'] });
  });
});
