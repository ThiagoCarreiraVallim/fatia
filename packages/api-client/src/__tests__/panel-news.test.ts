import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDEA_AREAS, ideasApi, panelNewsApi, panelUnreadLabel } from '../you';
import { groupCan, ROLE_ACTIONS } from '../community';
import { activePanelSection, panelHref, panelSections } from '../community-panel';
import { PANEL_FOOTER_SECTIONS, panelBreadcrumb, panelFooterLabel } from '../panel-shell';
import { configureApiClient, resetApiClient } from '../http';

const fetchMock = vi.fn();
const pedido = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    method: init.method ?? 'GET',
    url,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
};

describe('novidades do painel e ideias da equipe (#413, Pn-27)', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('lê e marca as novidades do painel, não as do aluno', async () => {
    await panelNewsApi.list();
    await panelNewsApi.markRead(['painel-integracoes']);
    await panelNewsApi.markRead();
    expect(pedido(0)).toMatchObject({ method: 'GET', url: '/api/panel/news' });
    expect(pedido(1)).toEqual({
      method: 'POST',
      url: '/api/panel/news/read',
      body: { ids: ['painel-integracoes'] },
    });
    expect(pedido(2).body).toEqual({});
  });

  it('a ideia da equipe leva a área; a do aluno segue sem', async () => {
    await ideasApi.send('Relatório por unidade', 'REPORT');
    await ideasApi.send('Gráfico de sono');
    expect(pedido(0)).toEqual({
      method: 'POST',
      url: '/api/feedback/ideas',
      body: { body: 'Relatório por unidade', area: 'REPORT' },
    });
    expect(pedido(1).body).toEqual({ body: 'Gráfico de sono' });
    expect(IDEA_AREAS.map((a) => [a.value, a.label])).toEqual([
      ['COMMUNITY', 'Comunidade'],
      ['MEMBERS', 'Membros'],
      ['PLANS', 'Planos'],
      ['REPORT', 'Relatório'],
    ]);
  });

  it('o selo do contador: não lidas ou tudo lido', () => {
    expect(panelUnreadLabel(3)).toBe('3 não lidas');
    expect(panelUnreadLabel(1)).toBe('1 não lida');
    expect(panelUnreadLabel(0)).toBe('tudo lido');
  });
});

describe('menu do painel: Novidades e Integrações no rodapé (#413)', () => {
  it('Novidades para toda a equipe; Integrações só para o dono', () => {
    const de = (r: Parameters<typeof panelSections>[0]) => panelSections(r).map((s) => s.section);
    for (const r of ['OWNER', 'ADMIN', 'PROFESSIONAL', 'RECEPTION'] as const) {
      expect(de(r)).toContain('updates');
    }
    expect(de('OWNER')).toContain('integrations');
    for (const r of ['ADMIN', 'PROFESSIONAL', 'RECEPTION'] as const) {
      expect(de(r)).not.toContain('integrations');
    }
    expect(de('MEMBER')).toEqual([]);
  });

  it('o rodapé na ordem da prancha, com os nomes', () => {
    expect(PANEL_FOOTER_SECTIONS).toEqual(['updates', 'integrations', 'settings']);
    expect(PANEL_FOOTER_SECTIONS.map(panelFooterLabel)).toEqual([
      'Novidades',
      'Integrações',
      'Configurações',
    ]);
  });

  it('caminhos e migalhas: Configurações › Integrações e Início › Novidades', () => {
    expect(panelHref('g1', 'integrations')).toBe('/org/g1/integrations');
    expect(panelHref('g1', 'updates')).toBe('/org/g1/updates');
    expect(activePanelSection('/org/g1/integrations')).toBe('integrations');
    expect(panelBreadcrumb('/org/g1/integrations')).toEqual({
      group: 'Configurações',
      label: 'Integrações',
    });
    expect(panelBreadcrumb('/org/g1/updates')).toEqual({ group: 'Início', label: 'Novidades' });
  });

  it('integration.manage é só do dono, no espelho da matriz', () => {
    expect(ROLE_ACTIONS.OWNER).toContain('integration.manage');
    expect(groupCan({ role: 'ADMIN' }, 'integration.manage')).toBe(false);
    expect(groupCan({ role: 'OWNER' }, 'integration.manage')).toBe(true);
  });
});
