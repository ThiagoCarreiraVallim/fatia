import { describe, expect, it } from 'vitest';
import type { AgendaItem, PlanOffer, TrainingBlock } from '@fatia/api-client';
import {
  acceptConfirm,
  declineConfirm,
  offerActions,
  offerStage,
  pendingOfferBanner,
} from '../offer-view';
import {
  agendaWindow,
  dayDot,
  defaultSelectedDay,
  localToday,
  rescheduleChoices,
  shiftAnchor,
} from '../agenda-view';
import { activeWeekRows, blockScreenState, blockStatusCopy } from '../block-view';

const offer = (over: Partial<PlanOffer> = {}, shown: Partial<PlanOffer['shown']> = {}): PlanOffer => ({
  id: 'o1',
  author: { name: 'Helena Personal' },
  group: { id: 'g1', name: 'Academia Demo' },
  kind: 'new',
  accepted: null,
  diff: null,
  planId: null,
  ...over,
  shown: {
    id: 'v1',
    version: 1,
    status: 'PENDING',
    title: 'Inferior',
    schedule: 'CALENDAR',
    startDate: '2026-11-16',
    endDate: '2026-12-13',
    weeks: 4,
    weekdays: [1, 4],
    note: null,
    sentAt: '2026-11-15T12:00:00.000Z',
    respondedAt: null,
    summary: { exercises: 4, sets: 14, minutes: 40 },
    exercises: [],
    removed: [],
    ...shown,
  },
});

describe('plano recebido no app (Al-T2, Al-T2b)', () => {
  it('o estágio sai do status da versão mostrada', () => {
    expect(offerStage(offer())).toBe('answer');
    expect(offerStage(offer({}, { status: 'ACCEPTED' }))).toBe('accepted');
    expect(offerStage(offer({}, { status: 'DECLINED' }))).toBe('declined');
    expect(offerStage(offer({}, { status: 'SUPERSEDED' }))).toBe('superseded');
  });

  it('botões de baixo: novo, atualização, aceito e recusado', () => {
    expect(offerActions(offer())).toEqual({ primary: 'Aceitar plano', secondary: 'Recusar' });
    expect(offerActions(offer({ kind: 'update' }, { version: 2 }))).toEqual({
      primary: 'Aceitar troca',
      secondary: 'Manter atual',
    });
    expect(offerActions(offer({ planId: 'p1' }, { status: 'ACCEPTED' }))).toEqual({
      primary: 'Começar agora',
      secondary: 'Voltar',
    });
    expect(offerActions(offer({}, { status: 'DECLINED' }))).toEqual({
      primary: 'Voltar',
      secondary: null,
    });
  });

  it('a confirmação do aceite diz o que acontece com a agenda', () => {
    expect(acceptConfirm(offer())).toEqual({
      title: 'Aceitar Inferior?',
      description:
        'Ele entra nos seus planos e as sessões vão para a sua agenda, de 16 nov a 13 dez.',
      confirmLabel: 'Aceitar plano',
    });
    expect(
      acceptConfirm(offer({}, { schedule: 'FLEXIBLE', startDate: null, endDate: null, weeks: null }))
        .description,
    ).toBe('Ele entra nos seus planos. Sem datas: você treina no seu ritmo.');
    const update = acceptConfirm(
      offer(
        { kind: 'update', diff: { added: ['a'], removed: [], changed: [], hasChanges: true } },
        { version: 2 },
      ),
    );
    expect(update).toEqual({
      title: 'Trocar pela v2?',
      description: '1 novo. O plano em uso muda; o histórico dos treinos continua.',
      confirmLabel: 'Aceitar troca',
    });
  });

  it('recusar pergunta antes e lembra que dá para desfazer', () => {
    expect(declineConfirm(offer())).toEqual({
      title: 'Recusar Inferior?',
      description: 'Avisamos Helena. Dá para desfazer depois.',
      confirmLabel: 'Recusar',
    });
    expect(declineConfirm(offer({ kind: 'update', author: null }, { version: 2 }))).toEqual({
      title: 'Manter a versão atual?',
      description: 'Seu plano não muda. Avisamos a equipe.',
      confirmLabel: 'Manter atual',
    });
  });

  it('o aviso no Treino: o primeiro pendente e quantos mais', () => {
    const p = {
      id: 'o1',
      versionId: 'v1',
      title: 'Inferior',
      version: 1,
      kind: 'new' as const,
      status: 'PENDING' as const,
      schedule: 'CALENDAR' as const,
      authorName: 'Helena P',
      groupName: 'Academia Demo',
      sentAt: '2026-11-15T12:00:00.000Z',
      planId: null,
      href: '/workout/offers/o1',
    };
    expect(pendingOfferBanner([])).toBeNull();
    expect(pendingOfferBanner([p])).toEqual({
      title: 'Helena enviou Inferior',
      sub: 'Toque para ver e aceitar',
      href: '/workout/offers/o1',
      authorName: 'Helena P',
    });
    expect(pendingOfferBanner([p, { ...p, id: 'o2' }])?.sub).toBe(
      'Toque para ver e aceitar · mais 1 esperando',
    );
  });
});

describe('agenda no app (Al-T24)', () => {
  it('o dia de hoje no fuso, sem o UTC empurrar a data', () => {
    expect(localToday(new Date('2026-11-16T01:30:00.000Z'), 'America/Sao_Paulo')).toBe(
      '2026-11-15',
    );
  });

  it('semana e mês: intervalo e rótulo', () => {
    expect(agendaWindow('week', '2026-11-18')).toEqual({
      from: '2026-11-16',
      to: '2026-11-22',
      label: '16 – 22 nov',
    });
    expect(agendaWindow('month', '2026-11-18')).toEqual({
      from: '2026-10-26',
      to: '2026-12-06',
      label: 'novembro de 2026',
    });
  });

  it('andar para frente e para trás', () => {
    expect(shiftAnchor('week', '2026-11-18', 1)).toBe('2026-11-25');
    expect(shiftAnchor('week', '2026-11-18', -1)).toBe('2026-11-11');
    expect(shiftAnchor('month', '2026-11-18', 1)).toBe('2026-12-01');
    expect(shiftAnchor('month', '2026-01-31', -1)).toBe('2025-12-01');
  });

  const item = (state: AgendaItem['state']): AgendaItem => ({
    id: 's',
    kind: 'planned',
    planId: 'p',
    planName: 'Inferior',
    order: 1,
    state,
    rescheduledFrom: null,
    canReschedule: true,
    endDate: '2026-12-13',
  });

  it('o ponto do dia: não feito pesa mais que planejado, e tudo feito é feito', () => {
    expect(dayDot([])).toBeNull();
    expect(dayDot([item('done')])).toBe('done');
    expect(dayDot([item('done'), item('missed')])).toBe('missed');
    expect(dayDot([item('planned')])).toBe('planned');
    expect(dayDot([item('today')])).toBe('today');
  });

  it('o dia aberto: hoje, se estiver na semana; senão o primeiro com sessão', () => {
    const days = [
      { date: '2026-11-16', items: [] },
      { date: '2026-11-17', items: [item('planned')] },
    ];
    expect(defaultSelectedDay({ today: '2026-11-16', days })).toBe('2026-11-16');
    expect(defaultSelectedDay({ today: '2026-11-30', days })).toBe('2026-11-17');
    expect(defaultSelectedDay({ today: '2026-11-30', days: [days[0]!] })).toBe('2026-11-16');
  });

  it('remarcar: de hoje ao fim, sem o dia em que já está', () => {
    expect(rescheduleChoices('2026-11-15', '2026-11-18', '2026-11-16')).toEqual([
      { date: '2026-11-15', label: 'dom, 15 nov', today: true },
      { date: '2026-11-17', label: 'ter, 17 nov', today: false },
      { date: '2026-11-18', label: 'qua, 18 nov', today: false },
    ]);
    expect(rescheduleChoices('2026-11-15', null, '2026-11-14')).toEqual([]);
  });
});

describe('bloco de semanas no app (Al-T12)', () => {
  const week = (n: number, over: Partial<TrainingBlock['weeks'][number]> = {}) => ({
    weekNumber: n,
    focus: 'accumulation' as const,
    intensityFactor: 1,
    volumeFactor: 1,
    weekStart: '2026-11-16',
    effectiveWeekStart: '2026-11-16',
    effectiveWeekEnd: '2026-11-22',
    sessionsTarget: 3,
    sessionsDone: 0,
    shiftedWeeks: 0,
    state: 'upcoming' as const,
    ...over,
  });
  const block = (over: Partial<TrainingBlock> = {}): TrainingBlock => ({
    id: 'b1',
    planId: null,
    planName: null,
    kind: 'hypertrophy',
    kindLabel: 'Hipertrofia',
    repRange: '8–12',
    startDate: '2026-11-02',
    weeksTotal: 3,
    status: 'active',
    currentWeek: null,
    nextWeek: null,
    weeks: [
      week(1, { state: 'done', sessionsDone: 3 }),
      week(2, { focus: 'peak', state: 'current', sessionsDone: 1 }),
      week(3, { focus: 'deload', intensityFactor: 0.85, volumeFactor: 0.5 }),
    ],
    deload: { suggested: false, reason: 'insufficient_history' },
    explanation: '',
    ...over,
  });

  it('o estado da tela segue o último bloco', () => {
    expect(blockScreenState(null)).toBe('plan');
    expect(blockScreenState(block())).toBe('active');
    expect(blockScreenState(block({ status: 'completed' }))).toBe('completed');
    expect(blockScreenState(block({ status: 'abandoned' }))).toBe('abandoned');
  });

  it('as semanas do bloco em andamento, com a atual marcada', () => {
    const rows = activeWeekRows(block());
    expect(rows.map((r) => [r.n, r.label, r.current, r.progress])).toEqual([
      [1, 'Acúmulo', false, '3 de 3 sessões'],
      [2, 'Pico', true, '1 de 3 sessões'],
      [3, 'Deload', false, '0 de 3 sessões'],
    ]);
    expect(rows[2]!.deload).toBe(true);
  });

  it('concluído resume; encerrado oferece recomeçar', () => {
    expect(blockStatusCopy(block({ status: 'completed' }))).toEqual({
      title: 'Bloco concluído',
      body: 'Hipertrofia · 3 semanas · 4 de 9 sessões. Monte o próximo quando quiser.',
      cta: 'Montar o próximo bloco',
    });
    expect(blockStatusCopy(block({ status: 'abandoned', planName: 'Push' }))).toEqual({
      title: 'Bloco encerrado antes do fim',
      body: 'Hipertrofia · Push · parou na semana 2 de 3.',
      cta: 'Recomeçar',
    });
  });
});
