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
      team: vi.fn(),
      accessLog: vi.fn(),
      setConsent: vi.fn(),
      leave: vi.fn(),
    },
    benefitsApi: { list: vi.fn() },
  };
});

import { benefitsApi, groupsApi, type TeamMemberView } from '@fatia/api-client';
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
  proPaidByThisGroup: true,
  avatarUrl: null,
  postPolicy: 'ALL_MEMBERS',
  requiredSharingScopes: [],
  visibility: 'PRIVATE',
  timezone: 'America/Sao_Paulo',
  memberCount: 1,
  newPostCount: 0,
  forYouCount: 0,
  challenge: null,
  ...p,
});

const pessoa = (name: string, role: TeamMemberView['role'], p: Partial<TeamMemberView> = {}) => ({
  name,
  role,
  sees: [] as TeamMemberView['sees'],
  lastViewedAt: null,
  ...p,
});

function renderPage(
  g: MyGroup = grupo(),
  team: TeamMemberView[] = [pessoa('Ana', 'OWNER', { sees: ['NUTRITION'] })],
  ativos = 0,
) {
  vi.mocked(groupsApi.get).mockResolvedValue(g);
  vi.mocked(groupsApi.team).mockResolvedValue(team);
  vi.mocked(benefitsApi.list).mockResolvedValue(
    Array.from({ length: ativos }, (_, i) => ({
      id: `b${i}`,
      partnerName: `Parceiro ${i}`,
      logoUrl: null,
      discountText: '10% off',
      kind: 'COUPON' as const,
      couponCode: 'X',
      url: null,
      validUntil: '2026-12-31',
      expired: false,
    })),
  );
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

describe('/community/[groupId]/settings (Cm-04)', () => {
  afterEach(() => vi.clearAllMocks());

  it('mostra quem é a comunidade, o PRO pago e quem olhou', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Academia Demo' })).toBeInTheDocument();
    expect(screen.getByText('Treino e boa comida · fuso São Paulo')).toBeInTheDocument();
    expect(screen.getByText('privada')).toBeInTheDocument();
    expect(screen.getByText('com aprovação')).toBeInTheDocument();
    expect(screen.getByText('você é membro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /A academia paga seu PRO/ })).toHaveAttribute(
      'href',
      '/plan',
    );
    expect(groupsApi.accessLog).toHaveBeenCalledWith({ groupId: 'g1', limit: 5 });
    const acessos = await screen.findByRole('region', { name: 'Quem olhou seus dados' });
    expect(await within(acessos).findByText(/Ana abriu Alimentação/)).toBeInTheDocument();
    // Patrocinada: o avatar na cor da comunidade, igual ao cartão da lista.
    expect(screen.getByText('AD').className).toMatch(/bg-brand/);
  });

  it('sem PRO pago pela comunidade, sem a faixa', async () => {
    renderPage(grupo({ hasAiSeat: false, proPaidByThisGroup: false }));
    await screen.findByRole('heading', { name: 'Academia Demo' });
    expect(screen.queryByText(/A academia paga seu PRO/)).not.toBeInTheDocument();
  });

  it('assento aqui, mas o PRO valendo é da pessoa: sem a faixa e sem "o PRO acaba" ao sair', async () => {
    renderPage(grupo({ hasAiSeat: true, proPaidByThisGroup: false }));
    await screen.findByRole('heading', { name: 'Academia Demo' });
    expect(screen.queryByText(/A academia paga seu PRO/)).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Sair da comunidade' }));
    expect(screen.queryByText(/o PRO pago pela academia acaba/)).not.toBeInTheDocument();
  });

  it('a entrada de Benefícios só com benefício valendo', async () => {
    renderPage(grupo(), undefined, 2);
    expect(await screen.findByRole('link', { name: /Benefícios/ })).toHaveAttribute(
      'href',
      '/community/g1/benefits',
    );
    expect(screen.getByText('2 descontos de parceiros')).toBeInTheDocument();
  });

  it('sem benefício, sem a entrada', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Quem olhou seus dados' });
    await waitFor(() => expect(benefitsApi.list).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /Benefícios/ })).not.toBeInTheDocument();
  });

  it('cada categoria grava na hora, partindo do que já tinha', async () => {
    vi.mocked(groupsApi.setConsent).mockResolvedValue({
      groupId: 'g1',
      scopes: ['NUTRITION', 'GOALS'],
      statsOptIn: false,
      consentAt: '2026-10-17T00:00:00Z',
    });
    renderPage();
    expect(await screen.findByRole('switch', { name: 'Alimentação' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('switch', { name: 'Metas' }));
    expect(groupsApi.setConsent).toHaveBeenCalledWith('g1', {
      scopes: ['NUTRITION', 'GOALS'],
      statsOptIn: false,
    });
  });

  it('a equipe por papel, com "viu hoje" e o resto atrás de "Ver toda a equipe"', async () => {
    const hoje = new Date().toISOString();
    renderPage(grupo(), [
      pessoa('Ana', 'OWNER', { sees: ['NUTRITION'], lastViewedAt: hoje }),
      pessoa('Bia', 'PROFESSIONAL'),
      pessoa('Caio', 'PROFESSIONAL'),
      pessoa('Duda', 'CREATOR'),
    ]);
    const equipe = await screen.findByRole('region', { name: 'Equipe da comunidade' });
    expect(await within(equipe).findByText('Ana')).toBeInTheDocument();
    expect(within(equipe).getByText('viu hoje')).toBeInTheDocument();
    expect(
      within(equipe).getByText('1 pessoa pode ver o que você compartilha.'),
    ).toBeInTheDocument();
    expect(within(equipe).queryByText('Duda')).not.toBeInTheDocument();
    await userEvent.click(within(equipe).getByRole('button', { name: 'Ver toda a equipe (4)' }));
    expect(within(equipe).getByText('Duda')).toBeInTheDocument();
  });

  it('a busca filtra a equipe', async () => {
    renderPage(grupo(), [
      pessoa('Ana', 'OWNER'),
      pessoa('Bia', 'PROFESSIONAL'),
      pessoa('Caio', 'PROFESSIONAL'),
      pessoa('Duda', 'CREATOR'),
    ]);
    await userEvent.type(await screen.findByLabelText('Buscar na equipe'), 'duda');
    expect(screen.getByText('Duda')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('sair pede confirmação, avisa do PRO e volta à lista', async () => {
    vi.mocked(groupsApi.leave).mockResolvedValue({
      membershipId: 'm1',
      groupId: 'g1',
      status: 'LEFT',
      role: 'MEMBER',
      revokedLinks: 1,
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Sair da comunidade' }));
    expect(screen.getByText(/o PRO pago pela academia acaba/)).toBeInTheDocument();
    expect(groupsApi.leave).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/community'));
  });

  it('pedido pendente: sem equipe nem consentimento editável, e dá para cancelar', async () => {
    renderPage(grupo({ status: 'INVITED', hasAiSeat: false, proPaidByThisGroup: false }));
    expect(await screen.findByText(/aguardando o dono aprovar/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(groupsApi.team).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();
  });

  it('o dono não tem botão de sair, e abre o painel daqui', async () => {
    renderPage(grupo({ role: 'OWNER' }));
    expect(await screen.findByText(/transfira-a pelo painel/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sair da comunidade' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir painel/ })).toHaveAttribute('href', '/org/g1');
  });

  it('membro comum não vê o painel', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Sair da comunidade' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Abrir painel/ })).not.toBeInTheDocument();
  });

  it('membro: o obrigatório que já compartilha fica travado, e o 409 mostra a frase da API', async () => {
    vi.mocked(groupsApi.setConsent).mockRejectedValue(
      new ApiError('Metas é obrigatório nesta comunidade. Para parar de compartilhar, saia.', 409),
    );
    renderPage(grupo({ requiredSharingScopes: ['NUTRITION', 'GOALS'] }));
    expect(await screen.findByRole('switch', { name: 'Alimentação' })).toBeDisabled();
    const metas = screen.getByRole('switch', { name: 'Metas' });
    expect(metas).toBeEnabled();
    await userEvent.click(metas);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Para parar de compartilhar, saia/);
  });

  it('a equipe não tem o obrigatório travado', async () => {
    renderPage(grupo({ role: 'PROFESSIONAL', requiredSharingScopes: ['NUTRITION'] }));
    expect(await screen.findByRole('switch', { name: 'Alimentação' })).toBeEnabled();
  });
});
