import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@fatia/api-client';
import { grupo } from '@/app/(org)/org/[groupId]/__tests__/helpers';

const nav = vi.hoisted(() => ({ pathname: '/org/g1/members', push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ groupId: 'g1' }),
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: { get: vi.fn() },
    panelApi: { counts: vi.fn(), search: vi.fn(), overview: vi.fn() },
    usersApi: { me: vi.fn() },
    announcementsApi: { settings: vi.fn(), create: vi.fn() },
    setupApi: { ...actual.setupApi, get: vi.fn(), setGuide: vi.fn() },
  };
});

import {
  announcementsApi,
  groupsApi,
  panelApi,
  setupApi,
  usersApi,
  type CommunitySetup,
} from '@fatia/api-client';

const guia = (p: Partial<CommunitySetup> = {}): CommunitySetup => ({
  kind: 'GYM',
  items: [],
  done: 9,
  total: 9,
  complete: true,
  visible: false,
  brandPending: false,
  webUrl: 'http://localhost:3030/org/g1',
  ...p,
});
import { OrgShell, useOrgGroup } from '../org-shell';

function Filho() {
  return <p>{`dentro de ${useOrgGroup().name}`}</p>;
}

function abrir() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrgShell>
        <Filho />
      </OrgShell>
    </QueryClientProvider>,
  );
}

describe('OrgShell', () => {
  beforeEach(() => {
    vi.mocked(panelApi.counts).mockResolvedValue({
      pendingRequests: 2,
      pendingInvites: 7,
      openReports: 1,
      challengeReview: 0,
    });
    vi.mocked(usersApi.me).mockResolvedValue({
      id: 'u1',
      name: 'Bruno Lima',
      email: 'bruno@demo.com',
    } as never);
    vi.mocked(announcementsApi.settings).mockResolvedValue({
      pushWeeklyLimit: 3,
      pushUsedThisWeek: 0,
      emailAvailable: false,
    });
    vi.mocked(setupApi.get).mockResolvedValue(guia());
  });
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    nav.pathname = '/org/g1/members';
  });

  it('dono: menu em grupos com contadores, a atual marcada e a migalha no topo', async () => {
    vi.mocked(groupsApi.get).mockResolvedValue(grupo());
    abrir();
    expect(await screen.findByText('dentro de Academia Demo')).toBeInTheDocument();
    const menu = screen.getByRole('complementary', { name: 'Menu do painel' });
    for (const g of ['Acompanhar', 'Pessoas', 'Conteúdo', 'Comunidade', 'IA']) {
      expect(within(menu).getByRole('button', { name: new RegExp(g) })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    }
    const membros = within(menu).getByRole('link', { name: /Membros/ });
    expect(membros).toHaveAttribute('aria-current', 'page');
    expect(await within(membros).findByText('2')).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: /Assentos e faturas/ })).toHaveAttribute(
      'href',
      '/org/g1/seats',
    );
    expect(within(menu).getByRole('link', { name: 'Configurações' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Ver como membro' })).toHaveAttribute(
      'href',
      '/community/g1',
    );
    const migalha = screen.getByRole('navigation', { name: 'Você está em' });
    expect(migalha).toHaveTextContent('Pessoas');
    expect(within(migalha).getByText('Membros')).toHaveAttribute('aria-current', 'page');
  });

  it('grupo fechado soma os contadores; recolher o menu fica salvo por pessoa e comunidade', async () => {
    const user = userEvent.setup();
    vi.mocked(groupsApi.get).mockResolvedValue(grupo());
    abrir();
    const menu = await screen.findByRole('complementary', { name: 'Menu do painel' });
    await within(menu).findByText('7');
    await user.click(within(menu).getByRole('button', { name: /Pessoas/ }));
    expect(within(menu).queryByRole('link', { name: /Convites/ })).toBeNull();
    expect(within(menu).getByRole('button', { name: /Pessoas/ })).toHaveTextContent('9');
    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('fatia:panel:nav:mo')!)).toEqual({
      collapsed: true,
      closedGroups: ['people'],
    });
  });

  it('⌘K abre a busca e Comunicado abre o editor no painel lateral', async () => {
    const user = userEvent.setup();
    vi.mocked(groupsApi.get).mockResolvedValue(grupo());
    abrir();
    await screen.findByText('dentro de Academia Demo');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('combobox', { name: 'Buscar' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox', { name: 'Buscar' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Comunicado' }));
    const lateral = screen.getByRole('complementary', { name: 'Novo comunicado' });
    expect(within(lateral).getByRole('form', { name: 'Novo comunicado' })).toBeInTheDocument();
    // Com o painel aberto o menu encolhe para os ícones (Pn-01b), sem mudar a preferência.
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toBeInTheDocument();
    expect(window.localStorage.getItem('fatia:panel:nav:mo')).toBeNull();
    await user.click(within(lateral).getByRole('button', { name: 'Fechar painel' }));
    expect(screen.getByRole('button', { name: 'Recolher menu' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Novo comunicado' })).toBeNull();
  });

  it('subpágina: a migalha leva de volta à seção', async () => {
    nav.pathname = '/org/g1/members/m1';
    vi.mocked(groupsApi.get).mockResolvedValue(grupo());
    abrir();
    await screen.findByText('dentro de Academia Demo');
    const migalha = screen.getByRole('navigation', { name: 'Você está em' });
    expect(within(migalha).getByRole('link', { name: 'Membros' })).toHaveAttribute(
      'href',
      '/org/g1/members',
    );
  });

  it.each([
    ['membro comum', () => vi.mocked(groupsApi.get).mockResolvedValue(grupo({ role: 'MEMBER' }))],
    [
      'pedido pendente',
      () =>
        vi
          .mocked(groupsApi.get)
          .mockResolvedValue(grupo({ role: 'PROFESSIONAL', status: 'INVITED' })),
    ],
    [
      'quem não é da comunidade',
      () => vi.mocked(groupsApi.get).mockRejectedValue(new ApiError('Group not found', 404)),
    ],
  ])('%s vê "Painel indisponível", sem o conteúdo', async (_quem, preparar) => {
    preparar();
    abrir();
    expect(await screen.findByText('Painel indisponível')).toBeInTheDocument();
    expect(screen.queryByText(/dentro de/)).toBeNull();
  });

  it('falha da API não vira "sem acesso": diz que falhou e tenta de novo', async () => {
    vi.mocked(groupsApi.get)
      .mockRejectedValueOnce(new ApiError('Erro', 503))
      .mockResolvedValueOnce(grupo());
    abrir();
    expect(await screen.findByText('Não deu para abrir o painel')).toBeInTheDocument();
    expect(screen.queryByText('Painel indisponível')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('dentro de Academia Demo')).toBeInTheDocument();
  });

  it('passos 1 e 2 bloqueiam (#372): sem a marca salva, o painel manda para a Marca', async () => {
    vi.mocked(groupsApi.get).mockResolvedValue(grupo());
    vi.mocked(setupApi.get).mockResolvedValue(
      guia({ complete: false, visible: true, brandPending: true }),
    );
    abrir();
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/community/new/g1'));
  });

  it('"Repetir o guia" no menu do perfil do dono volta o checklist ao Início', async () => {
    vi.mocked(groupsApi.get).mockResolvedValue(grupo());
    vi.mocked(setupApi.setGuide).mockResolvedValue(guia({ visible: true }));
    abrir();
    await screen.findByText('dentro de Academia Demo');
    expect(nav.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Menu do perfil' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Repetir o guia' }));
    expect(setupApi.setGuide).toHaveBeenCalledWith('g1', true);
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith('/org/g1'));
  });

  it('quem não é dono não tem "Repetir o guia" nem pergunta pelo guia', async () => {
    vi.mocked(groupsApi.get).mockResolvedValue(grupo({ role: 'ADMIN' }));
    abrir();
    await screen.findByText('dentro de Academia Demo');
    await userEvent.click(screen.getByRole('button', { name: 'Menu do perfil' }));
    expect(await screen.findByRole('menuitem', { name: 'Meu perfil' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Repetir o guia' })).toBeNull();
    expect(setupApi.get).not.toHaveBeenCalled();
  });
});
