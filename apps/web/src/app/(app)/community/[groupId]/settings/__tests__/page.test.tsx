import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type MyGroup } from '@fatia/api-client';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  useParams: () => ({ groupId: 'g1' }),
  usePathname: () => '/community/g1/settings',
}));
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
import CommunitySettingsPage from '../page';

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
  avatarUrl: null,
  postPolicy: 'ALL_MEMBERS',
  requiredSharingScopes: [],
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
      <CommunitySettingsPage />
    </QueryClientProvider>,
  );
}

describe('/community/[groupId]/settings', () => {
  afterEach(() => vi.clearAllMocks());

  it('mostra a comunidade, a equipe, o assento e quem acessou', async () => {
    renderPage();
    expect(await screen.findByText('Treino e boa comida')).toBeInTheDocument();
    // A barra diz "Sobre a comunidade" (mapa de rotas); o nome vem no corpo.
    expect(screen.getByRole('heading', { name: 'Academia Demo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /A comunidade paga seu PRO/ })).toHaveAttribute(
      'href',
      '/plan',
    );
    // Desafios e Planos e dicas são abas do mural, não moram aqui.
    expect(
      screen.queryByRole('navigation', { name: 'Seções da comunidade' }),
    ).not.toBeInTheDocument();
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

  it('o dono não tem botão de sair, e abre o painel daqui', async () => {
    renderPage(grupo({ role: 'OWNER' }));
    expect(await screen.findByText(/transfira-a pelo painel/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sair da comunidade' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir painel/ })).toHaveAttribute(
      'href',
      `/org/${grupo().id}`,
    );
  });

  it('membro comum não vê o painel', async () => {
    renderPage(grupo({ role: 'MEMBER' }));
    expect(await screen.findByRole('button', { name: 'Sair da comunidade' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Abrir painel/ })).not.toBeInTheDocument();
  });

  it('membro: o obrigatório que já compartilha fica travado, e o 409 mostra a frase da API', async () => {
    vi.mocked(groupsApi.setConsent).mockRejectedValue(
      new ApiError(
        'Alimentação é obrigatório nesta comunidade. Para parar de compartilhar, saia da comunidade.',
        409,
      ),
    );
    renderPage(grupo({ requiredSharingScopes: ['NUTRITION', 'GOALS'] }));
    const alimentacao = await screen.findByRole('checkbox', { name: /Alimentação/ });
    expect(alimentacao).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Metas/ })).toBeEnabled();
    expect(
      screen.getByText(/Para participar como membro: compartilhar alimentação e metas/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Para parar de compartilhar, saia/);
  });

  it('a equipe não tem o obrigatório travado', async () => {
    renderPage(grupo({ role: 'PROFESSIONAL', requiredSharingScopes: ['NUTRITION'] }));
    expect(await screen.findByRole('checkbox', { name: /Alimentação/ })).toBeEnabled();
  });
});
