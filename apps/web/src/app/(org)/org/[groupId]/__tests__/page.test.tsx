import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup } from '@fatia/api-client';
import { assentos, grupo, membro, renderWithClient } from './helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('@/components/org/insights-card', () => ({
  InsightsCard: ({ title }: { title: string }) => <section>{`painel ${title}`}</section>,
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: { members: vi.fn(), invites: vi.fn() },
    seatsApi: { get: vi.fn() },
    insightsApi: { panels: vi.fn() },
  };
});

import { insightsApi, orgApi, seatsApi } from '@fatia/api-client';
import OrgOverviewPage from '../page';

function abrir(g: MyGroup, behavior = false) {
  ctx.group = g;
  vi.mocked(orgApi.members).mockResolvedValue([
    membro({ name: 'Bruno', role: 'OWNER' }),
    membro({ name: 'Carla', scopesGrantedToMe: ['WORKOUT'] }),
    membro({ name: 'Diego' }),
    membro({ name: 'Márcia', status: 'INVITED' }),
  ]);
  vi.mocked(orgApi.invites).mockResolvedValue([]);
  vi.mocked(seatsApi.get).mockResolvedValue(assentos());
  vi.mocked(insightsApi.panels).mockResolvedValue({ retention: true, behavior });
  return renderWithClient(<OrgOverviewPage />);
}

describe('painel › visão geral', () => {
  afterEach(() => vi.clearAllMocks());

  it('o dono vê os números, os assentos e a retenção; comportamento só com o add-on', async () => {
    abrir(grupo(), false);
    expect(await screen.findByText('Membros ativos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pedidos aguardando/ })).toHaveAttribute(
      'href',
      '/org/g1/members?filtro=pending',
    );
    expect(await screen.findByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('painel Retenção')).toBeInTheDocument();
    expect(screen.queryByText('painel Comportamento')).toBeNull();
  });

  it('com o add-on, o painel de comportamento aparece', async () => {
    abrir(grupo(), true);
    expect(await screen.findByText('painel Comportamento')).toBeInTheDocument();
  });

  it('o profissional não pede assentos nem agregados', async () => {
    abrir(grupo({ role: 'PROFESSIONAL' }));
    expect(await screen.findByText('Convites abertos')).toBeInTheDocument();
    expect(screen.queryByText(/painel/)).toBeNull();
    expect(seatsApi.get).not.toHaveBeenCalled();
    expect(insightsApi.panels).not.toHaveBeenCalled();
  });
});
