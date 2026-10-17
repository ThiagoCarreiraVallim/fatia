import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup } from '@fatia/api-client';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  useParams: () => ({ groupId: 'g1' }),
}));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: {
      get: vi.fn(),
      members: vi.fn(),
      accessLog: vi.fn(),
      setConsent: vi.fn(),
      leave: vi.fn(),
    },
  };
});

import { groupsApi } from '@fatia/api-client';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import CommunityDetailPage from '../page';

const grupo = (p: Partial<MyGroup> = {}): MyGroup => ({
  id: 'g1',
  type: 'SPONSORED',
  name: 'Academia Demo',
  slug: 'academia-demo',
  description: 'Treino e boa comida',
  joinPolicy: 'APPROVAL',
  role: 'MEMBER',
  status: 'ACTIVE',
  membershipId: 'm1',
  joinedAt: '2026-10-01T00:00:00Z',
  createdAt: '2026-09-01T00:00:00Z',
  consentScopes: ['NUTRITION'],
  statsOptIn: false,
  hasAiSeat: true,
  ...p,
});

function renderPage(g: MyGroup = grupo()) {
  vi.mocked(groupsApi.get).mockResolvedValue(g);
  vi.mocked(groupsApi.members).mockResolvedValue([
    { membershipId: 'mo', name: 'Ana', role: 'OWNER', status: 'ACTIVE', joinedAt: null },
    { membershipId: 'm1', name: 'Eu', role: 'MEMBER', status: 'ACTIVE', joinedAt: null },
  ]);
  vi.mocked(groupsApi.accessLog).mockResolvedValue([
    {
      at: '2026-10-16T13:00:00Z',
      action: 'get_student_progress',
      scope: 'NUTRITION',
      denied: false,
      professionalName: 'Ana',
      groupId: 'g1',
    },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommunityDetailPage />
    </QueryClientProvider>,
  );
}

describe('/community/[groupId]', () => {
  afterEach(() => vi.clearAllMocks());

  it('mostra a comunidade na barra, a equipe, o assento e quem acessou', async () => {
    renderPage();
    expect(await screen.findByText('Treino e boa comida')).toBeInTheDocument();
    expect(useTopBarTitle).toHaveBeenLastCalledWith('Academia Demo');
    expect(screen.getByText('A comunidade paga seu PRO')).toBeInTheDocument();
    expect(await screen.findByText('Dono')).toBeInTheDocument();
    expect(screen.queryByText('Eu')).not.toBeInTheDocument();
    expect(groupsApi.accessLog).toHaveBeenCalledWith({ groupId: 'g1', limit: 20 });
    const acessos = await screen.findByRole('region', { name: /Quem acessou/ });
    expect(within(acessos).getByText('Ana')).toBeInTheDocument();
    expect(within(acessos).getByText('Alimentação')).toBeInTheDocument();
  });

  it('muda o que compartilha partindo do que já tinha', async () => {
    vi.mocked(groupsApi.setConsent).mockResolvedValue({
      groupId: 'g1',
      scopes: ['NUTRITION', 'GOALS'],
      statsOptIn: false,
      consentAt: '2026-10-17T00:00:00Z',
    });
    renderPage();
    expect(await screen.findByRole('checkbox', { name: /Alimentação/ })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: /Metas/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(groupsApi.setConsent).toHaveBeenCalledWith('g1', {
      scopes: ['NUTRITION', 'GOALS'],
      statsOptIn: false,
    });
  });

  it('sair pede confirmação, avisa do assento e volta à lista', async () => {
    vi.mocked(groupsApi.leave).mockResolvedValue({
      membershipId: 'm1',
      groupId: 'g1',
      status: 'LEFT',
      role: 'MEMBER',
      revokedLinks: 1,
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Sair da comunidade' }));
    expect(screen.getByText(/o PRO pago pela comunidade acaba/)).toBeInTheDocument();
    expect(groupsApi.leave).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/community'));
  });

  it('pedido pendente: sem equipe nem consentimento editável, e dá para cancelar', async () => {
    renderPage(grupo({ status: 'INVITED', hasAiSeat: false }));
    expect(await screen.findByText(/aguardando o dono aprovar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(groupsApi.members).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();
  });

  it('o dono não tem botão de sair', async () => {
    renderPage(grupo({ role: 'OWNER' }));
    expect(await screen.findByText(/transfira-a a alguém da equipe/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sair da comunidade' })).not.toBeInTheDocument();
  });
});
