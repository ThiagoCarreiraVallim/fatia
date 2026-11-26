import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_SESSION_ROUTES,
  demoApi,
  demoBannerText,
  demoCards,
  demoMenuLabel,
  demoSessionExpiry,
  demoSessionPath,
  demoSessionRequest,
  demoTokenFromUrl,
  isDemoSessionToken,
  demoShortcuts,
  demoStats,
  demoStudentLine,
  firstStepsSummary,
  SMALL_SAMPLE_LABEL,
  type DemoSummary,
} from '../community-demo';
import { activePanelSection, panelHref, panelSections } from '../community-panel';
import { panelBreadcrumb, panelFooterLabel, panelFooterSections } from '../panel-shell';
import { configureApiClient, resetApiClient } from '../http';

const fetchMock = vi.fn();
const pedido = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { method: init.method ?? 'GET', url };
};

const ANA: DemoSummary = {
  groupId: 'demo-1',
  name: 'Academia Exemplo',
  brandColor: '#2563eb',
  createdAt: '2026-11-25T12:00:00.000Z',
  student: {
    userId: 'ana',
    membershipId: 'm-ana',
    name: 'Ana Exemplo',
    joinedAt: '2026-11-11T13:00:00.000Z',
  },
  plan: { title: 'Hipertrofia A/B', weekNumber: 2, weeks: 4, sessionsDone: 6, sessionsPlanned: 16 },
  weight: { kg: 70.2, loggedAt: '2026-11-24T10:00:00.000Z', deltaKg: -2.5 },
  today: { kcal: 1066, kcalGoal: 1840, waterMl: 1500, waterGoalMl: 2000 },
  challenge: { id: 'c1', title: 'Constância 30 dias' },
};

describe('comunidade de demonstração (#412, Pn-21)', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('as rotas da demo são da pessoa, sem id no corpo', async () => {
    await demoApi.get();
    await demoApi.create();
    await demoApi.remove();
    await demoApi.openSession();
    await demoApi.firstSteps('g1');
    expect(fetchMock.mock.calls.map((_, i) => pedido(i))).toEqual([
      { method: 'GET', url: '/api/groups/demo' },
      { method: 'POST', url: '/api/groups/demo' },
      { method: 'DELETE', url: '/api/groups/demo' },
      { method: 'POST', url: '/api/groups/demo/session' },
      { method: 'GET', url: '/api/groups/g1/first-steps' },
    ]);
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(init.body).toBeUndefined();
    }
  });

  it('o item do menu vira "Primeiros passos" quando a comunidade fica ativa (Pn-21d)', () => {
    expect(demoMenuLabel(null)).toBe('Demonstração');
    expect(demoMenuLabel({ active: false })).toBe('Demonstração');
    expect(demoMenuLabel({ active: true })).toBe('Primeiros passos');
    expect(panelFooterLabel('demo')).toBe('Demonstração');
    expect(panelFooterLabel('demo', { communityActive: true })).toBe('Primeiros passos');
  });

  it('só a dona vê o item, no rodapé antes de Novidades, e não dentro da própria demo', () => {
    expect(panelSections('OWNER').map((s) => s.section)).toContain('demo');
    for (const role of ['ADMIN', 'PROFESSIONAL', 'RECEPTION'] as const) {
      expect(panelSections(role).map((s) => s.section)).not.toContain('demo');
    }
    expect(panelFooterSections({ role: 'OWNER', isDemo: false })).toEqual([
      'demo',
      'updates',
      'integrations',
      'settings',
    ]);
    expect(panelFooterSections({ role: 'OWNER', isDemo: true })).not.toContain('demo');
    expect(panelFooterSections({ role: 'ADMIN' })).toEqual(['updates', 'settings']);
    expect(panelHref('g1', 'demo')).toBe('/org/g1/demo');
    expect(activePanelSection('/org/g1/demo')).toBe('demo');
  });

  it('a migalha é "Início › Demonstração", e dentro da demo "Demonstração › Academia Exemplo"', () => {
    expect(panelBreadcrumb('/org/g1/demo')).toEqual({ group: 'Início', label: 'Demonstração' });
    expect(panelBreadcrumb('/org/g1/demo', { communityActive: true })).toEqual({
      group: 'Início',
      label: 'Primeiros passos',
    });
    expect(panelBreadcrumb('/org/demo-1', { demoName: 'Academia Exemplo' })).toEqual({
      group: 'Demonstração',
      label: 'Academia Exemplo',
    });
    // Fora da Visão geral da demo, a migalha é a de sempre.
    expect(panelBreadcrumb('/org/demo-1/members', { demoName: 'Academia Exemplo' })).toEqual({
      group: 'Pessoas',
      label: 'Membros',
    });
  });

  it('os cartões do Pn-21 batem com a Ana: plano, peso e desafio', () => {
    expect(demoCards(ANA)).toEqual([
      { key: 'student', icon: 'users', title: 'Ana Exemplo', sub: 'aluna fictícia, já preenchida' },
      {
        key: 'plan',
        icon: 'dumbbell',
        title: 'Hipertrofia A/B',
        sub: 'semana 2 de 4 · 6 de 16 sessões',
      },
      { key: 'weight', icon: 'ruler', title: '70,2 kg', sub: '−2,5 kg em 30 dias' },
      {
        key: 'challenge',
        icon: 'trophy',
        title: 'Constância 30 dias',
        sub: 'desafio em andamento',
      },
    ]);
  });

  it('os números da Ana dentro da demo (Pn-21b), com Água no lugar de Hábitos', () => {
    expect(demoStats(ANA).map((s) => [s.label, s.value, s.sub])).toEqual([
      ['Treinos', '6', 'de 16 no plano'],
      ['Kcal hoje', '1.066', 'meta de 1.840'],
      ['Peso', '70,2 kg', '−2,5 kg em 30 dias'],
      ['Água', '1,5 L', 'de 2,0 L hoje'],
    ]);
    expect(demoStudentLine(ANA, new Date('2026-11-25T13:00:00.000Z'))).toBe(
      'aluna fictícia · entrou há 14 dias · compartilha Treino, Alimentação e Corpo',
    );
  });

  it('"Experimente" leva para as telas de verdade, dentro da demo', () => {
    expect(demoShortcuts(ANA).map((s) => [s.label, s.href])).toEqual([
      ['Enviar um plano para a Ana', '/org/demo-1/send?membro=m-ana'],
      ['Abrir a ficha da Ana', '/org/demo-1/members/m-ana'],
      ['Revisar os treinos da semana', '/org/demo-1/review'],
      ['Postar um aviso no mural', '/org/demo-1/announcements'],
    ]);
    expect(SMALL_SAMPLE_LABEL).toBe('amostra pequena demais para mostrar');
  });

  it('faixa, primeiros passos e a sessão do app', () => {
    expect(demoBannerText('Academia Demo')).toBe(
      'Nada do que você fizer aqui aparece na Academia Demo.',
    );
    expect(
      firstStepsSummary({ active: true, activeMembers: 124, done: 9, total: 9 }, 'Academia Demo'),
    ).toEqual({ title: 'Academia Demo está ativa', sub: '124 membros · 9 de 9 passos feitos' });
    expect(
      firstStepsSummary({ active: false, activeMembers: 1, done: 3, total: 8 }, 'Academia Demo'),
    ).toEqual({
      title: 'Academia Demo está começando',
      sub: '1 membro · 3 de 8 passos feitos',
    });
    expect(demoSessionPath('fatia_demo_abc')).toBe('/demo/fatia_demo_abc');
    const agora = new Date('2026-11-25T12:00:00.000Z');
    expect(demoSessionExpiry('2026-11-25T12:30:00.000Z', agora)).toBe('vale por 30 min');
  });
});

describe('sessão da demo fora do painel (web e app)', () => {
  const TOKEN = 'fatia_demo_' + 'aB3'.repeat(10) + 'xy';

  it('reconhece o token da demo e nada mais', () => {
    expect(isDemoSessionToken(TOKEN)).toBe(true);
    expect(isDemoSessionToken('fatia_demo_curto')).toBe(false);
    expect(isDemoSessionToken('eyJhbGciOi.jwt.qualquer')).toBe(false);
    expect(isDemoSessionToken(`${TOKEN}/../x`)).toBe(false);
    expect(isDemoSessionToken(undefined)).toBe(false);
  });

  it('tira o token do link universal, do esquema do app e do caminho', () => {
    expect(demoTokenFromUrl(`https://app.fat.ia.br/demo/${TOKEN}`)).toBe(TOKEN);
    expect(demoTokenFromUrl(`fatia://demo/${TOKEN}?x=1`)).toBe(TOKEN);
    expect(demoTokenFromUrl(`/demo/${TOKEN}/`)).toBe(TOKEN);
    expect(demoTokenFromUrl(`/c/${TOKEN}`)).toBeNull();
    expect(demoTokenFromUrl('/demo/qualquer-coisa')).toBeNull();
  });

  it('o pedido é só GET, só das rotas do Hoje e com o token como Bearer', () => {
    const req = demoSessionRequest('https://api.fat.ia.br/', TOKEN, 'dashboard/today');
    expect(req).toEqual({
      url: 'https://api.fat.ia.br/api/dashboard/today',
      init: {
        method: 'GET',
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
      },
    });
    expect(demoSessionRequest('https://api', TOKEN, 'users/me/export')).toBeNull();
    expect(demoSessionRequest('https://api', TOKEN, 'users/me/inbox')).toBeNull();
    expect(DEMO_SESSION_ROUTES).toEqual(['dashboard/today', 'users/me']);
    expect(demoSessionRequest('https://api', 'eyJ.jwt', 'users/me')).toBeNull();
  });
});
