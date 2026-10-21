import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup } from '@fatia/api-client';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/components/layout/app-top-bar', () => ({
  TopBarActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  topBarActionClass: '',
}));
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <section aria-label="drawer">{children}</section> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: Passthrough,
    DrawerDescription: Passthrough,
  };
});
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, groupsApi: { mine: vi.fn(), previewBySlug: vi.fn(), join: vi.fn() } };
});

import { ApiError, groupsApi } from '@fatia/api-client';
import { toast } from 'sonner';
import CommunityPage from '../page';

const grupo = (p: Partial<MyGroup>): MyGroup => ({
  id: 'g1',
  type: 'SPONSORED',
  name: 'Academia Demo',
  slug: 'academia-demo',
  description: null,
  joinPolicy: 'APPROVAL',
  role: 'MEMBER',
  status: 'ACTIVE',
  membershipId: 'm1',
  joinedAt: '2026-10-01T00:00:00Z',
  createdAt: '2026-09-01T00:00:00Z',
  consentScopes: [],
  statsOptIn: false,
  hasAiSeat: false,
  avatarUrl: null,
  postPolicy: 'ALL_MEMBERS',
  requiredSharingScopes: [],
  ...p,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommunityPage />
    </QueryClientProvider>,
  );
}

describe('/community', () => {
  afterEach(() => vi.clearAllMocks());

  it('lista com papel, pedido pendente e o selo do PRO pago pela comunidade', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([
      grupo({ hasAiSeat: true }),
      grupo({ id: 'g2', name: 'Corrida do Bairro', status: 'INVITED' }),
    ]);
    renderPage();
    const academia = await screen.findByRole('link', { name: /Academia Demo/ });
    expect(academia).toHaveAttribute('href', '/community/g1');
    expect(academia).toHaveTextContent('PRO');
    expect(screen.getByRole('link', { name: /Corrida do Bairro/ })).toHaveTextContent(
      'Membro · Aguardando aprovação',
    );
  });

  it('entra pelo código: procura, escolhe o que compartilhar e vai à comunidade', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([]);
    vi.mocked(groupsApi.previewBySlug).mockResolvedValue({
      id: 'g1',
      type: 'SOCIAL',
      name: 'Academia Demo',
      slug: 'academia-demo',
      memberCount: 3,
      description: null,
      joinPolicy: 'APPROVAL',
      team: [{ name: 'Ana', role: 'OWNER' }],
      requiredSharingScopes: [],
    });
    vi.mocked(groupsApi.join).mockResolvedValue({
      membershipId: 'm1',
      groupId: 'g1',
      status: 'INVITED',
      role: 'MEMBER',
      revokedLinks: 0,
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /^Entrar com código$/ }));
    await userEvent.type(screen.getByLabelText('Código da comunidade'), ' Academia-Demo ');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(groupsApi.previewBySlug).toHaveBeenCalledWith('academia-demo');

    await userEvent.click(await screen.findByRole('checkbox', { name: /Metas/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Pedir para entrar' }));
    expect(groupsApi.join).toHaveBeenCalledWith('academia-demo', {
      scopes: ['GOALS'],
      statsOptIn: false,
    });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/community/g1'));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/quando o dono aprovar/));
  });

  it('código inexistente (ou comunidade só por convite) diz que não achou', async () => {
    vi.mocked(groupsApi.mine).mockResolvedValue([]);
    vi.mocked(groupsApi.previewBySlug).mockRejectedValue(new ApiError('Group not found', 404));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /^Entrar com código$/ }));
    await userEvent.type(screen.getByLabelText('Código da comunidade'), 'nada');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nenhuma comunidade com esse código.',
    );
  });
});
