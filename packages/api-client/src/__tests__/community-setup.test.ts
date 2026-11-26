import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  brandChoice,
  canCreateCommunity,
  challengePublishedText,
  challengeTemplateInput,
  CHALLENGE_TEMPLATES,
  communitySlug,
  emailsFromPaste,
  inviteModeStat,
  inviteModeTitle,
  mondayLabel,
  nextMondayIso,
  nextReportLabel,
  nextSetupItem,
  setupApi,
  setupItemAction,
  setupItemHref,
  setupKicker,
  setupStats,
  whatYouSeeNotes,
  setupItemSub,
  setupPercent,
  sharedCategories,
  teamInviteDeclinedText,
  teamInviteHeadline,
  type CommunitySetup,
} from '../community-setup';
import { groupsApi } from '../community';
import type { InviteOrigins } from '../month-report';
import { configureApiClient, resetApiClient } from '../http';

const fetchMock = vi.fn();

describe('onboarding de quem cria a comunidade (#372)', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('as rotas do checklist levam só o grupo da URL; o corpo não leva id', async () => {
    await setupApi.get('g1');
    await setupApi.setStep('g1', 'PLAN', true);
    await setupApi.setGuide('g1', false);
    await setupApi.slugCheck('Força & Saúde');
    await groupsApi.declineInvite('tok/1');
    const chamadas = (fetchMock.mock.calls as [string, RequestInit][]).map(([url, init]) => ({
      url,
      method: init.method ?? 'GET',
      body: init.body ?? null,
    }));
    expect(chamadas).toEqual([
      { url: '/api/groups/g1/setup', method: 'GET', body: null },
      { url: '/api/groups/g1/setup/steps/PLAN', method: 'PUT', body: '{"done":true}' },
      { url: '/api/groups/g1/setup/guide', method: 'PUT', body: '{"visible":false}' },
      {
        url: '/api/groups/slug-check?name=For%C3%A7a+%26+Sa%C3%BAde',
        method: 'GET',
        body: null,
      },
      { url: '/api/groups/invites/tok%2F1/decline', method: 'POST', body: null },
    ]);
  });

  it('nome e tipo (Onb-C1): endereço sem acento e "Criar" só com tipo e nome', () => {
    expect(communitySlug('Academia Demo')).toBe('academia-demo');
    expect(communitySlug('  Força & Saúde!! ')).toBe('forca-saude');
    expect(communitySlug('AD')).toBe('ad-comunidade');
    expect(communitySlug('')).toBe('comunidade');
    expect(canCreateCommunity(null, 'Academia Demo')).toBe(false);
    expect(canCreateCommunity('gym', 'A')).toBe(false);
    expect(canCreateCommunity('gym', 'AD')).toBe(true);
  });

  it('marca (Onb-C2): contraste ok, tom corrigido com aviso, verde do Fatia recusado', () => {
    expect(brandChoice('#ff7a1a')).toMatchObject({ color: '#ff7a1a', warning: null });
    const roxo = brandChoice('#7c5cff');
    expect(roxo.color).not.toBe('#7c5cff');
    expect(roxo.warning).toBe(
      `Essa cor não dá 4,5:1 nem com texto branco nem com escuro. Usamos ${roxo.color!.toUpperCase()}, um pouco mais escura.`,
    );
    const verde = brandChoice('#2ce500');
    expect(verde.color).toBeNull();
    expect(verde.warning).toMatch(/verde do Fatia/);
  });

  it('checklist: subtítulo, próximo, botão e barra', () => {
    const s: CommunitySetup = {
      kind: 'GYM',
      items: [
        { key: 'CREATE', done: true, auto: true },
        { key: 'BRAND', done: true, auto: true },
        { key: 'CATEGORIES', done: true, auto: false },
        { key: 'TEAM', done: false, auto: false },
      ],
      done: 3,
      total: 9,
      complete: false,
      visible: true,
      brandPending: false,
    };
    expect(nextSetupItem(s)).toBe('TEAM');
    expect(setupPercent(s)).toBe('33%');
    expect(s.items.map(setupItemAction)).toEqual(['done', 'done', 'undo', 'do']);
    expect(setupItemSub('CREATE', { slug: 'academia-demo', kind: 'GYM', type: 'SPONSORED' })).toBe(
      'Academia · fat.ia.br/academia-demo',
    );
    expect(setupItemSub('CREATE', { slug: 'g', kind: null, type: 'SOCIAL' })).toBe(
      'Influencer ou grupo · fat.ia.br/g',
    );
    expect(
      setupItemSub('CATEGORIES', {
        slug: 'x',
        kind: 'GYM',
        type: 'SPONSORED',
        requiredSharingScopes: ['WORKOUT'],
      }),
    ).toBe('Treino');
    expect(nextReportLabel(new Date(2026, 10, 25))).toBe('1º dez');
  });

  it('primeiro desafio (Onb-C5): Constância 30 dias, segunda ou hoje, push opcional', () => {
    const t = CHALLENGE_TEMPLATES[0]!;
    expect(t.title).toBe('Constância 30 dias');
    // 2026-11-26 é quinta: a próxima segunda é 30/11; numa segunda, a seguinte.
    expect(nextMondayIso('2026-11-26')).toBe('2026-11-30');
    expect(nextMondayIso('2026-11-30')).toBe('2026-12-07');
    expect(mondayLabel('2026-11-10')).toBe('Segunda, 10 nov');
    expect(challengeTemplateInput(t, '2026-11-30', false)).toEqual({
      title: 'Constância 30 dias',
      description: t.description,
      kind: 'METRIC',
      metric: 'ACTIVE_DAYS',
      startDate: '2026-11-30',
      endDate: '2026-12-29',
      notify: false,
    });
    expect(challengePublishedText(t, 'hoje', true)).toBe(
      'Constância 30 dias começa hoje. Todos os membros recebem o aviso.',
    );
  });

  it('convidar (Onb-C4): contagem do modo com a regra dos 5 e a lista colada', () => {
    const origins: InviteOrigins = {
      days: 30,
      joined: 15,
      activated: 10,
      percent: 66,
      rows: [
        {
          key: 'a',
          origin: 'QR',
          label: 'Recepção',
          kind: 'qr',
          joined: 12,
          activated: 9,
          percent: 75,
        },
        {
          key: 'b',
          origin: null,
          label: null,
          kind: 'link',
          joined: 3,
          activated: 1,
          percent: null,
        },
      ],
    };
    expect(inviteModeStat(origins, 'qr', 'recepção')).toEqual({ joined: 12, activated: 9 });
    expect(inviteModeStat(origins, 'link', '')).toBeNull();
    expect(inviteModeStat(origins, 'list', '')).toBeNull();
    expect(inviteModeTitle('qr', 'recepção')).toBe('QR · recepção');
    expect(emailsFromPaste('ana@email.com\nBia@Email.com; ana@email.com, nada\n')).toEqual([
      'ana@email.com',
      'bia@email.com',
    ]);
  });

  it('profissional (Onb-E1, E2): convite, recusa e o que cada aluno liberou', () => {
    expect(teamInviteHeadline('Bruno Lima')).toBe('Bruno te convidou para a equipe');
    expect(teamInviteDeclinedText('Bruno Lima')).toBe(
      'Bruno vai ver que você recusou. Se mudar de ideia, peça um novo convite.',
    );
    expect(sharedCategories(['WORKOUT', 'HABITS'])).toEqual([
      { label: 'treino', shared: true },
      { label: 'alimentação · bloqueado', shared: false },
      { label: 'peso e medidas · bloqueado', shared: false },
      { label: 'água e passos', shared: true },
      { label: 'metas · bloqueado', shared: false },
    ]);
  });

  it('painel (Onb-Criador-Web, Pn-21d): cada item leva à tela dele', () => {
    expect(setupItemHref('g1', 'CREATE')).toBe('/org/g1/settings');
    expect(setupItemHref('g1', 'BRAND')).toBe('/community/new/g1');
    expect(setupItemHref('g1', 'TEAM')).toBe('/org/g1/team');
    expect(setupItemHref('g1', 'MEMBERS')).toBe('/org/g1/invites');
    expect(setupItemHref('g1', 'CHALLENGE')).toBe('/org/g1/challenges/first');
    expect(setupItemHref('g1', 'PLAN')).toBe('/org/g1/content');
    expect(setupItemHref('g1', 'EQUIPMENT')).toBe('/org/g1/exercises');
    expect(setupItemHref('g1', 'ACCESS')).toBe('/org/g1/settings');
    const hoje = new Date(2026, 10, 25, 15);
    expect(setupKicker(new Date(2026, 10, 25, 9).toISOString(), hoje)).toBe(
      'Comunidade criada hoje',
    );
    expect(setupKicker(new Date(2026, 10, 24, 23).toISOString(), hoje)).toBe(
      'Comunidade criada ontem',
    );
    expect(setupKicker(new Date(2026, 10, 20).toISOString(), hoje)).toBe(
      'Comunidade criada há 5 dias',
    );
    expect(setupKicker(new Date(2026, 8, 1).toISOString(), hoje)).toBe('Guia de primeiros passos');
  });

  it('os 4 números: vazios com a regra dos 5, cheios na comunidade ativa', () => {
    const agora = new Date(2026, 10, 25);
    expect(
      setupStats({
        activeMembers: 2,
        active7d: { value: null, percent: null },
        review: 0,
        risk: 0,
        riskDays: 10,
        first: true,
        now: agora,
      }),
    ).toEqual([
      { key: 'active', label: 'Ativos em 7 dias', value: '—', sub: 'aparece com 5 membros' },
      { key: 'review', label: 'Para revisar', value: '0', sub: 'treinos dos membros caem aqui' },
      { key: 'risk', label: 'Em risco', value: '0', sub: 'quem sumir aparece aqui' },
      { key: 'report', label: 'Relatório', value: '1º dez', sub: 'primeiro envio' },
    ]);
    expect(
      setupStats({
        activeMembers: 124,
        active7d: { value: 97, percent: 78 },
        review: 6,
        risk: 9,
        riskDays: 10,
        first: false,
        now: agora,
      }).map((c) => [c.value, c.sub]),
    ).toEqual([
      ['78%', '97 de quem compartilha estatísticas'],
      ['6', 'esperando você'],
      ['9', 'sem registro há 10 dias'],
      ['1º dez', 'próximo envio'],
    ]);
  });

  it('o que você vê: o registro do acesso leva o nome de quem abre', () => {
    expect(whatYouSeeNotes('Helena Souza')[0]).toEqual({
      icon: 'eye',
      title: 'Cada acesso fica registrado',
      body: 'O aluno vê "Helena abriu sua ficha · 09:12"',
    });
    expect(whatYouSeeNotes(null)[0]!.body).toBe('O aluno vê "Você abriu sua ficha · 09:12"');
  });
});
